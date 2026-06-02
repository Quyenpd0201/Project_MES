// backend/controllers/inventoryController.js
const db = require('../db');

// GET /api/inventory — tồn kho theo sản phẩm + đa thuộc tính + vị trí
exports.list = async (req, res) => {
  try {
    const where = [];
    const params = []; let i = 1;
    const { product_id, warehouse_id, q } = req.query;
    if (product_id)   { where.push(`s.product_id = $${i++}`); params.push(product_id); }
    if (warehouse_id) { where.push(`l.warehouse_id = $${i++}`); params.push(warehouse_id); }
    if (q)            { where.push(`(p.product_name ILIKE $${i} OR p.product_code ILIKE $${i})`); params.push(`%${q}%`); i++; }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await db.query(`
      SELECT s.*, p.product_name, p.product_code, p.product_type,
             l.name AS location_name, w.name AS warehouse_name, w.warehouse_type
      FROM inventory_stock s
      JOIN products p ON p.id = s.product_id
      LEFT JOIN locations l ON l.id = s.location_id
      LEFT JOIN warehouses w ON w.id = l.warehouse_id
      ${whereSql}
      ORDER BY p.product_code, s.attr_color, s.attr_size
    `, params);
    res.json({ data: rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy tồn kho' }); }
};

// GET /api/inventory/transactions — lịch sử nhập/xuất/điều chỉnh
exports.transactions = async (req, res) => {
  try {
    const where = [];
    const params = []; let i = 1;
    const { product_id, trx_type, q } = req.query;
    if (product_id) { where.push(`tr.product_id = $${i++}`); params.push(product_id); }
    if (trx_type)   { where.push(`tr.trx_type = $${i++}`); params.push(trx_type); }
    if (q)          { where.push(`(p.product_name ILIKE $${i} OR p.product_code ILIKE $${i} OR tr.ref_code ILIKE $${i})`); params.push(`%${q}%`); i++; }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await db.query(`
      SELECT tr.*, p.product_name, p.product_code,
             l.name AS location_name, w.name AS warehouse_name
      FROM inventory_transactions tr
      JOIN products p ON p.id = tr.product_id
      LEFT JOIN locations l ON l.id = tr.location_id
      LEFT JOIN warehouses w ON w.id = l.warehouse_id
      ${whereSql} ORDER BY tr.created_at DESC LIMIT 300`, params);
    res.json({ data: rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy lịch sử giao dịch' }); }
};

// POST /api/inventory/adjust — nhập/xuất/điều chỉnh, upsert tồn + ghi giao dịch
exports.adjust = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const b = req.body;
    if (!b.product_id || b.quantity === undefined || !b.trx_type)
      return res.status(400).json({ message: 'Thiếu Sản phẩm / Số lượng / Loại giao dịch' });
    const delta = b.trx_type === 'Xuất' ? -Math.abs(Number(b.quantity)) : Number(b.quantity);
    const a = { size: b.attr_size || '', thickness: b.attr_thickness || '', color: b.attr_color || '' };

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO inventory_stock (product_id, location_id, attr_size, attr_thickness, attr_color, quantity, unit)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (product_id, location_id, attr_size, attr_thickness, attr_color)
       DO UPDATE SET quantity = inventory_stock.quantity + EXCLUDED.quantity,
                     unit = COALESCE(EXCLUDED.unit, inventory_stock.unit),
                     updated_at = now()`,
      [b.product_id, b.location_id || null, a.size, a.thickness, a.color, delta, b.unit || null]);
    await client.query(
      `INSERT INTO inventory_transactions (product_id, location_id, trx_type, quantity, attr_size, attr_thickness, attr_color, ref_code, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [b.product_id, b.location_id || null, b.trx_type, Math.abs(Number(b.quantity)), a.size, a.thickness, a.color, b.ref_code || null, b.note || null]);
    await client.query('COMMIT');
    res.status(201).json({ message: 'Đã cập nhật tồn kho' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi điều chỉnh tồn kho' });
  } finally { client.release(); }
};
