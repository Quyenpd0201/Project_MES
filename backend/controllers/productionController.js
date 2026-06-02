// backend/controllers/productionController.js
const db = require('../db');

// Công đoạn cuối của 1 lệnh: 'Cắt' nếu có task Cắt, ngược lại 'Thổi'
const FINAL_STAGE = `(CASE WHEN EXISTS (SELECT 1 FROM production_tasks tf WHERE tf.production_order_id = po.id AND tf.stage = 'Cắt') THEN 'Cắt' ELSE 'Thổi' END)`;

const SELECT_JOIN = `
  SELECT po.*,
         p.product_name, p.product_code,
         c.name AS customer_name,
         m.name AS machine_name, m.factory AS machine_factory,
         so.order_code AS sales_order_code,
         (SELECT COUNT(*)::int FROM production_tasks t WHERE t.production_order_id = po.id) AS task_count,
         (SELECT COUNT(*)::int FROM production_tasks t WHERE t.production_order_id = po.id AND t.status = 'Hoàn thành') AS task_done,
         COALESCE((SELECT SUM(COALESCE(t.actual_qty, t.quantity)) FROM production_tasks t
                   WHERE t.production_order_id = po.id AND t.status = 'Hoàn thành'
                     AND t.stage = ${FINAL_STAGE}), 0) AS produced_qty,
         COALESCE((SELECT SUM(t.scrap_qty) FROM production_tasks t WHERE t.production_order_id = po.id), 0) AS scrap_qty
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
async function postInventoryForOrder(client, poId, produced) {
  const o = (await client.query(`
    SELECT po.product_id, po.quantity, po.attr_size, po.attr_thickness, po.attr_color, po.order_code, p.product_type, p.unit
    FROM production_orders po JOIN products p ON p.id = po.product_id WHERE po.id = $1`, [poId])).rows[0];
  if (!o) return;

  const locOf = async (whType) => (await client.query(
    `SELECT l.id FROM locations l JOIN warehouses w ON w.id = l.warehouse_id
     WHERE w.warehouse_type = $1 AND l.is_deleted = FALSE ORDER BY l.created_at LIMIT 1`, [whType])).rows[0]?.id || null;

  const upsertStock = async (productId, locId, attrs, delta, unit) => {
    await client.query(`
      INSERT INTO inventory_stock (product_id, location_id, attr_size, attr_thickness, attr_color, quantity, unit)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (product_id, location_id, attr_size, attr_thickness, attr_color)
      DO UPDATE SET quantity = inventory_stock.quantity + EXCLUDED.quantity, updated_at = now()`,
      [productId, locId, attrs.size || '', attrs.thickness || '', attrs.color || '', delta, unit || null]);
  };
  const logTrx = async (productId, locId, type, qty, attrs) => {
    await client.query(`
      INSERT INTO inventory_transactions (product_id, location_id, trx_type, quantity, attr_size, attr_thickness, attr_color, ref_code, note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [productId, locId, type, qty, attrs.size || '', attrs.thickness || '', attrs.color || '', o.order_code, 'Tự động từ lệnh SX']);
  };

  // 1) Nhập kho thành phẩm / bán thành phẩm
  const whType = o.product_type === 'Thành phẩm' ? 'TP' : o.product_type === 'Bán thành phẩm' ? 'BTP' : null;
  if (whType) {
    const loc = await locOf(whType);
    const attrs = { size: o.attr_size, thickness: o.attr_thickness, color: o.attr_color };
    await upsertStock(o.product_id, loc, attrs, produced, o.unit);
    await logTrx(o.product_id, loc, 'Nhập', produced, attrs);
  }

  // 2) Trừ NVL theo BOM còn hiệu lực
  const bom = (await client.query(
    `SELECT id, output_quantity FROM boms WHERE product_id = $1 AND is_deleted = FALSE AND status = 'Hoạt động' ORDER BY created_at DESC LIMIT 1`,
    [o.product_id])).rows[0];
  if (bom) {
    const lines = (await client.query(`SELECT material_id, quantity, unit FROM bom_lines WHERE bom_id = $1`, [bom.id])).rows;
    const nvlLoc = await locOf('NVL');
    const factor = produced / (Number(bom.output_quantity) || 1);
    for (const l of lines) {
      const amount = Number(l.quantity) * factor;
      if (!amount) continue;
      await upsertStock(l.material_id, nvlLoc, {}, -amount, l.unit);
      await logTrx(l.material_id, nvlLoc, 'Xuất', amount, {});
    }
  }

  await client.query(`UPDATE production_orders SET inventory_posted = TRUE WHERE id = $1`, [poId]);
}

/**
 * Tính lại trạng thái lệnh từ các phân công trong DB, đồng bộ đơn hàng,
 * và backflush kho khi hoàn thành lần đầu. Dùng cho cả saveTasks lẫn quét QR.
 */
