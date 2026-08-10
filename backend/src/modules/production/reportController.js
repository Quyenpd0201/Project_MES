const db = require('../../core/db');

exports.kpi = async (req, res) => {
  try {
    const kpi = await db.query(`
      SELECT
        (SELECT COUNT(*)::int FROM production_orders WHERE is_deleted = FALSE) AS total_production_orders,
        (SELECT COUNT(*)::int FROM production_orders WHERE is_deleted = FALSE AND status = 'Đang sản xuất') AS active_production_orders,
        (SELECT COUNT(*)::int FROM machines WHERE is_deleted = FALSE AND status = 'Hoạt động') AS active_machines,
        (SELECT COALESCE(SUM(quantity), 0) FROM inventory_stock) AS total_inventory_items
    `);
    const trendQuery = await db.query(`
      SELECT to_char(planned_date, 'MM-DD') AS date, COALESCE(SUM(quantity), 0) AS plan_qty, COALESCE(SUM(actual_qty), 0) AS actual_qty
      FROM production_tasks WHERE planned_date >= CURRENT_DATE - INTERVAL '6 days' GROUP BY planned_date ORDER BY planned_date
    `);
    const statusQuery = await db.query(`SELECT status AS name, COUNT(*)::int AS value FROM production_orders WHERE is_deleted = FALSE GROUP BY status`);
    const productQuery = await db.query(`
      SELECT p.product_name AS name, SUM(po.quantity) AS plan_qty
      FROM production_orders po JOIN products p ON p.id = po.product_id WHERE po.is_deleted = FALSE GROUP BY p.product_name ORDER BY plan_qty DESC LIMIT 5
    `);
    const inventoryQuery = await db.query(`SELECT p.product_types->>0 AS name, SUM(s.quantity) AS value FROM inventory_stock s JOIN products p ON p.id = s.product_id GROUP BY p.product_types->>0`);
    const invAlertQuery = await db.query(`SELECT COUNT(*)::int AS count FROM inventory_stock WHERE quantity < 100`);
    const qualityQuery = await db.query(`SELECT COALESCE(SUM(actual_qty),0) AS passed, COALESCE(SUM(scrap_qty),0) AS failed FROM production_tasks WHERE actual_qty > 0 OR scrap_qty > 0`);

    res.json({
      kpi: kpi.rows[0],
      charts: {
        trend: trendQuery.rows,
        status: statusQuery.rows,
        products: productQuery.rows,
        inventory: inventoryQuery.rows,
        inventoryAlert: invAlertQuery.rows[0].count,
        quality: qualityQuery.rows[0]
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu KPI' });
  }
};

exports.detailed = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    
    let dateFilter = '';
    const params = [];
    if (fromDate && toDate) {
      dateFilter = 'AND po.created_at >= $1 AND po.created_at <= $2';
      params.push(fromDate, toDate);
    }
    
    const detailed = await db.query(`
      SELECT po.id, po.order_code, po.quantity, po.unit, po.status, po.planned_date, po.due_date,
             p.product_name, c.name AS customer_name
      FROM production_orders po
      JOIN products p ON p.id = po.product_id
      LEFT JOIN customers c ON c.id = po.customer_id
      WHERE po.is_deleted = FALSE ${dateFilter}
      ORDER BY po.created_at DESC
      LIMIT 100
    `, params);

    res.json({ data: detailed.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu chi tiết' });
  }
};

exports.machines = async (req, res) => {
  try {
    // Thống kê trạng thái máy
    const statusQuery = await db.query(`
      SELECT status, COUNT(*)::int AS count
      FROM machines
      WHERE is_deleted = FALSE
      GROUP BY status
    `);

    // Dữ liệu máy để dự đoán và hiển thị tuổi thọ
    const machinesQuery = await db.query(`
      SELECT id, machine_code, name, factory, status, 
             capacity_per_hour, expected_lifespan_hours, installation_date,
             (SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(t.actual_end_time, now()) - t.actual_start_time))/3600), 0)
              FROM production_tasks t 
              WHERE t.machine_id = machines.id AND t.actual_start_time IS NOT NULL) AS current_run_hours
      FROM machines
      WHERE is_deleted = FALSE
    `);
    
    // Dự đoán sản lượng trong 7 ngày tới dựa trên capacity
    const predictionQuery = await db.query(`
       WITH next_7_days AS (
         SELECT generate_series(CURRENT_DATE, CURRENT_DATE + interval '6 days', interval '1 day')::date AS date
       )
       SELECT d.date, COALESCE(SUM(m.capacity_per_hour * 8), 0) AS predicted_output
       FROM next_7_days d
       CROSS JOIN machines m
       WHERE m.is_deleted = FALSE AND m.status = 'Hoạt động'
       GROUP BY d.date
       ORDER BY d.date
    `);

    res.json({
      status_distribution: statusQuery.rows,
      machine_stats: machinesQuery.rows,
      prediction: predictionQuery.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu máy móc' });
  }
};
