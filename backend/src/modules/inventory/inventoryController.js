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
    
    const invModules = ['inventory', 'rep_inv', 'inv_adjust', 'inv_inbound', 'inv_outbound', 'inv_transfer'];
    let scopeCond = '1=0';
    for (const mod of invModules) {
      scopeCond = getDataScope(req, mod, 'view', { warehouseCol: 'w.name' });
      if (scopeCond !== '1=0') break;
    }
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
    
    const invModules = ['inventory', 'rep_inv', 'inv_adjust', 'inv_inbound', 'inv_outbound', 'inv_transfer'];
    let scopeCond = '1=0';
    for (const mod of invModules) {
      scopeCond = getDataScope(req, mod, 'view', { warehouseCol: 'w.name' });
      if (scopeCond !== '1=0') break;
    }
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

// Helper: kiểm tra 1 action trong permissions, hỗ trợ cả 3 định dạng:
//   - boolean true (cũ)
//   - string 'ALLOW' (cũ)
//   - object { status: 'ALLOW', scope: '...' } (mới)
function checkPerm(permissions, moduleKey, action) {
  const mod = permissions?.[moduleKey];
  if (!mod) return false;
  const pval = mod[action];
  if (!pval) return false;
  if (typeof pval === 'object') return pval.status === 'ALLOW';
  return pval === 'ALLOW' || pval === true;
}

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
      if (b.trx_type === 'Nhập')       reqApp = 'inv_inbound';
      if (b.trx_type === 'Xuất')       reqApp = 'inv_outbound';
      if (b.trx_type === 'Điều chỉnh') reqApp = 'inv_adjust';
      const perms = req.user.permissions;
      const hasPerm =
        checkPerm(perms, reqApp, 'create') ||
        checkPerm(perms, reqApp, 'edit');
      const hasFallback =
        checkPerm(perms, 'inventory', 'edit') ||
        checkPerm(perms, 'inventory', 'create');

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

