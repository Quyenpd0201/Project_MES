// backend/controllers/productionController.js
const db = require('../../core/db');
const { buildSpecKey, legacyAttrs, specsFromBody } = require('../../core/lib/specs');
const { upUnit } = require('../../core/lib/units');
const { guardDelete } = require('../../core/lib/deleteGuard');
const { getDataScope } = require('../../core/dataScope');

// Công đoạn cuối của 1 lệnh: 'Cắt' nếu có task Cắt, ngược lại 'Thổi'
const FINAL_STAGE = `(CASE WHEN EXISTS (SELECT 1 FROM production_tasks tf WHERE tf.production_order_id = po.id AND tf.stage = 'Cắt') THEN 'Cắt' ELSE 'Thổi' END)`;

// GET /api/production/machine-availability — độ sẵn sàng của máy (tải công việc chưa hoàn thành)
exports.machineAvailability = async (_req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT m.id, m.name, m.factory, m.machine_type, m.status,
        (SELECT COUNT(*)::int FROM production_tasks t
           WHERE t.machine_id = m.id AND t.status NOT IN ('Hoàn thành','Đã hủy')) AS load
      FROM machines m WHERE m.is_deleted = FALSE
      ORDER BY m.factory, m.name`);
    res.json({ data: rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi kiểm tra máy' }); }
};

// GET /api/machines/:id/orders — các phân công/lệnh đã chạy trên 1 máy (chỉ xem)
exports.byMachine = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT t.id, t.stage, t.quantity, t.status, t.planned_date, t.shift,
             po.id AS production_order_id, po.order_code, p.product_code, p.product_name
      FROM production_tasks t
      JOIN production_orders po ON po.id = t.production_order_id AND po.is_deleted = FALSE
      LEFT JOIN products p ON p.id = po.product_id
      WHERE t.machine_id = $1
      ORDER BY t.planned_date DESC NULLS LAST, po.order_code`, [req.params.id]);
    res.json({ data: rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy lệnh theo máy' }); }
};

const SELECT_JOIN = `
  SELECT po.*,
         p.product_name, p.product_code,
         c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address,
         m.name AS machine_name, m.factory AS machine_factory,
         so.order_code AS sales_order_code,
         (SELECT COUNT(*)::int FROM production_tasks t WHERE t.production_order_id = po.id) AS task_count,
         (SELECT COUNT(*)::int FROM production_tasks t WHERE t.production_order_id = po.id AND t.status = 'Hoàn thành') AS task_done,
         COALESCE((SELECT SUM(COALESCE(t.actual_qty, t.quantity)) FROM production_tasks t
                   WHERE t.production_order_id = po.id AND t.status = 'Hoàn thành'
                     AND t.stage = ${FINAL_STAGE}), 0) AS produced_qty,
         COALESCE((SELECT SUM(t.scrap_qty) FROM production_tasks t WHERE t.production_order_id = po.id), 0) AS scrap_qty,
         COALESCE((SELECT MIN(t.planned_date) FROM production_tasks t WHERE t.production_order_id = po.id AND t.planned_date IS NOT NULL), po.planned_date) AS start_date,
         -- Máy hiển thị: danh sách các máy từ tasks, fallback về machine_id của lệnh
         COALESCE(
           (SELECT STRING_AGG(DISTINCT m2.name, ', ') FROM production_tasks t2
            JOIN machines m2 ON m2.id = t2.machine_id
            WHERE t2.production_order_id = po.id AND t2.machine_id IS NOT NULL),
           m.name
         ) AS machine_name_display,
         -- Ngày SX hiển thị: ưu tiên ngày nhỏ nhất từ tasks, fallback về planned_date của lệnh
         COALESCE(
           (SELECT MIN(t3.planned_date) FROM production_tasks t3
            WHERE t3.production_order_id = po.id AND t3.planned_date IS NOT NULL),
           po.planned_date
         ) AS planned_date_display,
         -- Ca hiển thị: gộp danh sách các ca từ tasks, fallback về shift của lệnh
         COALESCE(
           NULLIF((SELECT STRING_AGG(DISTINCT t4.shift, ', ') FROM production_tasks t4
            WHERE t4.production_order_id = po.id AND t4.shift IS NOT NULL AND t4.shift != ''), ''),
           po.shift
         ) AS shift_display,
         COALESCE(
           NULLIF((SELECT STRING_AGG(DISTINCT t5.assigned_team, ', ') FROM production_tasks t5
            WHERE t5.production_order_id = po.id AND t5.assigned_team IS NOT NULL AND t5.assigned_team != ''), ''),
           po.assigned_team
         ) AS assigned_team_display
  FROM production_orders po
  JOIN products p   ON p.id = po.product_id
  LEFT JOIN customers c ON c.id = po.customer_id
  LEFT JOIN machines  m ON m.id = po.machine_id
  LEFT JOIN sales_orders so ON so.id = po.sales_order_id
`;

/**
 * Kho tự động (backflush) khi lệnh hoàn thành lần đầu:
 *  - Nhập kho Thành phẩm/BTP đúng sản phẩm + thuộc tính (SL = sản lượng thực)
 *  - Trừ NVL theo định mức BOM còn hiệu lực (theo tỉ lệ sản lượng)
 */
// Đồng bộ kho theo TỪNG công đoạn (WIP): mỗi công đoạn xong nhập kho đầu ra của nó
// (công đoạn giữa → BTP, công đoạn cuối → TP); công đoạn sau TIÊU HAO (trừ) BTP mà công đoạn trước tạo ra.
// Nhập/điều chỉnh theo CHÊNH LỆCH so với đã nhập trước đó (posted_qty theo từng công đoạn) → sửa SL là kho tự khớp.
async function syncOrderInventory(client, poId) {
  const o = (await client.query(`
    SELECT po.id, po.product_id, po.specs, po.spec_key,
           po.attr_size, po.attr_thickness, po.attr_color, po.order_code, p.product_type, p.unit
    FROM production_orders po JOIN products p ON p.id = po.product_id WHERE po.id = $1`, [poId])).rows[0];
  if (!o) return;
  const tasks = (await client.query(
    `SELECT id, stage, quantity, actual_qty, status, posted_qty FROM production_tasks WHERE production_order_id = $1 ORDER BY seq`, [poId])).rows;
  if (!tasks.length) return;

  const locOf = async (whType) => (await client.query(
    `SELECT l.id FROM locations l JOIN warehouses w ON w.id = l.warehouse_id
     WHERE w.warehouse_type = $1 AND l.is_deleted = FALSE ORDER BY l.created_at LIMIT 1`, [whType])).rows[0]?.id || null;
  // Kho theo LÔ: mỗi lệnh SX = 1 lô (lot_code = mã LSX), gom theo spec_key; BTP và TP khác vị trí kho
  const upsertStock = async (locId, qty) => {
    await client.query(`
      INSERT INTO inventory_stock (product_id, location_id, specs, spec_key, lot_code, prod_order_id, attr_size, attr_thickness, attr_color, quantity, unit)
      VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (product_id, location_id, spec_key, lot_code)
      DO UPDATE SET quantity = inventory_stock.quantity + EXCLUDED.quantity, updated_at = now()`,
      [o.product_id, locId, JSON.stringify(o.specs || {}), o.spec_key || '', o.order_code, o.id,
       o.attr_size || '', o.attr_thickness || '', o.attr_color || '', qty, o.unit || null]);
  };
  const logTrx = async (locId, type, qty, note) => {
    await client.query(`
      INSERT INTO inventory_transactions (product_id, location_id, trx_type, quantity, specs, spec_key, lot_code, attr_size, attr_thickness, attr_color, ref_code, note)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12)`,
      [o.product_id, locId, type, qty, JSON.stringify(o.specs || {}), o.spec_key || '', o.order_code,
       o.attr_size || '', o.attr_thickness || '', o.attr_color || '', o.order_code, note]);
  };

  const btpLoc = await locOf('BTP');
  const tpLoc = await locOf('TP');
  const finalStage = tasks.some(t => t.stage === 'Cắt') ? 'Cắt' : 'Thổi';
  const firstStage = tasks[0].stage;                                  // công đoạn đầu (theo seq)
  const finalLoc = o.product_type === 'Bán thành phẩm' ? btpLoc : tpLoc; // đầu ra công đoạn cuối theo loại SP

  let totalFinal = 0;
  for (const t of tasks) {
    const producedT = t.status === 'Hoàn thành' ? (Number(t.actual_qty == null ? t.quantity : t.actual_qty) || 0) : 0;
    const delta = producedT - Number(t.posted_qty || 0);
    if (delta !== 0) {
      // (a) Nhập kho ĐẦU RA của công đoạn này
      const outLoc = t.stage === finalStage ? finalLoc : btpLoc;
      if (outLoc) {
        await upsertStock(outLoc, delta);
        await logTrx(outLoc, delta > 0 ? 'Nhập' : 'Xuất', Math.abs(delta), `Nhập kho ${t.stage} (tự động)`);
      }
      // (b) TIÊU HAO BTP của công đoạn trước (mọi công đoạn trừ công đoạn đầu)
      if (t.stage !== firstStage && btpLoc) {
        await upsertStock(btpLoc, -delta);
        await logTrx(btpLoc, delta > 0 ? 'Xuất' : 'Nhập', Math.abs(delta), `Tiêu hao BTP cho ${t.stage} (tự động)`);
      }
      await client.query(`UPDATE production_tasks SET posted_qty = $2 WHERE id = $1`, [t.id, producedT]);
    }
    if (t.stage === finalStage) totalFinal += producedT;
  }
  // Giữ tổng thành phẩm ở cấp lệnh cho hiển thị/tương thích
  await client.query(`UPDATE production_orders SET posted_qty = $2::numeric, inventory_posted = ($2::numeric > 0) WHERE id = $1`, [poId, totalFinal]);
}

// One-off backfill: đồng bộ lại kho theo công đoạn cho 1 lệnh (tự mở transaction).
exports.resyncInventory = async (poId) => {
  const client = await db.pool.connect();
  try { await client.query('BEGIN'); await syncOrderInventory(client, poId); await client.query('COMMIT'); }
  catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
};

/**
 * Tính lại trạng thái lệnh từ các phân công trong DB, đồng bộ đơn hàng,
 * và backflush kho khi hoàn thành lần đầu. Dùng cho cả saveTasks lẫn quét QR.
 */
async function recomputeOrder(client, poId) {
  const ord = (await client.query(`SELECT quantity, sales_order_id, sales_order_item_id, inventory_posted, posted_qty FROM production_orders WHERE id = $1`, [poId])).rows[0];
  if (!ord) return;
  const tks = (await client.query(`SELECT stage, status, quantity, actual_qty FROM production_tasks WHERE production_order_id = $1`, [poId])).rows;
  const finalStage = tks.some(t => t.stage === 'Cắt') ? 'Cắt' : 'Thổi';
  const qtyOf = (t) => (t.actual_qty == null ? Number(t.quantity) : Number(t.actual_qty)) || 0;
  const produced = tks.filter(t => t.stage === finalStage && t.status === 'Hoàn thành').reduce((s, t) => s + qtyOf(t), 0);

  const MANUAL_STATUSES = new Set(['Chờ nguyên vật liệu', 'Đã hủy', 'Chờ duyệt']);
  const cur = (await client.query(`SELECT status FROM production_orders WHERE id = $1`, [poId])).rows[0]?.status;
  const poStatus = tks.length ? (produced >= Number(ord.quantity) ? 'Hoàn thành' : 'Đang sản xuất') : null;
  // Chỉ cập nhật nếu có kết quả tính toán VÀ trạng thái hiện tại không phải do người dùng đặt thủ công
  if (poStatus && !MANUAL_STATUSES.has(cur)) await client.query(`UPDATE production_orders SET status = $1 WHERE id = $2`, [poStatus, poId]);
  // Đồng bộ kho theo từng công đoạn (WIP): xong công đoạn nào nhập kho đầu ra công đoạn đó, công đoạn sau tiêu hao BTP.
  await syncOrderInventory(client, poId);

  // Ghi ngày thực tế lên dòng đơn hàng gắn với lệnh SX này
  if (ord.sales_order_item_id) {
    const started = tks.some(t => ['Đang sản xuất', 'Dừng sản xuất', 'Hoàn thành'].includes(t.status));
    if (started) {
      // Ngày bắt đầu thực tế = lần đầu một công đoạn của dòng được bắt đầu
      await client.query(
        `UPDATE sales_order_items SET actual_start_date = NOW() WHERE id = $1 AND actual_start_date IS NULL`,
        [ord.sales_order_item_id]);
    }
    // Ngày kết thúc thực tế = khi TẤT CẢ lệnh SX của dòng đều đã hoàn thành
    const poAgg = (await client.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'Hoàn thành')::int AS done
       FROM production_orders WHERE sales_order_item_id = $1 AND is_deleted = FALSE`, [ord.sales_order_item_id])).rows[0];
    if (poAgg.total > 0 && poAgg.done === poAgg.total) {
      await client.query(
        `UPDATE sales_order_items SET actual_end_date = NOW() WHERE id = $1 AND actual_end_date IS NULL`,
        [ord.sales_order_item_id]);
    } else {
      // Nếu lại có lệnh chưa xong (ví dụ thêm LSX mới) thì bỏ ngày kết thúc
      await client.query(
        `UPDATE sales_order_items SET actual_end_date = NULL WHERE id = $1`, [ord.sales_order_item_id]);
    }
  }

  if (ord.sales_order_id) {
    const agg = (await client.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'Hoàn thành')::int AS done,
             COUNT(*) FILTER (WHERE status IN ('Đang sản xuất','Hoàn thành'))::int AS active
      FROM production_orders WHERE sales_order_id = $1 AND is_deleted = FALSE`, [ord.sales_order_id])).rows[0];
    const pending = (await client.query(
      `SELECT COUNT(*)::int AS n FROM sales_order_items WHERE sales_order_id = $1 AND is_planned = FALSE`, [ord.sales_order_id])).rows[0].n;
    let soStatus = null;
    // SX xong toàn bộ → "Hoàn thành sản xuất" (các khâu giao hàng/thanh toán quản lý tiếp sau đó)
    if (agg.total > 0 && agg.done === agg.total && pending === 0) soStatus = 'Hoàn thành sản xuất';
    else if (agg.active > 0) soStatus = 'Đang sản xuất';
    // Không tự đè khi đơn đã sang khâu giao hàng/thanh toán
    if (soStatus) await client.query(
      `UPDATE sales_orders SET status = $1 WHERE id = $2 AND is_deleted = FALSE
         AND status IN ('Mới','Đang sản xuất','Hoàn thành sản xuất')`, [soStatus, ord.sales_order_id]);
  }
  return { produced, status: poStatus };
}

