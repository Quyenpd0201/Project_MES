// backend/controllers/planningController.js
const db = require('../db');

/**
 * GET /api/planning/groups
 * Gom nhóm các lệnh sản xuất theo (Màu sắc + Kích thước) để chạy hàng loạt,
 * giảm phế phẩm do súc rửa / chuyển đổi máy (changeover).
 * Mỗi nhóm trả về tổng số lượng + danh sách lệnh, ưu tiên theo ngày giao gần nhất.
 */
exports.groups = async (req, res) => {
  try {
    const onlyPending = req.query.pending !== 'false'; // mặc định chỉ lấy lệnh chưa hoàn thành
    const statusFilter = onlyPending
      ? `AND po.status IN ('Chờ duyệt','Đã lên kế hoạch')`
      : '';
    const { rows } = await db.query(`
      SELECT po.id, po.order_code, po.quantity, po.unit, po.due_date, po.status,
             po.attr_color, po.attr_size, po.attr_thickness, po.group_key,
             po.machine_id, po.planned_date, po.shift,
             p.product_name, p.product_code, c.name AS customer_name, m.name AS machine_name
      FROM production_orders po
      JOIN products p ON p.id = po.product_id
      LEFT JOIN customers c ON c.id = po.customer_id
      LEFT JOIN machines m ON m.id = po.machine_id
      WHERE po.is_deleted = FALSE ${statusFilter}
      ORDER BY po.due_date NULLS LAST, po.created_at
    `);

    const map = new Map();
    for (const r of rows) {
      const key = r.group_key || `${r.attr_color || ''}|${r.attr_size || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          group_key: key,
          attr_color: r.attr_color, attr_size: r.attr_size,
          order_count: 0, total_quantity: 0, earliest_due: null, orders: [],
        });
      }
      const g = map.get(key);
      g.orders.push(r);
      g.order_count += 1;
      g.total_quantity += Number(r.quantity) || 0;
      if (r.due_date && (!g.earliest_due || r.due_date < g.earliest_due)) g.earliest_due = r.due_date;
    }
    // sắp nhóm theo ngày giao sớm nhất
    const groups = [...map.values()].sort((a, b) => {
      if (!a.earliest_due) return 1; if (!b.earliest_due) return -1;
      return a.earliest_due < b.earliest_due ? -1 : 1;
    });
    res.json({ groups, total_orders: rows.length });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi gom nhóm kế hoạch' }); }
};

/**
 * GET /api/planning/from-orders
 * Lập kế hoạch TỪ ĐƠN HÀNG: lấy các dòng đơn hàng còn mở & chưa lên kế hoạch,
 * gom thành lô theo (sản phẩm + màu + kích thước + độ dày),
 * sắp xếp các lô theo NGÀY GIAO sớm nhất (ưu tiên #1).
 */
exports.fromOrders = async (_req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT it.id AS item_id, it.product_id, it.quantity, it.unit,
             it.attr_size, it.attr_thickness, it.attr_color,
             so.id AS sales_order_id, so.order_code, so.due_date, so.customer_id,
             c.name AS customer_name, p.product_name, p.product_code
      FROM sales_order_items it
      JOIN sales_orders so ON so.id = it.sales_order_id
      JOIN products p ON p.id = it.product_id
      LEFT JOIN customers c ON c.id = so.customer_id
      WHERE so.is_deleted = FALSE AND so.status IN ('Mới','Đang sản xuất') AND it.is_planned = FALSE
      ORDER BY so.due_date NULLS LAST, so.created_at
    `);

    const map = new Map();
    for (const r of rows) {
      const key = [r.product_id, r.attr_color || '', r.attr_size || '', r.attr_thickness || ''].join('|');
      if (!map.has(key)) {
        map.set(key, {
          batch_key: key, product_id: r.product_id, product_name: r.product_name, product_code: r.product_code,
          attr_color: r.attr_color, attr_size: r.attr_size, attr_thickness: r.attr_thickness,
          unit: r.unit, total_quantity: 0, earliest_due: null, items: [],
        });
      }
      const g = map.get(key);
      g.items.push(r);
      g.total_quantity += Number(r.quantity) || 0;
      if (r.due_date && (!g.earliest_due || r.due_date < g.earliest_due)) g.earliest_due = r.due_date;
    }
    const batches = [...map.values()].sort((a, b) => {
      if (!a.earliest_due) return 1; if (!b.earliest_due) return -1;
      return a.earliest_due < b.earliest_due ? -1 : 1;
    });
    res.json({ batches, demand_lines: rows.length });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lập kế hoạch từ đơn hàng' }); }
};

/**
 * POST /api/planning/generate
 * Sinh lệnh sản xuất từ các dòng nhu cầu đã chọn + phân bổ nguồn lực (máy/ngày/ca).
 * Mỗi dòng đơn hàng → 1 lệnh SX (truy ngược qua sales_order_item_id),
 * cùng lô được gán cùng máy/ca để chạy liền nhau (giảm changeover).
 */
exports.generate = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { item_ids, machine_id, planned_date, shift, assigned_team } = req.body;
    if (!Array.isArray(item_ids) || !item_ids.length)
      return res.status(400).json({ message: 'Chưa chọn dòng nhu cầu để tạo lệnh' });

    await client.query('BEGIN');
    const items = (await client.query(`
      SELECT it.*, so.customer_id, so.due_date, so.id AS so_id
      FROM sales_order_items it JOIN sales_orders so ON so.id = it.sales_order_id
      WHERE it.id = ANY($1::uuid[]) AND it.is_planned = FALSE`, [item_ids])).rows;

    const status = machine_id ? 'Đã lên kế hoạch' : 'Chờ duyệt';
    const created = [];
    for (const it of items) {
      const gk = [it.attr_color || '', it.attr_size || ''].join('|');
      const r = await client.query(`
        INSERT INTO production_orders
          (sales_order_id, sales_order_item_id, customer_id, product_id, quantity, unit,
           attr_size, attr_thickness, attr_color, machine_id, planned_date, shift, assigned_team, group_key, due_date, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING order_code`,
        [it.so_id, it.id, it.customer_id, it.product_id, it.quantity, it.unit,
         it.attr_size, it.attr_thickness, it.attr_color, machine_id || null, planned_date || null,
         shift || null, assigned_team || null, gk, it.due_date, status]);
      created.push(r.rows[0].order_code);
      await client.query(`UPDATE sales_order_items SET is_planned = TRUE WHERE id = $1`, [it.id]);
    }
    await client.query('COMMIT');
    res.status(201).json({ created });
  } catch (err) {
    await client.query('ROLLBACK'); console.error(err);
    res.status(500).json({ message: err.detail || 'Lỗi khi sinh lệnh sản xuất từ kế hoạch' });
  } finally { client.release(); }
};