// ── PHIẾU XUẤT KHO (outbound slips) ───────────────────────────────────────────
// GET /api/outbound-slips?status= — danh sách phiếu (mặc định tất cả)
exports.listOutboundSlips = async (req, res) => {
  try {
    const where = []; const params = []; let i = 1;
    if (req.query.status) { where.push(`s.status = $${i++}`); params.push(req.query.status); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await db.query(`
      SELECT s.*, po.order_code AS prod_order_code,
             w.name AS warehouse_name, l.name AS location_name,
             (SELECT COUNT(*)::int FROM outbound_slip_lines sl WHERE sl.slip_id = s.id) AS line_count,
             (SELECT COALESCE(SUM(sl.quantity),0) FROM outbound_slip_lines sl WHERE sl.slip_id = s.id) AS total_qty
      FROM outbound_slips s
      LEFT JOIN production_orders po ON po.id = s.prod_order_id
      LEFT JOIN locations l ON l.id = s.location_id
      LEFT JOIN warehouses w ON w.id = l.warehouse_id
      ${whereSql} ORDER BY s.created_at DESC LIMIT 300`, params);
    res.json({ data: rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy danh sách phiếu xuất' }); }
};

// GET /api/outbound-slips/:id — chi tiết phiếu + dòng + tồn kho hiện tại
exports.getOutboundSlip = async (req, res) => {
  try {
    const s = (await db.query(`
      SELECT s.*, po.order_code AS prod_order_code, w.name AS warehouse_name, l.name AS location_name
      FROM outbound_slips s
      LEFT JOIN production_orders po ON po.id = s.prod_order_id
      LEFT JOIN locations l ON l.id = s.location_id
      LEFT JOIN warehouses w ON w.id = l.warehouse_id
      WHERE s.id = $1`, [req.params.id])).rows[0];
    if (!s) return res.status(404).json({ message: 'Không tìm thấy phiếu xuất' });
    const lines = (await db.query(`
      SELECT sl.*, p.product_code, p.product_name,
             COALESCE((SELECT SUM(quantity) FROM inventory_stock st WHERE st.product_id = sl.product_id), 0) AS on_hand
      FROM outbound_slip_lines sl JOIN products p ON p.id = sl.product_id
      WHERE sl.slip_id = $1 ORDER BY p.product_code`, [req.params.id])).rows;
    res.json({ data: { ...s, lines } });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy chi tiết phiếu xuất' }); }
};

// POST /api/outbound-slips/:id/confirm — XÁC NHẬN xuất kho → TRỪ TỒN (1 lần). Chặn nếu tồn không đủ.
exports.confirmOutboundSlip = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const s = (await client.query(`SELECT * FROM outbound_slips WHERE id = $1`, [req.params.id])).rows[0];
    if (!s) return res.status(404).json({ message: 'Không tìm thấy phiếu xuất' });
    if (s.status === 'Đã xuất') return res.status(400).json({ message: 'Phiếu này đã được xuất kho rồi.' });
    if (s.status === 'Đã hủy') return res.status(400).json({ message: 'Phiếu đã hủy, không thể xuất.' });
    const lines = (await client.query(`SELECT * FROM outbound_slip_lines WHERE slip_id = $1`, [req.params.id])).rows;
    if (!lines.length) return res.status(400).json({ message: 'Phiếu chưa có dòng hàng.' });

    // Chặn tồn âm — báo cần mua (Kiểm tra theo đúng vị trí xuất)
    const shortages = [];
    const allocations = []; // { product_id, lot_code, quantity, unit }

    for (const l of lines) {
      const requiredQty = Number(l.quantity);
      
      // Lấy danh sách các lô có tồn > 0 của sản phẩm tại vị trí xuất, ưu tiên FIFO (id ASC)
      const { rows: stockRows } = await client.query(
        `SELECT lot_code, quantity, unit
         FROM inventory_stock
         WHERE product_id = $1 AND location_id = $2 AND quantity > 0
         ORDER BY id ASC`,
        [l.product_id, s.location_id]
      );

      const totalOnHand = stockRows.reduce((sum, r) => sum + Number(r.quantity), 0);
      
      if (requiredQty > totalOnHand) {
        const p = (await client.query(`SELECT product_code, product_name, unit FROM products WHERE id = $1`, [l.product_id])).rows[0] || {};
        shortages.push({ code: p.product_code, name: p.product_name, unit: l.unit || p.unit || '', on_hand: totalOnHand, need: requiredQty, buy: requiredQty - totalOnHand });
      } else {
        // Phân bổ FIFO
        let remain = requiredQty;
        for (const sr of stockRows) {
          if (remain <= 0) break;
          const qtyToTake = Math.min(remain, Number(sr.quantity));
          allocations.push({
            product_id: l.product_id,
            lot_code: sr.lot_code || '',
            quantity: qtyToTake,
            unit: l.unit || sr.unit,
          });
          remain -= qtyToTake;
        }
      }
    }

    if (shortages.length) {
      const msg = 'Không đủ tồn kho tại vị trí xuất — vui lòng nhập/chuyển kho đến vị trí này trước:\n' +
        shortages.map((x) => `• ${x.code} ${x.name}: tồn ${x.on_hand} ${x.unit}, cần ${x.need} ${x.unit} → thiếu ${x.buy} ${x.unit}`).join('\n');
      return res.status(400).json({ message: msg, shortages });
    }

    await client.query('BEGIN');
    for (const alloc of allocations) {
      await client.query(
        `INSERT INTO inventory_stock (product_id, location_id, spec_key, lot_code, quantity, unit)
         VALUES ($1,$2,'',$3,$4,$5)
         ON CONFLICT (product_id, location_id, spec_key, lot_code)
         DO UPDATE SET quantity = inventory_stock.quantity + EXCLUDED.quantity, unit = COALESCE(EXCLUDED.unit, inventory_stock.unit), updated_at = now()`,
        [alloc.product_id, s.location_id, alloc.lot_code, -alloc.quantity, upUnit(alloc.unit)]);
      await client.query(
        `INSERT INTO inventory_transactions (product_id, location_id, trx_type, quantity, lot_code, ref_code, note)
         VALUES ($1,$2,'Xuất',$3,$4,$5,$6)`,
        [alloc.product_id, s.location_id, alloc.quantity, alloc.lot_code, s.slip_code, s.purpose || 'Xuất kho']);
    }
    await client.query(`UPDATE outbound_slips SET status = 'Đã xuất', confirmed_at = now() WHERE id = $1`, [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: `Đã xác nhận xuất kho phiếu ${s.slip_code} (${lines.length} dòng).`, count: lines.length });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi xác nhận xuất kho' }); }
  finally { client.release(); }
};

// POST /api/outbound-slips/:id/cancel — HỦY phiếu (chỉ khi Chờ xuất). Mở khóa lệnh SX nguồn.
exports.cancelOutboundSlip = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const s = (await client.query(`SELECT * FROM outbound_slips WHERE id = $1`, [req.params.id])).rows[0];
    if (!s) return res.status(404).json({ message: 'Không tìm thấy phiếu xuất' });
    if (s.status !== 'Chờ xuất') return res.status(400).json({ message: 'Chỉ hủy được phiếu đang Chờ xuất.' });
    await client.query('BEGIN');
    await client.query(`UPDATE outbound_slips SET status = 'Đã hủy' WHERE id = $1`, [req.params.id]);
    if (s.prod_order_id) await client.query(`UPDATE production_orders SET materials_issued = FALSE WHERE id = $1`, [s.prod_order_id]);
    await client.query('COMMIT');
    res.json({ message: `Đã hủy phiếu ${s.slip_code}.` });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi hủy phiếu' }); }
  finally { client.release(); }
};

// ── CHUYỂN KHO (atomic: Xuất + Nhập trong 1 transaction) ──────────────────────
// POST /api/inventory/transfer
// Body: { product_id, from_location_id, to_location_id, quantity, unit, lot_code, note }
exports.transfer = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const b = req.body;
    if (!b.product_id)        return res.status(400).json({ message: 'Thiếu sản phẩm' });
    if (!b.from_location_id)  return res.status(400).json({ message: 'Thiếu kho/vị trí nguồn' });
    if (!b.to_location_id)    return res.status(400).json({ message: 'Thiếu kho/vị trí đích' });
    if (!b.quantity || Number(b.quantity) <= 0) return res.status(400).json({ message: 'Số lượng phải lớn hơn 0' });
    if (b.from_location_id === b.to_location_id) return res.status(400).json({ message: 'Kho nguồn và đích không được giống nhau' });

    // Kiểm tra quyền chuyển kho
    if (!req.user.is_admin) {
      const perms = req.user.permissions;
      const hasPerm = checkPerm(perms, 'inv_transfer', 'create') || checkPerm(perms, 'inv_transfer', 'edit');
      const hasFallback = checkPerm(perms, 'inventory', 'edit') || checkPerm(perms, 'inventory', 'create');
      if (!hasPerm && !hasFallback) {
        return res.status(403).json({ message: 'Bạn không có quyền chuyển kho' });
      }
    }

    const qty = Number(b.quantity);
    const lot = b.lot_code || '';
    const unit = upUnit(b.unit);

    // Chặn cứng: kiểm tra tồn kho tại kho nguồn trước khi bắt đầu transaction
    const onHandRow = await db.query(
      `SELECT COALESCE(SUM(quantity), 0)::numeric AS q
       FROM inventory_stock
       WHERE product_id = $1 AND location_id = $2`,
      [b.product_id, b.from_location_id]
    );
    const onHand = Number(onHandRow.rows[0].q);
    if (qty > onHand) {
      const prod = (await db.query(`SELECT product_code, product_name FROM products WHERE id = $1`, [b.product_id])).rows[0] || {};
      return res.status(400).json({
        message: `Không đủ tồn kho tại kho nguồn — ${prod.product_code} ${prod.product_name}: tồn ${onHand}, cần chuyển ${qty}`,
      });
    }

    const fromLoc = (await db.query(`SELECT l.name, w.name AS wname FROM locations l LEFT JOIN warehouses w ON w.id = l.warehouse_id WHERE l.id = $1`, [b.from_location_id])).rows[0];
    const toLoc   = (await db.query(`SELECT l.name, w.name AS wname FROM locations l LEFT JOIN warehouses w ON w.id = l.warehouse_id WHERE l.id = $1`, [b.to_location_id])).rows[0];
    const fromLabel = fromLoc ? `${fromLoc.wname || ''} · ${fromLoc.name}` : b.from_location_id;
    const toLabel   = toLoc   ? `${toLoc.wname   || ''} · ${toLoc.name}`   : b.to_location_id;

    await client.query('BEGIN');

    // 1. Xuất khỏi kho nguồn
    await client.query(
      `INSERT INTO inventory_stock (product_id, location_id, specs, spec_key, lot_code, quantity, unit)
       VALUES ($1, $2, '{}'::jsonb, '', $3, $4, $5)
       ON CONFLICT (product_id, location_id, spec_key, lot_code)
       DO UPDATE SET quantity = inventory_stock.quantity + EXCLUDED.quantity,
                     unit = COALESCE(EXCLUDED.unit, inventory_stock.unit),
                     updated_at = now()`,
      [b.product_id, b.from_location_id, lot, -qty, unit]);
    await client.query(
      `INSERT INTO inventory_transactions (product_id, location_id, trx_type, quantity, lot_code, ref_code, note)
       VALUES ($1, $2, 'Xuất', $3, $4, NULL, $5)`,
      [b.product_id, b.from_location_id, qty, lot, `Chuyển kho → ${toLabel}${b.note ? ' | ' + b.note : ''}`]);

    // 2. Nhập vào kho đích
    await client.query(
      `INSERT INTO inventory_stock (product_id, location_id, specs, spec_key, lot_code, quantity, unit)
       VALUES ($1, $2, '{}'::jsonb, '', $3, $4, $5)
       ON CONFLICT (product_id, location_id, spec_key, lot_code)
       DO UPDATE SET quantity = inventory_stock.quantity + EXCLUDED.quantity,
                     unit = COALESCE(EXCLUDED.unit, inventory_stock.unit),
                     updated_at = now()`,
      [b.product_id, b.to_location_id, lot, qty, unit]);
    await client.query(
      `INSERT INTO inventory_transactions (product_id, location_id, trx_type, quantity, lot_code, ref_code, note)
       VALUES ($1, $2, 'Nhập', $3, $4, NULL, $5)`,
      [b.product_id, b.to_location_id, qty, lot, `Chuyển kho ← ${fromLabel}${b.note ? ' | ' + b.note : ''}`]);

    await client.query('COMMIT');
    res.status(201).json({ message: `Đã chuyển ${qty} ${unit} từ ${fromLabel} → ${toLabel}` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: err.detail || 'Lỗi khi chuyển kho' });
  } finally { client.release(); }
};
