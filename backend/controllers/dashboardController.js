// backend/controllers/dashboardController.js — số liệu thật cho Dashboard
const db = require('../db');

// công đoạn cuối của 1 lệnh (Cắt nếu có, ngược lại Thổi)
const FINAL = `(CASE WHEN EXISTS (SELECT 1 FROM production_tasks t2 WHERE t2.production_order_id = po.id AND t2.stage='Cắt') THEN 'Cắt' ELSE 'Thổi' END)`;

exports.summary = async (_req, res) => {
  try {
    const [kpi, machines, inProgress, dueSoon, statusBreakdown] = await Promise.all([
      // KPI tổng
      db.query(`
        SELECT
          (SELECT COUNT(*)::int FROM sales_orders WHERE is_deleted=FALSE AND status IN ('Mới','Đang sản xuất')) AS open_orders,
          (SELECT COUNT(*)::int FROM production_orders WHERE is_deleted=FALSE AND status='Đang sản xuất') AS po_active,
          (SELECT COUNT(*)::int FROM production_orders WHERE is_deleted=FALSE AND status='Hoàn thành') AS po_done,
          (SELECT COUNT(*)::int FROM sales_order_items it JOIN sales_orders so ON so.id=it.sales_order_id
             WHERE so.is_deleted=FALSE AND so.status IN ('Mới','Đang sản xuất') AND it.is_planned=FALSE) AS demand_pending
      `),
      // Trạng thái máy hôm nay
      db.query(`
        SELECT m.id, m.name, m.factory,
          (SELECT json_build_object('order_code', po.order_code, 'stage', t.stage, 'status', t.status, 'product', p.product_name)
           FROM production_tasks t
           JOIN production_orders po ON po.id = t.production_order_id
           JOIN products p ON p.id = po.product_id
           WHERE t.machine_id = m.id AND t.planned_date <= CURRENT_DATE
             AND COALESCE(t.planned_end_date, t.planned_date) >= CURRENT_DATE
             AND t.status <> 'Đã hủy'
           ORDER BY t.planned_date LIMIT 1) AS current_task
        FROM machines m WHERE m.is_deleted=FALSE ORDER BY m.factory, m.name
      `),
      // Lệnh đang sản xuất + tiến độ
      db.query(`
        SELECT po.id, po.order_code, po.quantity, po.unit, po.attr_color, po.attr_size, po.due_date,
               p.product_name, c.name AS customer_name,
               COALESCE((SELECT SUM(COALESCE(t.actual_qty, t.quantity)) FROM production_tasks t
                         WHERE t.production_order_id=po.id AND t.status='Hoàn thành' AND t.stage = ${FINAL}),0) AS produced_qty
        FROM production_orders po JOIN products p ON p.id=po.product_id
        LEFT JOIN customers c ON c.id=po.customer_id
        WHERE po.is_deleted=FALSE AND po.status='Đang sản xuất'
        ORDER BY po.due_date NULLS LAST LIMIT 8
      `),
      // Đơn hàng sắp đến hạn
      db.query(`
        SELECT so.order_code, so.due_date, so.status, c.name AS customer_name,
               (SELECT COUNT(*)::int FROM sales_order_items it WHERE it.sales_order_id=so.id) AS item_count
        FROM sales_orders so JOIN customers c ON c.id=so.customer_id
        WHERE so.is_deleted=FALSE AND so.status IN ('Mới','Đang sản xuất')
        ORDER BY so.due_date NULLS LAST LIMIT 6
      `),
      // Phân bố trạng thái lệnh SX
      db.query(`
        SELECT status, COUNT(*)::int AS n FROM production_orders WHERE is_deleted=FALSE GROUP BY status
      `),
    ]);

    res.json({
      kpi: kpi.rows[0],
      machines: machines.rows,
      in_progress: inProgress.rows,
      due_soon: dueSoon.rows,
      status_breakdown: statusBreakdown.rows,
    });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy dữ liệu dashboard' }); }
};
