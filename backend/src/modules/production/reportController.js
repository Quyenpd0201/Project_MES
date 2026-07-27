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

    res.json({ kpi: kpi.rows[0] });
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
