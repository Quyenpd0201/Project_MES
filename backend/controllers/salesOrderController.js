// backend/controllers/salesOrderController.js — Đơn hàng + dòng hàng (xuất phiếu)
const db = require('../db');

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
    res.json({ ...rows[0], items: items.rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy chi tiết đơn hàng' }); }
};

async function saveItems(client, orderId, items) {
  await client.query('DELETE FROM sales_order_items WHERE sales_order_id = $1', [orderId]);
  for (const it of (Array.isArray(items) ? items : []).filter(x => x && x.product_id && x.quantity)) {
    await client.query(
      `INSERT INTO sales_order_items (sales_order_id, product_id, quantity, unit, attr_size, attr_thickness, attr_color, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [orderId, it.product_id, it.quantity, it.unit || null,
       it.attr_size || null, it.attr_thickness || null, it.attr_color || null, it.note || null]);
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
    const { rowCount } = await db.query(`UPDATE sales_orders SET is_deleted = TRUE WHERE id = $1 AND is_deleted = FALSE`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    res.json({ message: 'Đã xóa đơn hàng' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi xóa' }); }
};
