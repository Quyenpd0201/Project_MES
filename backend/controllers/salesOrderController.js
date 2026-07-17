// backend/controllers/salesOrderController.js — Đơn hàng + dòng hàng (xuất phiếu)
const db = require('../db');
const { buildSpecKey, legacyAttrs, specsFromBody } = require('../lib/specs');
const { upUnit } = require('../lib/units');
const { guardDelete } = require('../lib/deleteGuard');

exports.list = async (req, res) => {
  try {
    const where = ['so.is_deleted = FALSE'];
    const params = []; let i = 1;
    const { q, status, customer_id } = req.query;
    if (status)      { where.push(`so.status = $${i++}`); params.push(status); }
    if (customer_id) { where.push(`so.customer_id = $${i++}`); params.push(customer_id); }
    if (q)           { where.push(`(so.order_code ILIKE $${i} OR c.name ILIKE $${i})`); params.push(`%${q}%`); i++; }
    const { rows } = await db.query(`
      SELECT so.*, c.name AS customer_name, c.phone AS customer_phone,
             (SELECT COUNT(*)::int FROM sales_order_items it WHERE it.sales_order_id = so.id) AS item_count,
             (SELECT COALESCE(SUM(it.quantity),0) FROM sales_order_items it WHERE it.sales_order_id = so.id) AS total_qty
      FROM sales_orders so JOIN customers c ON c.id = so.customer_id
      WHERE ${where.join(' AND ')} ORDER BY so.created_at DESC`, params);
    res.json({ data: rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy danh sách đơn hàng' }); }
};

// Tính NVL cho 1 dòng đơn: định mức (theo BOM × SL dòng), tồn kho, cần bổ sung, đã dùng cho đơn.
async function lineMaterials(it) {
  const bom = (await db.query(
    `SELECT id, output_quantity FROM boms WHERE product_id=$1 AND is_deleted=FALSE AND status='Hoạt động' ORDER BY created_at DESC LIMIT 1`,
    [it.product_id])).rows[0];
  if (!bom) return [];
  const factor = Number(it.quantity) / (Number(bom.output_quantity) || 1);
  const lines = (await db.query(
    `SELECT bl.material_id, bl.quantity, bl.unit, p.product_code, p.product_name
     FROM bom_lines bl JOIN products p ON p.id=bl.material_id WHERE bl.bom_id=$1 ORDER BY bl.line_no`, [bom.id])).rows;
  const usedRows = (await db.query(
    `SELECT mu.material_id, COALESCE(SUM(mu.qty),0)::numeric AS used
     FROM production_material_usage mu
     JOIN production_orders po ON po.id = mu.production_order_id
     WHERE po.sales_order_item_id = $1 AND po.is_deleted = FALSE
     GROUP BY mu.material_id`, [it.id])).rows;
  const usedMap = Object.fromEntries(usedRows.map((r) => [r.material_id, Number(r.used)]));
  return Promise.all(lines.map(async (l) => {
    const oh = (await db.query(`SELECT COALESCE(SUM(quantity),0)::numeric AS q FROM inventory_stock WHERE product_id=$1`, [l.material_id])).rows[0].q;
    const required = Number(l.quantity) * factor;
    const onHand = Number(oh);
    const used = usedMap[l.material_id] || 0;
    return {
      material_id: l.material_id, material_code: l.product_code, material_name: l.product_name, unit: l.unit,
      required, on_hand: onHand, to_replenish: Math.max(0, required - onHand), used,
    };
  }));
}

exports.getById = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT so.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address
      FROM sales_orders so JOIN customers c ON c.id = so.customer_id
      WHERE so.id = $1 AND so.is_deleted = FALSE`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    const items = await db.query(`
      SELECT it.*, p.product_name, p.product_code
      FROM sales_order_items it JOIN products p ON p.id = it.product_id
      WHERE it.sales_order_id = $1 ORDER BY p.product_code`, [req.params.id]);
    // Làm giàu từng dòng: lệnh SX + tag NVL (định mức / tồn / cần bổ sung / đã dùng)
    const enriched = await Promise.all(items.rows.map(async (it) => {
      const orders = (await db.query(`
        SELECT id, order_code, quantity, unit, status FROM production_orders
        WHERE sales_order_item_id = $1 AND is_deleted = FALSE ORDER BY created_at`, [it.id])).rows;
      const materials = await lineMaterials(it);
      return { ...it, production_orders: orders, materials };
    }));
    res.json({ ...rows[0], items: enriched });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy chi tiết đơn hàng' }); }
};

// Đơn hàng + dòng hàng của 1 khách (chỉ để xem ở màn khách hàng)
exports.byCustomer = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT so.id, so.order_code, so.order_date, so.due_date, so.status
      FROM sales_orders so
      WHERE so.customer_id = $1 AND so.is_deleted = FALSE
      ORDER BY so.created_at DESC`, [req.params.id]);
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      const items = await db.query(`
        SELECT it.sales_order_id, it.quantity, it.unit, it.specs, it.attr_size, it.attr_thickness, it.attr_color,
               p.product_code, p.product_name
        FROM sales_order_items it JOIN products p ON p.id = it.product_id
        WHERE it.sales_order_id = ANY($1) ORDER BY p.product_code`, [ids]);
      const byOrder = {};
      items.rows.forEach((it) => { (byOrder[it.sales_order_id] = byOrder[it.sales_order_id] || []).push(it); });
      rows.forEach((r) => { r.items = byOrder[r.id] || []; });
    }
    res.json({ data: rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy đơn hàng của khách' }); }
};

const numOrNull = (v) => (v === '' || v == null ? null : v);

// UPSERT dòng hàng: giữ id cũ (không xóa-tạo lại) để bảo toàn ngày thực tế + liên kết lệnh SX.
async function saveItems(client, orderId, items) {
  const list = (Array.isArray(items) ? items : []).filter((x) => x && x.product_id && x.quantity);
  const keepIds = list.filter((x) => x.id).map((x) => x.id);
  // Xóa các dòng bị bỏ khỏi form (dòng còn giữ thì cập nhật)
  if (keepIds.length) await client.query(`DELETE FROM sales_order_items WHERE sales_order_id = $1 AND id <> ALL($2::uuid[])`, [orderId, keepIds]);
  else await client.query(`DELETE FROM sales_order_items WHERE sales_order_id = $1`, [orderId]);

  for (const it of list) {
    const specs = specsFromBody(it);
    const a = legacyAttrs(specs);
    const base = [it.product_id, it.quantity, upUnit(it.unit), JSON.stringify(specs), buildSpecKey(specs),
      a.size, a.thickness, a.color, numOrNull(it.core_weight), numOrNull(it.total_weight), it.note || null,
      it.planned_start_date || null, it.planned_end_date || null];
    if (it.id) {
      await client.query(
        `UPDATE sales_order_items SET product_id=$1, quantity=$2, unit=$3, specs=$4::jsonb, spec_key=$5,
           attr_size=$6, attr_thickness=$7, attr_color=$8, core_weight=$9, total_weight=$10, note=$11,
           planned_start_date=$12, planned_end_date=$13
         WHERE id=$14 AND sales_order_id=$15`, [...base, it.id, orderId]);
    } else {
      await client.query(
        `INSERT INTO sales_order_items
           (sales_order_id, product_id, quantity, unit, specs, spec_key, attr_size, attr_thickness, attr_color,
            core_weight, total_weight, note, planned_start_date, planned_end_date)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [orderId, it.product_id, it.quantity, upUnit(it.unit), JSON.stringify(specs), buildSpecKey(specs),
         a.size, a.thickness, a.color, numOrNull(it.core_weight), numOrNull(it.total_weight), it.note || null,
         it.planned_start_date || null, it.planned_end_date || null]);
    }
  }
}

exports.create = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const b = req.body;
    if (!b.customer_id) return res.status(400).json({ message: 'Vui lòng chọn Khách hàng' });
    if (!Array.isArray(b.items) || !b.items.filter(x => x.product_id && x.quantity).length)
      return res.status(400).json({ message: 'Đơn hàng cần ít nhất 1 dòng hàng hợp lệ' });
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO sales_orders (customer_id, order_date, due_date, status, note)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.customer_id, b.order_date || new Date(), b.due_date || null, b.status || 'Mới', b.note || null]);
    await saveItems(client, rows[0].id, b.items);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi tạo đơn hàng' }); }
  finally { client.release(); }
};

exports.update = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const b = req.body;
    await client.query('BEGIN');
    const fields = ['customer_id', 'order_date', 'due_date', 'status', 'note'];
    const cols = [], vals = []; let i = 1;
    for (const f of fields) if (b[f] !== undefined) { cols.push(`${f} = $${i++}`); vals.push(b[f] === '' ? null : b[f]); }
    if (cols.length) {
      const r = await client.query(`UPDATE sales_orders SET ${cols.join(', ')} WHERE id = $${i} AND is_deleted = FALSE RETURNING id`, [...vals, req.params.id]);
      if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Không tìm thấy đơn hàng' }); }
    }
    if (b.items !== undefined) await saveItems(client, req.params.id, b.items);
    await client.query('COMMIT');
    res.json({ message: 'Đã cập nhật đơn hàng' });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi cập nhật' }); }
  finally { client.release(); }
};

exports.remove = async (req, res) => {
  try {
    const g = await guardDelete('sales_orders', req.params.id, {
      allow: ['Đã hủy'],
      message: 'Không thể xóa đơn hàng đang xử lý. Chỉ xóa được đơn ở trạng thái "Đã hủy" — vui lòng chuyển đơn sang "Đã hủy" trước, rồi mới xóa.',
    });
    if (g.notFound) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    if (g.blocked) return res.status(400).json({ message: g.message });

    const { rowCount } = await db.query(`UPDATE sales_orders SET is_deleted = TRUE WHERE id = $1 AND is_deleted = FALSE`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    res.json({ message: 'Đã xóa đơn hàng' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi xóa' }); }
};