/**
 * GET /api/planning/material-requirements
 * Tính nhu cầu NVL = Σ (lệnh sản xuất × định mức BOM), trừ tồn kho ⇒ lượng cần mua.
 * Giải quyết pain point: "tính & lên kế hoạch số lượng NVL cần mua sắm".
 */
exports.materialRequirements = async (req, res) => {
  try {
    // 1) Lệnh SX cần sản xuất
    const orders = (await db.query(`
      SELECT po.id, po.order_code, po.product_id, po.quantity, p.product_name
      FROM production_orders po JOIN products p ON p.id = po.product_id
      WHERE po.is_deleted = FALSE AND po.status IN ('Chờ duyệt','Đã lên kế hoạch','Đang sản xuất')
    `)).rows;

    // 2) BOM mới nhất còn hiệu lực cho mỗi sản phẩm đầu ra
    const bomHeads = (await db.query(`
      SELECT DISTINCT ON (product_id) id, product_id, output_quantity
      FROM boms WHERE is_deleted = FALSE AND status = 'Hoạt động'
      ORDER BY product_id, created_at DESC
    `)).rows;
    const bomByProduct = new Map(bomHeads.map(b => [b.product_id, b]));

    // 3) Dòng định mức của các BOM đó
    const bomIds = bomHeads.map(b => b.id);
    let lines = [];
    if (bomIds.length) {
      lines = (await db.query(`
        SELECT l.bom_id, l.material_id, l.quantity, l.unit,
               p.product_name AS material_name, p.product_code AS material_code, p.unit AS material_unit
        FROM bom_lines l JOIN products p ON p.id = l.material_id
        WHERE l.bom_id = ANY($1::uuid[])
      `, [bomIds])).rows;
    }
    const linesByBom = new Map();
    for (const l of lines) {
      if (!linesByBom.has(l.bom_id)) linesByBom.set(l.bom_id, []);
      linesByBom.get(l.bom_id).push(l);
    }

    // 4) Tồn kho hiện có theo NVL
    const stock = (await db.query(`SELECT product_id, SUM(quantity)::numeric AS qty FROM inventory_stock GROUP BY product_id`)).rows;
    const onHand = new Map(stock.map(s => [s.product_id, Number(s.qty)]));

    // 5) Cộng dồn nhu cầu
    const req_map = new Map(); // material_id -> {..., required}
    const missingBom = [];
    for (const o of orders) {
      const bom = bomByProduct.get(o.product_id);
      if (!bom) { missingBom.push({ order_code: o.order_code, product_name: o.product_name }); continue; }
      const factor = Number(o.quantity) / (Number(bom.output_quantity) || 1);
      for (const l of (linesByBom.get(bom.id) || [])) {
        const need = Number(l.quantity) * factor;
        if (!req_map.has(l.material_id)) {
          req_map.set(l.material_id, {
            material_id: l.material_id, material_code: l.material_code, material_name: l.material_name,
            unit: l.unit || l.material_unit, required_qty: 0,
            on_hand_qty: onHand.get(l.material_id) || 0,
          });
        }
        req_map.get(l.material_id).required_qty += need;
      }
    }
    const requirements = [...req_map.values()].map(r => ({
      ...r,
      required_qty: Math.round(r.required_qty * 1000) / 1000,
      to_purchase_qty: Math.max(0, Math.round((r.required_qty - r.on_hand_qty) * 1000) / 1000),
    })).sort((a, b) => b.to_purchase_qty - a.to_purchase_qty);

    res.json({ requirements, missing_bom: missingBom, order_count: orders.length });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi tính nhu cầu NVL' }); }
};
