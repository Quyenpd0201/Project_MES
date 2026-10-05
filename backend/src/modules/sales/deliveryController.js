// backend/controllers/deliveryController.js — Phiếu giao hàng & thanh toán
const db = require('../../core/db');
const { upUnit } = require('../../core/lib/units');
const { guardDelete } = require('../../core/lib/deleteGuard');

const num = (v) => (v === '' || v == null ? 0 : Number(v) || 0);

// Quyền xem tiền ở Phiếu giao hàng (chặn ở backend — không chỉ ẩn UI)
function canViewAmounts(req) {
  if (req.user?.is_admin) return true;
  const p = req.user?.permissions?.deliveries;
  const v = p?.view_amounts, f = p?.fields?.amounts;
  return v === 'ALLOW' || v === true || v?.status === 'ALLOW' || f === 'edit' || f === 'view';
}
const stripMoneyItem = (it) => { const { unit_price, amount, ...rest } = it; return rest; };

exports.list = async (req, res) => {
  try {
    const where = ['d.is_deleted = FALSE']; const params = []; let i = 1;
    const { q, status } = req.query;
    if (status) { where.push(`d.status = $${i++}`); params.push(status); }
    if (q)      { where.push(`(d.note_code ILIKE $${i} OR c.name ILIKE $${i})`); params.push(`%${q}%`); i++; }
    const { rows } = await db.query(`
      SELECT d.*, c.name AS customer_name, so.order_code AS sales_order_code,
             (SELECT COUNT(*)::int FROM delivery_note_items it WHERE it.delivery_note_id = d.id) AS item_count
      FROM delivery_notes d
      LEFT JOIN customers c ON c.id = d.customer_id
      LEFT JOIN sales_orders so ON so.id = d.sales_order_id
      WHERE ${where.join(' AND ')} ORDER BY d.created_at DESC`, params);
    if (!canViewAmounts(req)) rows.forEach((r) => { delete r.total_amount; delete r.paid_amount; });
    res.json({ data: rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy danh sách phiếu' }); }
};

exports.getById = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT d.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address,
             so.order_code AS sales_order_code
      FROM delivery_notes d
      LEFT JOIN customers c ON c.id = d.customer_id
      LEFT JOIN sales_orders so ON so.id = d.sales_order_id
      WHERE d.id = $1 AND d.is_deleted = FALSE`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy phiếu' });
    const items = await db.query(`SELECT * FROM delivery_note_items WHERE delivery_note_id = $1 ORDER BY line_no`, [req.params.id]);
    const d = rows[0];
    if (!canViewAmounts(req)) {
      delete d.total_amount; delete d.paid_amount;
      return res.json({ ...d, items: items.rows.map(stripMoneyItem) });
    }
    res.json({ ...d, items: items.rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy chi tiết phiếu' }); }
};

// Lấy dòng hàng của 1 đơn để tạo phiếu giao: kèm SL đặt / đã SX / đã giao / còn lại
exports.fromOrder = async (req, res) => {
  try {
    const so = (await db.query(`
      SELECT so.id, so.order_code, so.customer_id, c.name AS customer_name
      FROM sales_orders so LEFT JOIN customers c ON c.id = so.customer_id
      WHERE so.id = $1 AND so.is_deleted = FALSE`, [req.params.orderId])).rows[0];
    if (!so) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    const items = (await db.query(`
      SELECT it.id AS sales_order_item_id, it.product_id, p.product_name, it.specs, it.unit, it.unit_price,
             it.quantity AS ordered,
             COALESCE((SELECT SUM(po.posted_qty) FROM production_orders po
                       WHERE po.sales_order_item_id = it.id AND po.is_deleted = FALSE), 0) AS produced,
             COALESCE((SELECT SUM(di.quantity) FROM delivery_note_items di
                       JOIN delivery_notes dn ON dn.id = di.delivery_note_id
                       WHERE di.sales_order_item_id = it.id AND dn.is_deleted = FALSE AND dn.status <> 'Đã hủy'), 0) AS delivered
      FROM sales_order_items it JOIN products p ON p.id = it.product_id
      WHERE it.sales_order_id = $1 ORDER BY p.product_code`, [req.params.orderId])).rows;
    const showAmt = canViewAmounts(req);
    res.json({
      sales_order_id: so.id, sales_order_code: so.order_code, customer_id: so.customer_id, customer_name: so.customer_name,
      items: items.map((it) => {
        const ordered = Number(it.ordered) || 0, delivered = Number(it.delivered) || 0;
        const base = { ...it, ordered, produced: Number(it.produced) || 0, delivered, remaining: Math.max(0, ordered - delivered) };
        if (showAmt) base.unit_price = Number(it.unit_price) || 0; else delete base.unit_price;
        return base;
      }),
    });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy đơn hàng' }); }
};

// Cập nhật trạng thái ĐƠN HÀNG sau khi giao: còn lại > 0 → "Chuyển hàng 1 phần"; = 0 (tất cả dòng) → "Hoàn thành"
async function updateOrderStatusAfterDelivery(client, salesOrderId) {
  if (!salesOrderId) return;
  const rows = (await client.query(`
    SELECT it.quantity AS ordered,
           COALESCE((SELECT SUM(di.quantity) FROM delivery_note_items di
                     JOIN delivery_notes dn ON dn.id = di.delivery_note_id
                     WHERE di.sales_order_item_id = it.id AND dn.is_deleted = FALSE AND dn.status <> 'Đã hủy'), 0) AS delivered
    FROM sales_order_items it WHERE it.sales_order_id = $1`, [salesOrderId])).rows;
  if (!rows.length) return;
  const anyDelivered = rows.some((r) => Number(r.delivered) > 0);
  if (!anyDelivered) return; // chưa giao gì thì không đổi trạng thái
  const allDone = rows.every((r) => Number(r.delivered) >= Number(r.ordered) - 1e-6);
  const newStatus = allDone ? 'Hoàn thành' : 'Chuyển hàng 1 phần';
  await client.query(
    `UPDATE sales_orders SET status = $1, updated_at = now() WHERE id = $2 AND is_deleted = FALSE AND status <> 'Đã hủy'`,
    [newStatus, salesOrderId]);
}

async function saveItems(client, noteId, items) {
  await client.query('DELETE FROM delivery_note_items WHERE delivery_note_id = $1', [noteId]);
  const list = (Array.isArray(items) ? items : []).filter((x) => x && (x.product_id || x.product_name));
  // Tra tên + đơn vị sản phẩm nếu dòng chưa có (đảm bảo NỘI DUNG luôn có dữ liệu)
  const ids = [...new Set(list.filter((x) => x.product_id).map((x) => x.product_id))];
  const pmap = {};
  if (ids.length) {
    const pr = await client.query(`SELECT id, product_name, unit FROM products WHERE id = ANY($1::uuid[])`, [ids]);
    pr.rows.forEach((p) => { pmap[p.id] = p; });
  }
  let n = 1, total = 0;
  for (const it of list) {
    const p = it.product_id ? pmap[it.product_id] : null;
    const qty = num(it.quantity), price = num(it.unit_price);
    const actQty = it.actual_quantity === '' || it.actual_quantity == null ? null : num(it.actual_quantity);
    const amount = (actQty !== null ? actQty : qty) * price; total += amount;
    await client.query(
      `INSERT INTO delivery_note_items (delivery_note_id, product_id, product_name, specs, quantity, unit, unit_price, amount, line_no, actual_quantity, sales_order_item_id)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11)`,
      [noteId, it.product_id || null, it.product_name || (p && p.product_name) || null, JSON.stringify(it.specs || {}),
       qty, upUnit(it.unit || (p && p.unit)), price, amount, n++, actQty, it.sales_order_item_id || null]);
  }
  return total;
}

exports.create = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const b = req.body;
    if (!b.customer_id) return res.status(400).json({ message: 'Vui lòng chọn Khách hàng' });
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO delivery_notes (sales_order_id, customer_id, delivery_date, status, note, paid_amount)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.sales_order_id || null, b.customer_id, b.delivery_date || new Date(), b.status || 'Đã xuất hóa đơn', b.note || null, num(b.paid_amount)]);
    const total = await saveItems(client, rows[0].id, b.items);
    await client.query(`UPDATE delivery_notes SET total_amount = $1 WHERE id = $2`, [total, rows[0].id]);
    await updateOrderStatusAfterDelivery(client, b.sales_order_id || null);
    await client.query('COMMIT');
    res.status(201).json({ ...rows[0], total_amount: total });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi tạo phiếu' }); }
  finally { client.release(); }
};

exports.update = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const b = req.body;
    await client.query('BEGIN');
    const fields = ['sales_order_id', 'customer_id', 'delivery_date', 'status', 'note'];
    const cols = [], vals = []; let i = 1;
    for (const f of fields) if (b[f] !== undefined) { cols.push(`${f} = $${i++}`); vals.push(b[f] === '' ? null : b[f]); }
    if (b.paid_amount !== undefined) { cols.push(`paid_amount = $${i++}`); vals.push(num(b.paid_amount)); }
    cols.push(`updated_at = now()`);
    const r = await client.query(`UPDATE delivery_notes SET ${cols.join(', ')} WHERE id = $${i} AND is_deleted = FALSE RETURNING id`, [...vals, req.params.id]);
    if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Không tìm thấy phiếu' }); }
    if (b.items !== undefined) {
      const total = await saveItems(client, req.params.id, b.items);
      await client.query(`UPDATE delivery_notes SET total_amount = $1 WHERE id = $2`, [total, req.params.id]);
    }
    // Lấy sales_order_id của phiếu để cập nhật trạng thái đơn
    const soId = (await client.query(`SELECT sales_order_id FROM delivery_notes WHERE id = $1`, [req.params.id])).rows[0]?.sales_order_id;
    await updateOrderStatusAfterDelivery(client, soId);
    await client.query('COMMIT');
    res.json({ message: 'Đã cập nhật phiếu' });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: err.detail || 'Lỗi khi cập nhật phiếu' }); }
  finally { client.release(); }
};

exports.remove = async (req, res) => {
  try {
    const g = await guardDelete('delivery_notes', req.params.id, {
      allow: ['Đã hủy'],
      message: 'Không thể xóa phiếu đang xử lý / đã thu tiền. Chỉ xóa được phiếu ở trạng thái "Đã hủy" — vui lòng chuyển phiếu sang "Đã hủy" trước, rồi mới xóa.',
    });
    if (g.notFound) return res.status(404).json({ message: 'Không tìm thấy phiếu' });
    if (g.blocked) return res.status(400).json({ message: g.message });

    const { rowCount } = await db.query(`UPDATE delivery_notes SET is_deleted = TRUE WHERE id = $1 AND is_deleted = FALSE`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Không tìm thấy phiếu' });
    res.json({ message: 'Đã xóa phiếu' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi xóa phiếu' }); }
};
