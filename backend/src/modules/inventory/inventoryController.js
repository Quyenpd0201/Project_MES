// backend/controllers/inventoryController.js
const db = require('../../core/db');
const { buildSpecKey, legacyAttrs, specsFromBody } = require('../../core/lib/specs');
const { upUnit } = require('../../core/lib/units');
const { getDataScope } = require('../../core/dataScope');

// GET /api/inventory/tree — tồn kho (trả về dữ liệu phẳng để frontend tự nhóm)
exports.tree = async (req, res) => {
  try {
    const where = [];
    const params = []; let i = 1;
    const { product_id, q } = req.query;
    if (product_id) { where.push(`s.product_id = $${i++}`); params.push(product_id); }
    if (q)          { where.push(`(p.product_name ILIKE $${i} OR p.product_code ILIKE $${i} OR s.lot_code ILIKE $${i})`); params.push(`%${q}%`); i++; }
    
    const scopeCond = getDataScope(req, 'inventory', 'view', { warehouseCol: 'w.name' });
    where.push(`(${scopeCond})`);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await db.query(`
      SELECT s.id, s.product_id, p.product_code, p.product_name, p.product_type, p.min_quantity, p.warehouse_limits,
             s.spec_key, s.specs, s.lot_code, s.prod_order_id, po.order_code AS lot_order_code,
             s.quantity, s.unit, s.expiry_date,
             w.id AS warehouse_id, w.name AS warehouse_name, 
             z.id AS zone_id, z.name AS zone_name,
             l.id AS location_id, l.name AS location_name
      FROM inventory_stock s
      JOIN products p ON p.id = s.product_id
      LEFT JOIN locations l ON l.id = s.location_id
      LEFT JOIN zones z ON z.id = l.zone_id
      LEFT JOIN warehouses w ON w.id = l.warehouse_id
      LEFT JOIN production_orders po ON po.id = s.prod_order_id
      ${whereSql}
      ORDER BY p.product_code, s.spec_key, s.lot_code`, params);

    res.json({ data: rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy dữ liệu tồn kho' }); }
};

// GET /api/inventory — tồn kho GỘP theo sản phẩm + kho (mỗi (SP, kho) là 1 dòng)
exports.list = async (req, res) => {
  try {
    const where = [];
    const params = []; let i = 1;
    const { product_id, warehouse_id, q } = req.query;
    if (product_id)   { where.push(`s.product_id = $${i++}`); params.push(product_id); }
    if (warehouse_id) { where.push(`l.warehouse_id = $${i++}`); params.push(warehouse_id); }
    if (q)            { where.push(`(p.product_name ILIKE $${i} OR p.product_code ILIKE $${i})`); params.push(`%${q}%`); i++; }
    
    const scopeCond = getDataScope(req, 'inventory', 'view', { warehouseCol: 'w.name' });
    where.push(`(${scopeCond})`);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await db.query(`
      SELECT p.id AS product_id, p.product_code, p.product_name, p.product_type,
             w.id AS warehouse_id, w.name AS warehouse_name, w.warehouse_type,
             SUM(s.quantity) AS quantity, MAX(s.unit) AS unit, COUNT(*)::int AS line_count
      FROM inventory_stock s
      JOIN products p ON p.id = s.product_id
      LEFT JOIN locations l ON l.id = s.location_id
      LEFT JOIN warehouses w ON w.id = l.warehouse_id
      ${whereSql}
      GROUP BY p.id, w.id, w.name, w.warehouse_type
      ORDER BY p.product_code, w.name
    `, params);
    res.json({ data: rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy tồn kho' }); }
};

// GET /api/inventory/detail?product_id&warehouse_id — chi tiết các dòng tồn (theo vị trí) của 1 (SP, kho)
exports.stockDetail = async (req, res) => {
  try {
    const { product_id, warehouse_id } = req.query;
    if (!product_id) return res.status(400).json({ message: 'Thiếu product_id' });
    const params = [product_id]; let i = 2;
    let whCond;
    if (warehouse_id) { whCond = `l.warehouse_id = $${i++}`; params.push(warehouse_id); }
    else whCond = `l.warehouse_id IS NULL`;
    const lines = await db.query(`
      SELECT s.id, s.location_id, l.name AS location_name,
             s.specs, s.spec_key, s.lot_code, po.order_code AS lot_order_code,
             s.attr_size, s.attr_thickness, s.attr_color, s.quantity, s.unit,
             s.expiry_date, s.counted_qty, s.counted_date
      FROM inventory_stock s
      LEFT JOIN locations l ON l.id = s.location_id
      LEFT JOIN production_orders po ON po.id = s.prod_order_id
      WHERE s.product_id = $1 AND ${whCond}
      ORDER BY l.name NULLS FIRST, s.spec_key, s.lot_code`, params);
    const prod = (await db.query(`SELECT id, product_code, product_name, product_type FROM products WHERE id = $1`, [product_id])).rows[0];
    let warehouse = null;
    if (warehouse_id) warehouse = (await db.query(`SELECT id, name, status FROM warehouses WHERE id = $1`, [warehouse_id])).rows[0];
    res.json({ product: prod, warehouse, lines: lines.rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy chi tiết tồn kho' }); }
};

// POST /api/inventory/stock — thêm / cập nhật 1 dòng tồn (điều chỉnh chủ động)
exports.addStockLine = async (req, res) => {
  try {
    const b = req.body;
    if (!b.product_id) return res.status(400).json({ message: 'Thiếu sản phẩm' });
    const specs = specsFromBody(b);
    const a = legacyAttrs(specs);
    const specKey = buildSpecKey(specs);
    const lot = b.lot_code || '';
    const numOrNull = (v) => (v === '' || v == null ? null : v);
    const { rows } = await db.query(`
      INSERT INTO inventory_stock
        (product_id, location_id, specs, spec_key, lot_code, attr_size, attr_thickness, attr_color, quantity, unit, expiry_date, counted_qty, counted_date)
      VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (product_id, location_id, spec_key, lot_code)
      DO UPDATE SET quantity = EXCLUDED.quantity,
                    specs = EXCLUDED.specs,
                    unit = COALESCE(EXCLUDED.unit, inventory_stock.unit),
                    expiry_date = EXCLUDED.expiry_date,
                    counted_qty = EXCLUDED.counted_qty,
                    counted_date = EXCLUDED.counted_date,
                    updated_at = now()
      RETURNING *`,
      [b.product_id, b.location_id || null, JSON.stringify(specs), specKey, lot, a.size, a.thickness, a.color,
       Number(b.quantity) || 0, upUnit(b.unit),
       b.expiry_date || null, numOrNull(b.counted_qty), b.counted_date || null]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi thêm dòng tồn' }); }
};

// DELETE /api/inventory/stock/:id — xóa 1 dòng tồn
exports.deleteStockLine = async (req, res) => {
  try {
    const { rowCount } = await db.query(`DELETE FROM inventory_stock WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Không tìm thấy dòng tồn' });
    res.json({ message: 'Đã xóa dòng tồn' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi xóa dòng tồn' }); }
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
const VALID_TRX_TYPES = ['Nhập', 'Xuất', 'Điều chỉnh'];
exports.adjust = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const b = req.body;
    if (!b.product_id || b.quantity === undefined || !b.trx_type)
      return res.status(400).json({ message: 'Thiếu Sản phẩm / Số lượng / Loại giao dịch' });
    if (!VALID_TRX_TYPES.includes(b.trx_type))
      return res.status(400).json({ message: `Loại giao dịch không hợp lệ. Chỉ chấp nhận: ${VALID_TRX_TYPES.join(', ')}` });

    if (!req.user.is_admin) {
      let reqApp = 'inventory';
      if (b.trx_type === 'Nhập') reqApp = 'inv_inbound';
      if (b.trx_type === 'Xuất') reqApp = 'inv_outbound';
      if (b.trx_type === 'Điều chỉnh') reqApp = 'inv_adjust';
      // Note: Chuyển kho is two transactions (Xuất then Nhập), it will require both if we secure them both. But the frontend might just use 'inventory:edit' as a fallback.
      
      const p = req.user.permissions?.[reqApp];
      const hasPerm = p && (p.edit === 'ALLOW' || p.edit === true || p.create === 'ALLOW' || p.create === true);
      const pFallback = req.user.permissions?.['inventory'];
      const hasFallback = pFallback && (pFallback.edit === 'ALLOW' || pFallback.edit === true);
      
      if (!hasPerm && !hasFallback) {
         return res.status(403).json({ message: 'Bạn không có quyền thực hiện loại giao dịch này' });
      }
    }

    const delta = b.trx_type === 'Xuất' ? -Math.abs(Number(b.quantity)) : Number(b.quantity);
    const specs = specsFromBody(b);
    const a = legacyAttrs(specs);
    const specKey = buildSpecKey(specs);
    const lot = b.lot_code || '';

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO inventory_stock (product_id, location_id, specs, spec_key, lot_code, attr_size, attr_thickness, attr_color, quantity, unit)
       VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (product_id, location_id, spec_key, lot_code)
       DO UPDATE SET quantity = inventory_stock.quantity + EXCLUDED.quantity,
                     specs = EXCLUDED.specs,
                     unit = COALESCE(EXCLUDED.unit, inventory_stock.unit),
                     updated_at = now()`,
      [b.product_id, b.location_id || null, JSON.stringify(specs), specKey, lot, a.size, a.thickness, a.color, delta, upUnit(b.unit)]);
    await client.query(
      `INSERT INTO inventory_transactions (product_id, location_id, trx_type, quantity, specs, spec_key, lot_code, attr_size, attr_thickness, attr_color, ref_code, note)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12)`,
      [b.product_id, b.location_id || null, b.trx_type, Math.abs(Number(b.quantity)), JSON.stringify(specs), specKey, lot, a.size, a.thickness, a.color, b.ref_code || null, b.note || null]);
    await client.query('COMMIT');
    res.status(201).json({ message: 'Đã cập nhật tồn kho' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi điều chỉnh tồn kho' });
  } finally { client.release(); }
};