exports.list = async (req, res) => {
  try {
    const where = ['po.is_deleted = FALSE'];
    const params = []; let i = 1;
    const { status, machine_id, customer_id, q, planned_date } = req.query;
    if (status)      { where.push(`po.status = $${i++}`); params.push(status); }
    if (machine_id)  { where.push(`po.machine_id = $${i++}`); params.push(machine_id); }
    if (customer_id) { where.push(`po.customer_id = $${i++}`); params.push(customer_id); }
    if (planned_date){ where.push(`po.planned_date = $${i++}`); params.push(planned_date); }
    if (q)           { where.push(`(po.order_code ILIKE $${i} OR p.product_name ILIKE $${i})`); params.push(`%${q}%`); i++; }
    
    // Áp dụng Data Scope
    const scopeCond = getDataScope(req, 'production', 'view', { factoryCol: 'po.assigned_team' });
    where.push(`(${scopeCond})`);

    const sql = `${SELECT_JOIN} WHERE ${where.join(' AND ')} ORDER BY CASE WHEN po.priority = 'Cao' THEN 1 WHEN po.priority = 'Trung bình' THEN 2 ELSE 3 END, po.created_at DESC`;
    const { rows } = await db.query(sql, params);
    res.json({ data: rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy danh sách lệnh sản xuất' }); }
};

exports.getById = async (req, res) => {
  try {
    const { rows } = await db.query(`${SELECT_JOIN} WHERE po.id = $1 AND po.is_deleted = FALSE`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy lệnh sản xuất' });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy chi tiết' }); }
};

exports.create = async (req, res) => {
  try {
    const b = req.body;
    if (!b.product_id || !b.quantity) return res.status(400).json({ message: 'Thiếu Sản phẩm hoặc Số lượng' });
    const finishing = Array.isArray(b.finishing)
      ? b.finishing.filter(f => f && f.name).map(f => ({ name: f.name, checked: !!f.checked }))
      : [];
    const specs = specsFromBody(b);
    const a = legacyAttrs(specs);
    const group_key = [b.product_id, buildSpecKey(specs)].join('||');
    let priority = b.priority || 'Trung bình';
    if (!b.priority && b.sales_order_id) {
       const so = (await db.query(`SELECT priority FROM sales_orders WHERE id = $1`, [b.sales_order_id])).rows[0];
       if (so && so.priority) priority = so.priority;
    }

    const { rows } = await db.query(
      `INSERT INTO production_orders
         (sales_order_id, customer_id, product_id, quantity, unit,
          specs, spec_key, attr_size, attr_thickness, attr_color, finishing,
          machine_id, planned_date, shift, assigned_team, group_key, due_date, status, note, assigned_worker, priority, mix_ratio, material_type)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING *`,
      [
        b.sales_order_id || null, b.customer_id || null, b.product_id, b.quantity, upUnit(b.unit),
        JSON.stringify(specs), buildSpecKey(specs), a.size || null, a.thickness || null, a.color || null, JSON.stringify(finishing),
        b.machine_id || null, b.planned_date || null, b.shift || null, b.assigned_team || null,
        group_key, b.due_date || null, b.status || 'Chờ duyệt', b.note || null, b.assigned_worker || null, priority,
        JSON.stringify(b.mix_ratio || []), b.material_type || null
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi tạo lệnh sản xuất' }); }
};

exports.update = async (req, res) => {
  try {
    const b = req.body;
    const fields = ['sales_order_id','customer_id','product_id','quantity','unit',
      'machine_id','planned_date','shift','assigned_team','assigned_worker','due_date','status','note','priority','mix_ratio','material_type'];
    const cols = [], vals = []; let i = 1;
    for (const f of fields) if (b[f] !== undefined) { cols.push(`${f} = $${i++}`); vals.push(f === 'unit' ? upUnit(b[f]) : (b[f] === '' ? null : (f === 'mix_ratio' ? JSON.stringify(b[f]) : b[f]))); }
    if (b.finishing !== undefined) {
      const finishing = Array.isArray(b.finishing) ? b.finishing.filter(f => f && f.name).map(f => ({ name: f.name, checked: !!f.checked })) : [];
      cols.push(`finishing = $${i++}::jsonb`); vals.push(JSON.stringify(finishing));
    }
    if (b.specs !== undefined || b.attr_size !== undefined || b.attr_thickness !== undefined || b.attr_color !== undefined) {
      const specs = specsFromBody(b);
      const a = legacyAttrs(specs);
      cols.push(`specs = $${i++}::jsonb`); vals.push(JSON.stringify(specs));
      cols.push(`spec_key = $${i++}`); vals.push(buildSpecKey(specs));
      cols.push(`attr_size = $${i++}`); vals.push(a.size || null);
      cols.push(`attr_thickness = $${i++}`); vals.push(a.thickness || null);
      cols.push(`attr_color = $${i++}`); vals.push(a.color || null);
      cols.push(`group_key = $${i++}`); vals.push([b.product_id || '', buildSpecKey(specs)].join('||'));
    }
    if (!cols.length) return res.status(400).json({ message: 'Không có trường để cập nhật' });
    const { rows } = await db.query(
      `UPDATE production_orders SET ${cols.join(', ')} WHERE id = $${i} AND is_deleted = FALSE RETURNING *`,
      [...vals, req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy lệnh sản xuất' });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi cập nhật' }); }
};

// Lập lịch / phân bổ nguồn lực
exports.schedule = async (req, res) => {
  try {
    const { machine_id, planned_date, shift, assigned_team, assigned_worker } = req.body;
    const { rows } = await db.query(
      `UPDATE production_orders
         SET machine_id=$1, planned_date=$2, shift=$3, assigned_team=$4, assigned_worker=$5,
             status = CASE WHEN status='Chờ duyệt' THEN 'Đã lên kế hoạch' ELSE status END
       WHERE id=$6 AND is_deleted=FALSE RETURNING *`,
      [machine_id || null, planned_date || null, shift || null, assigned_team || null, assigned_worker || null, req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy lệnh sản xuất' });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lập lịch' }); }
};

// PUT /api/production-orders/:id/reschedule — kéo-thả lịch: dời CẢ lệnh + phân công (giữ khoảng cách giữa các bước)
exports.reschedule = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const id = req.params.id;
    const date = req.body.date || null; // 'YYYY-MM-DD' hoặc rỗng = bỏ lịch
    await client.query('BEGIN');
    const hdr = (await client.query(`SELECT planned_date, status FROM production_orders WHERE id=$1 AND is_deleted=FALSE`, [id])).rows[0];
    if (!hdr) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Không tìm thấy lệnh' }); }
    const tasks = (await client.query(`SELECT id, planned_date, planned_end_date FROM production_tasks WHERE production_order_id=$1`, [id])).rows;
    let oldStart = null;
    tasks.forEach((t) => { if (t.planned_date && (!oldStart || t.planned_date < oldStart)) oldStart = t.planned_date; });
    if (!oldStart) oldStart = hdr.planned_date;

    if (!date) {
      await client.query(`UPDATE production_orders SET planned_date = NULL WHERE id=$1`, [id]);
      await client.query(`UPDATE production_tasks SET planned_date = NULL, planned_end_date = NULL WHERE production_order_id=$1`, [id]);
    } else {
      const dayMs = 86400000;
      const toDate = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00');
      const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const delta = oldStart ? Math.round((toDate(date) - toDate(oldStart)) / dayMs) : 0;
      const shift = (val) => (val ? ymd(new Date(toDate(val).getTime() + delta * dayMs)) : null);
      await client.query(
        `UPDATE production_orders SET planned_date=$1, status = CASE WHEN status='Chờ duyệt' THEN 'Đã lên kế hoạch' ELSE status END WHERE id=$2`,
        [date, id]);
      for (const t of tasks) {
        const np = t.planned_date ? shift(t.planned_date) : date;
        const ne = t.planned_end_date ? shift(t.planned_end_date) : null;
        await client.query(`UPDATE production_tasks SET planned_date=$1, planned_end_date=$2 WHERE id=$3`, [np, ne, t.id]);
      }
    }
    await client.query('COMMIT');
    res.json({ message: 'Đã xếp lịch' });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi xếp lịch' }); }
  finally { client.release(); }
};

exports.remove = async (req, res) => {
  try {
    const g = await guardDelete('production_orders', req.params.id, {
      allow: ['Đã hủy', 'Chờ duyệt'],
      message: 'Không thể xóa lệnh đang sản xuất / đã lên kế hoạch / đã hoàn thành. Chỉ xóa được lệnh ở trạng thái "Đã hủy" (hoặc "Chờ duyệt" chưa lên lịch). Vui lòng hủy lệnh trước.',
    });
    if (g.notFound) return res.status(404).json({ message: 'Không tìm thấy lệnh sản xuất' });
    if (g.blocked) return res.status(400).json({ message: g.message });

    const { rowCount } = await db.query(
      `UPDATE production_orders SET is_deleted = TRUE WHERE id = $1 AND is_deleted = FALSE`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Không tìm thấy lệnh sản xuất' });
    res.json({ message: 'Đã xóa lệnh sản xuất' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi xóa' }); }
};

/* ===== Phân công sản xuất (chia lệnh nhỏ theo công đoạn + sản lượng) ===== */

// GET /api/production/gantt?from=&to=  — dữ liệu vẽ biểu đồ Gantt phân công
exports.gantt = async (req, res) => {
  try {
    const { from, to } = req.query;
    const where = ['t.planned_date IS NOT NULL'];
    const params = []; let i = 1;
    if (to) { where.push(`t.planned_date <= $${i++}`); params.push(to); }
    if (from) { where.push(`COALESCE(t.planned_end_date, t.planned_date) >= $${i++}`); params.push(from); }
    const { rows } = await db.query(`
      SELECT t.id, t.task_code, t.stage, t.quantity, t.status, t.shift, t.assigned_team,
             t.planned_date AS start_date, COALESCE(t.planned_end_date, t.planned_date) AS end_date,
             t.machine_id, m.name AS machine_name, m.factory AS machine_factory,
             po.id AS production_order_id, po.order_code, po.attr_color, po.attr_size, p.product_name
      FROM production_tasks t
      LEFT JOIN machines m ON m.id = t.machine_id
      JOIN production_orders po ON po.id = t.production_order_id
      JOIN products p ON p.id = po.product_id
      WHERE ${where.join(' AND ')}
      ORDER BY m.factory NULLS LAST, m.name NULLS LAST, t.planned_date`, params);
    res.json({ data: rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy dữ liệu Gantt' }); }
};

// GET /api/production-orders/:id/tasks
exports.getTasks = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT t.*, m.name AS machine_name, m.factory AS machine_factory
      FROM production_tasks t LEFT JOIN machines m ON m.id = t.machine_id
      WHERE t.production_order_id = $1 ORDER BY t.seq`, [req.params.id]);
    res.json({ data: rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy phân công' }); }
};

// GET /api/production/execution — danh sách công việc cho công nhân/đội thực thi
exports.executionTasks = async (req, res) => {
  try {
    const where = ['po.is_deleted = FALSE']; const params = []; let i = 1;
    const { team, worker, status, q } = req.query;
    if (team)   { where.push(`t.assigned_team = $${i++}`); params.push(team); }
    if (worker) { where.push(`t.assigned_worker = $${i++}`); params.push(worker); }
    if (status) { where.push(`t.status = $${i++}`); params.push(status); }
    if (q)      { where.push(`(po.order_code ILIKE $${i} OR p.product_name ILIKE $${i} OR p.product_code ILIKE $${i})`); params.push(`%${q}%`); i++; }
    const { rows } = await db.query(`
      SELECT t.id, t.task_code, t.stage, t.quantity, t.actual_qty, t.scrap_qty, t.status, t.shift,
             t.planned_date, t.planned_end_date, t.assigned_team, t.assigned_worker,
             m.name AS machine_name,
             po.id AS production_order_id, po.order_code, po.due_date, po.unit,
             po.attr_color, po.attr_size, po.attr_thickness, po.specs, po.priority,
             p.product_code, p.product_name,
             c.name AS customer_name, c.phone AS customer_phone,
             so.order_code AS sales_order_code, po.note AS order_note,
             COALESCE(po.material_type, so.material_type) AS material_type,
             so.note AS sales_order_note,
             COALESCE(po.mix_ratio, so.mix_ratio) AS mix_ratio
      FROM production_tasks t
      JOIN production_orders po ON po.id = t.production_order_id
      JOIN products p ON p.id = po.product_id
      LEFT JOIN machines m ON m.id = t.machine_id
      LEFT JOIN customers c ON c.id = po.customer_id
      LEFT JOIN sales_orders so ON so.id = po.sales_order_id
      WHERE ${where.join(' AND ')}
      ORDER BY (t.status IN ('Hoàn thành','Đã hủy')) ASC, CASE WHEN po.priority = 'Cao' THEN 1 WHEN po.priority = 'Trung bình' THEN 2 ELSE 3 END, po.due_date NULLS LAST, t.planned_date NULLS LAST`, params);
    res.json({ data: rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy công việc sản xuất' }); }
};

// GET /api/production/task-by-code/:code — tra lô theo mã (cho quét QR)
exports.getTaskByCode = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT t.*, m.name AS machine_name,
             po.order_code, po.quantity AS order_quantity, po.attr_color, po.attr_size, po.attr_thickness, po.unit,
             p.product_name, c.name AS customer_name, so.order_code AS sales_order_code
      FROM production_tasks t
      JOIN production_orders po ON po.id = t.production_order_id
      JOIN products p ON p.id = po.product_id
      LEFT JOIN machines m ON m.id = t.machine_id
      LEFT JOIN customers c ON c.id = po.customer_id
      LEFT JOIN sales_orders so ON so.id = po.sales_order_id
      WHERE t.task_code = $1 LIMIT 1`, [req.params.code]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy lô: ' + req.params.code });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi tra lô' }); }
};

// GET /api/production-orders/:id/materials — NVL gợi ý từ BOM (theo SL lệnh) + đã ghi nhận
exports.getMaterials = async (req, res) => {
  try {
    const poId = req.params.id;
    const po = (await db.query(
      `SELECT po.id, po.product_id, po.quantity, p.product_name, p.product_code
       FROM production_orders po JOIN products p ON p.id = po.product_id WHERE po.id = $1`, [poId])).rows[0];
    if (!po) return res.status(404).json({ message: 'Không tìm thấy lệnh sản xuất' });

    const bom = (await db.query(
      `SELECT id, output_quantity FROM boms WHERE product_id = $1 AND is_deleted = FALSE AND status = 'Hoạt động' ORDER BY created_at DESC LIMIT 1`,
      [po.product_id])).rows[0];

    const usage = Object.fromEntries((await db.query(
      `SELECT material_id, qty FROM production_material_usage WHERE production_order_id = $1`, [poId])).rows.map((r) => [r.material_id, Number(r.qty)]));

    let lines = [];
    if (bom) {
      const factor = Number(po.quantity) / (Number(bom.output_quantity) || 1);
      const bl = (await db.query(
        `SELECT bl.material_id, bl.quantity, bl.unit, p.product_code, p.product_name
         FROM bom_lines bl JOIN products p ON p.id = bl.material_id WHERE bl.bom_id = $1 ORDER BY bl.line_no`, [bom.id])).rows;
      lines = await Promise.all(bl.map(async (l) => {
        const oh = (await db.query(`SELECT COALESCE(SUM(quantity),0)::numeric AS q FROM inventory_stock WHERE product_id = $1`, [l.material_id])).rows[0].q;
        const suggested = Number(l.quantity) * factor;
        const recorded = Object.prototype.hasOwnProperty.call(usage, l.material_id);
        return {
          material_id: l.material_id, material_code: l.product_code, material_name: l.product_name,
          unit: l.unit, suggested_qty: suggested, used_qty: recorded ? usage[l.material_id] : suggested,
          on_hand: Number(oh), recorded,
        };
      }));
    }
    res.json({ product: po, has_bom: !!bom, has_usage: Object.keys(usage).length > 0, lines });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy NVL theo BOM' }); }
};

// POST /api/production-orders/:id/materials — CHỈ GHI NHẬN NVL thực tế (theo dõi tiêu hao).
// KHÔNG trừ kho nữa: việc trừ kho NVL đã chuyển sang "Yêu cầu nguyên vật liệu" (xuất kho) ở màn Lệnh SX,
// tránh trừ trùng 2 lần. Phần này chỉ để so sánh kế hoạch (cần cung cấp) vs thực tế dùng.
exports.saveMaterials = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const poId = req.params.id;
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
    const po = (await client.query(`SELECT id FROM production_orders WHERE id = $1`, [poId])).rows[0];
    if (!po) return res.status(404).json({ message: 'Không tìm thấy lệnh sản xuất' });

    await client.query('BEGIN');
    const seen = new Set();
    for (const l of lines) {
      if (!l.material_id) continue;
      seen.add(l.material_id);
      await client.query(
        `INSERT INTO production_material_usage (production_order_id, material_id, qty, unit)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (production_order_id, material_id)
         DO UPDATE SET qty = EXCLUDED.qty, unit = EXCLUDED.unit, updated_at = now()`,
        [poId, l.material_id, Number(l.qty) || 0, upUnit(l.unit)]);
    }
    const existing = (await client.query(`SELECT material_id FROM production_material_usage WHERE production_order_id = $1`, [poId])).rows.map((r) => r.material_id);
    for (const mid of existing) if (!seen.has(mid)) await client.query(`DELETE FROM production_material_usage WHERE production_order_id = $1 AND material_id = $2`, [poId, mid]);
    await client.query('COMMIT');
    res.json({ message: 'Đã ghi nhận NVL thực tế (theo dõi tiêu hao)' });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi ghi nhận NVL' }); }
  finally { client.release(); }
};

// ── NVL CẦN CUNG CẤP (kế hoạch cấp NVL cho lệnh) + Yêu cầu NVL (xuất kho) ──────
// GET /api/production-orders/:id/planned-materials — danh sách NVL cần cung cấp + tồn kho hiện tại
exports.getPlannedMaterials = async (req, res) => {
  try {
    const poId = req.params.id;
    const po = (await db.query(`SELECT materials_issued FROM production_orders WHERE id = $1`, [poId])).rows[0];
    if (!po) return res.status(404).json({ message: 'Không tìm thấy lệnh sản xuất' });
    const { rows } = await db.query(`
      SELECT pm.material_id, pm.qty, pm.unit, pm.note,
             p.product_code AS material_code, p.product_name AS material_name,
             COALESCE((SELECT SUM(quantity) FROM inventory_stock s WHERE s.product_id = pm.material_id), 0) AS on_hand
      FROM production_order_materials pm
      JOIN products p ON p.id = pm.material_id
      WHERE pm.production_order_id = $1
      ORDER BY pm.created_at`, [poId]);
    // Phiếu xuất kho mới nhất (chưa hủy) của lệnh → để hiển thị trạng thái Chờ xuất / Đã xuất
    const slip = (await db.query(
      `SELECT id, slip_code, status FROM outbound_slips
       WHERE prod_order_id = $1 AND status <> 'Đã hủy' ORDER BY created_at DESC LIMIT 1`, [poId])).rows[0] || null;
    res.json({ data: { materials_issued: po.materials_issued, slip, lines: rows } });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy NVL cần cung cấp' }); }
};

// POST /api/production-orders/:id/planned-materials — lưu danh sách NVL cần cung cấp (thay thế)
exports.savePlannedMaterials = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const poId = req.params.id;
    const lines = (Array.isArray(req.body.lines) ? req.body.lines : []).filter((l) => l && l.material_id);
    const po = (await client.query(`SELECT materials_issued FROM production_orders WHERE id = $1`, [poId])).rows[0];
    if (!po) return res.status(404).json({ message: 'Không tìm thấy lệnh sản xuất' });
    if (po.materials_issued) return res.status(400).json({ message: 'NVL đã được yêu cầu (xuất kho) — không sửa được danh sách cần cung cấp nữa.' });
    await client.query('BEGIN');
    await client.query(`DELETE FROM production_order_materials WHERE production_order_id = $1`, [poId]);
    for (const l of lines) {
      await client.query(
        `INSERT INTO production_order_materials (production_order_id, material_id, qty, unit, note)
         VALUES ($1,$2,$3,$4,$5)`,
        [poId, l.material_id, Number(l.qty) || 0, upUnit(l.unit), l.note || null]);
    }
    await client.query('COMMIT');
    res.json({ message: 'Đã lưu NVL cần cung cấp', count: lines.length });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi lưu NVL cần cung cấp' }); }
  finally { client.release(); }
};

// POST /api/production-orders/:id/request-materials — YÊU CẦU NVL: tạo PHIẾU XUẤT KHO "Đã xuất" (trừ kho trực tiếp)
exports.requestMaterials = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const poId = req.params.id;
    const po = (await client.query(`SELECT order_code, materials_issued FROM production_orders WHERE id = $1`, [poId])).rows[0];
    if (!po) return res.status(404).json({ message: 'Không tìm thấy lệnh sản xuất' });
    if (po.materials_issued) return res.status(400).json({ message: 'Lệnh này đã xuất NVL rồi.' });

    await client.query('BEGIN');
    // Lưu danh sách gửi kèm (nếu có) trước khi tạo phiếu
    if (Array.isArray(req.body.lines)) {
      const lines = req.body.lines.filter((l) => l && l.material_id);
      await client.query(`DELETE FROM production_order_materials WHERE production_order_id = $1`, [poId]);
      for (const l of lines) await client.query(
        `INSERT INTO production_order_materials (production_order_id, material_id, qty, unit, note) VALUES ($1,$2,$3,$4,$5)`,
        [poId, l.material_id, Number(l.qty) || 0, upUnit(l.unit), l.note || null]);
    }

    const plan = (await client.query(
      `SELECT material_id, qty, unit, note FROM production_order_materials WHERE production_order_id = $1 AND qty > 0`, [poId])).rows;
    if (!plan.length) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Chưa có NVL cần cung cấp để yêu cầu. Hãy thêm NVL trước.' }); }

    const nvlLoc = (await client.query(
      `SELECT l.id FROM locations l JOIN warehouses w ON w.id = l.warehouse_id
       WHERE w.warehouse_type = 'NVL' AND l.is_deleted = FALSE ORDER BY l.created_at LIMIT 1`)).rows[0]?.id || null;
       
    if (!nvlLoc) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Hệ thống chưa có Kho Nguyên vật liệu.' }); }

    // Kiểm tra tồn kho và phân bổ FIFO
    const shortages = [];
    const allocations = [];
    for (const l of plan) {
      const requiredQty = Number(l.qty);
      const { rows: stockRows } = await client.query(
        `SELECT lot_code, quantity, unit FROM inventory_stock
         WHERE product_id = $1 AND location_id = $2 AND quantity > 0
         ORDER BY id ASC`, [l.material_id, nvlLoc]
      );
      const totalOnHand = stockRows.reduce((sum, r) => sum + Number(r.quantity), 0);
      if (requiredQty > totalOnHand) {
        const p = (await client.query(`SELECT product_code, product_name, unit FROM products WHERE id = $1`, [l.material_id])).rows[0] || {};
        shortages.push({ code: p.product_code, name: p.product_name, unit: l.unit || p.unit || '', on_hand: totalOnHand, need: requiredQty, buy: requiredQty - totalOnHand });
      } else {
        let remain = requiredQty;
        for (const sr of stockRows) {
          if (remain <= 0) break;
          const qtyToTake = Math.min(remain, Number(sr.quantity));
          allocations.push({
            product_id: l.material_id, lot_code: sr.lot_code || '', quantity: qtyToTake, unit: l.unit || sr.unit, note: l.note
          });
          remain -= qtyToTake;
        }
      }
    }

    if (shortages.length) {
      const msg = 'Không đủ tồn kho NVL để xuất — vui lòng nhập thêm:\n' +
        shortages.map((x) => `• ${x.code} ${x.name}: tồn ${x.on_hand} ${x.unit}, cần ${x.need} ${x.unit} → thiếu ${x.buy} ${x.unit}`).join('\n');
      await client.query('ROLLBACK');
      return res.status(400).json({ message: msg, shortages });
    }

    // Sinh mã phiếu PXK00001…
    const slipCode = (await client.query(
      `SELECT 'PXK' || LPAD((COALESCE(MAX(NULLIF(regexp_replace(slip_code,'\\D','','g'),''))::int,0)+1)::text,5,'0') AS code
       FROM outbound_slips WHERE slip_code ~ '^PXK[0-9]+$'`)).rows[0].code;

    const slip = (await client.query(
      `INSERT INTO outbound_slips (slip_code, purpose, location_id, prod_order_id, status, note, created_by, confirmed_at)
       VALUES ($1,'Xuất cho sản xuất',$2,$3,'Đã xuất',$4,$5,now()) RETURNING id, slip_code`,
      [slipCode, nvlLoc, poId, `Xuất NVL cho lệnh ${po.order_code}`, req.userId || null])).rows[0];

    // Ghi nhận dòng phiếu, trừ tồn kho và ghi lịch sử giao dịch
    for (const alloc of allocations) {
      await client.query(
        `INSERT INTO outbound_slip_lines (slip_id, product_id, quantity, unit, lot_code, note) VALUES ($1,$2,$3,$4,$5,$6)`,
        [slip.id, alloc.product_id, alloc.quantity, alloc.unit, alloc.lot_code, alloc.note || null]);
      
      await client.query(
        `INSERT INTO inventory_stock (product_id, location_id, spec_key, lot_code, quantity, unit)
         VALUES ($1,$2,'',$3,$4,$5)
         ON CONFLICT (product_id, location_id, spec_key, lot_code)
         DO UPDATE SET quantity = inventory_stock.quantity + EXCLUDED.quantity, unit = COALESCE(EXCLUDED.unit, inventory_stock.unit), updated_at = now()`,
        [alloc.product_id, nvlLoc, alloc.lot_code, -alloc.quantity, upUnit(alloc.unit)]);
      
      await client.query(
        `INSERT INTO inventory_transactions (product_id, location_id, trx_type, quantity, lot_code, ref_code, note)
         VALUES ($1,$2,'Xuất',$3,$4,$5,$6)`,
        [alloc.product_id, nvlLoc, alloc.quantity, alloc.lot_code, slip.slip_code, 'Xuất cho sản xuất']);
    }

    await client.query(`UPDATE production_orders SET materials_issued = TRUE WHERE id = $1`, [poId]);
    await client.query('COMMIT');
    res.json({ message: `Đã xuất kho NVL thành công (Phiếu ${slip.slip_code}).`, slip_code: slip.slip_code, slip_id: slip.id, count: allocations.length });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi yêu cầu NVL' }); }
  finally { client.release(); }
};

// PUT /api/production/tasks/:taskId — cập nhật 1 lô (trạng thái/sản lượng thực/phế) + tính lại lệnh
exports.updateTask = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const b = req.body;
    const cols = [], vals = []; let i = 1;
    const add = (c, v) => { cols.push(`${c} = $${i++}`); vals.push(v); };
    if (b.status !== undefined) add('status', b.status);
    if (b.actual_qty !== undefined) add('actual_qty', b.actual_qty === '' ? null : b.actual_qty);
    if (b.scrap_qty !== undefined) add('scrap_qty', b.scrap_qty || 0);
    if (!cols.length) return res.status(400).json({ message: 'Không có trường để cập nhật' });
    await client.query('BEGIN');
    const r = await client.query(`UPDATE production_tasks SET ${cols.join(', ')} WHERE id = $${i} RETURNING production_order_id`, [...vals, req.params.taskId]);
    if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Không tìm thấy lô' }); }
    const result = await recomputeOrder(client, r.rows[0].production_order_id);
    await client.query('COMMIT');
    res.json({ message: 'Đã cập nhật lô', ...result });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi cập nhật lô' }); }
  finally { client.release(); }
};

// PUT /api/production-orders/:id/tasks — lưu toàn bộ phân công (thay thế)
exports.saveTasks = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const poId = req.params.id;
    const po = (await client.query(`SELECT order_code FROM production_orders WHERE id = $1 AND is_deleted = FALSE`, [poId])).rows[0];
    if (!po) return res.status(404).json({ message: 'Không tìm thấy lệnh sản xuất' });
    const tasks = Array.isArray(req.body.tasks) ? req.body.tasks.filter(t => t && t.stage) : [];

    await client.query('BEGIN');
    await client.query(`DELETE FROM production_tasks WHERE production_order_id = $1`, [poId]);
    let n = 1;
    for (const t of tasks) {
      await client.query(`
        INSERT INTO production_tasks
          (production_order_id, task_code, stage, quantity, actual_qty, scrap_qty, machine_id, shift, planned_date, planned_end_date, assigned_team, assigned_worker, status, seq, note)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [poId, `${po.order_code}-${n}`, t.stage, t.quantity || 0,
         t.actual_qty === '' || t.actual_qty == null ? null : t.actual_qty, t.scrap_qty || 0,
         t.machine_id || null, t.shift || null,
         t.planned_date || null, t.planned_end_date || t.planned_date || null,
         t.assigned_team || null, t.assigned_worker || null, t.status || 'Chờ', n, t.note || null]);
      n++;
    }
    await recomputeOrder(client, poId);
    await client.query('COMMIT');
    res.json({ message: 'Đã lưu phân công', count: tasks.length });
  } catch (err) {
    await client.query('ROLLBACK'); console.error(err);
    res.status(500).json({ message: err.detail || 'Lỗi khi lưu phân công' });
  } finally { client.release(); }
};