async function recomputeOrder(client, poId) {
  const ord = (await client.query(`SELECT quantity, sales_order_id, inventory_posted FROM production_orders WHERE id = $1`, [poId])).rows[0];
  if (!ord) return;
  const tks = (await client.query(`SELECT stage, status, quantity, actual_qty FROM production_tasks WHERE production_order_id = $1`, [poId])).rows;
  const finalStage = tks.some(t => t.stage === 'Cắt') ? 'Cắt' : 'Thổi';
  const qtyOf = (t) => (t.actual_qty == null ? Number(t.quantity) : Number(t.actual_qty)) || 0;
  const produced = tks.filter(t => t.stage === finalStage && t.status === 'Hoàn thành').reduce((s, t) => s + qtyOf(t), 0);

  const poStatus = tks.length ? (produced >= Number(ord.quantity) ? 'Hoàn thành' : 'Đang sản xuất') : null;
  if (poStatus) await client.query(`UPDATE production_orders SET status = $1 WHERE id = $2`, [poStatus, poId]);
  if (poStatus === 'Hoàn thành' && !ord.inventory_posted && produced > 0) await postInventoryForOrder(client, poId, produced);

  if (ord.sales_order_id) {
    const agg = (await client.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'Hoàn thành')::int AS done,
             COUNT(*) FILTER (WHERE status IN ('Đang sản xuất','Hoàn thành'))::int AS active
      FROM production_orders WHERE sales_order_id = $1 AND is_deleted = FALSE`, [ord.sales_order_id])).rows[0];
    const pending = (await client.query(
      `SELECT COUNT(*)::int AS n FROM sales_order_items WHERE sales_order_id = $1 AND is_planned = FALSE`, [ord.sales_order_id])).rows[0].n;
    let soStatus = null;
    if (agg.total > 0 && agg.done === agg.total && pending === 0) soStatus = 'Hoàn thành';
    else if (agg.active > 0) soStatus = 'Đang sản xuất';
    if (soStatus) await client.query(`UPDATE sales_orders SET status = $1 WHERE id = $2 AND is_deleted = FALSE`, [soStatus, ord.sales_order_id]);
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
    const sql = `${SELECT_JOIN} WHERE ${where.join(' AND ')} ORDER BY po.created_at DESC`;
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
    const group_key = [b.attr_color || '', b.attr_size || ''].join('|');
    const { rows } = await db.query(
      `INSERT INTO production_orders
         (sales_order_id, customer_id, product_id, quantity, unit,
          attr_size, attr_thickness, attr_color, finishing,
          machine_id, planned_date, shift, assigned_team, group_key, due_date, status, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        b.sales_order_id || null, b.customer_id || null, b.product_id, b.quantity, b.unit || null,
        b.attr_size || null, b.attr_thickness || null, b.attr_color || null, JSON.stringify(finishing),
        b.machine_id || null, b.planned_date || null, b.shift || null, b.assigned_team || null,
        group_key, b.due_date || null, b.status || 'Chờ duyệt', b.note || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi tạo lệnh sản xuất' }); }
};

exports.update = async (req, res) => {
  try {
    const b = req.body;
    const fields = ['sales_order_id','customer_id','product_id','quantity','unit','attr_size',
      'attr_thickness','attr_color','machine_id','planned_date','shift','assigned_team','due_date','status','note'];
    const cols = [], vals = []; let i = 1;
    for (const f of fields) if (b[f] !== undefined) { cols.push(`${f} = $${i++}`); vals.push(b[f] === '' ? null : b[f]); }
    if (b.finishing !== undefined) {
      const finishing = Array.isArray(b.finishing) ? b.finishing.filter(f => f && f.name).map(f => ({ name: f.name, checked: !!f.checked })) : [];
      cols.push(`finishing = $${i++}::jsonb`); vals.push(JSON.stringify(finishing));
    }
    if (b.attr_color !== undefined || b.attr_size !== undefined) {
      cols.push(`group_key = $${i++}`); vals.push([b.attr_color || '', b.attr_size || ''].join('|'));
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
    const { machine_id, planned_date, shift, assigned_team } = req.body;
    const { rows } = await db.query(
      `UPDATE production_orders
         SET machine_id=$1, planned_date=$2, shift=$3, assigned_team=$4,
             status = CASE WHEN status='Chờ duyệt' THEN 'Đã lên kế hoạch' ELSE status END
       WHERE id=$5 AND is_deleted=FALSE RETURNING *`,
      [machine_id || null, planned_date || null, shift || null, assigned_team || null, req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy lệnh sản xuất' });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lập lịch' }); }
};

exports.remove = async (req, res) => {
  try {
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
