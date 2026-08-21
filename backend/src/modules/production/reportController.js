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
    const invAlertQuery = await db.query(`
      WITH stock_per_wh AS (
        SELECT s.product_id, l.warehouse_id, SUM(s.quantity) AS qty
        FROM inventory_stock s
        JOIN locations l ON l.id = s.location_id
        GROUP BY s.product_id, l.warehouse_id
      ),
      product_limits AS (
        SELECT id AS product_id,
               (jsonb_array_elements(warehouse_limits)->>'warehouse_id')::uuid AS warehouse_id,
               (jsonb_array_elements(warehouse_limits)->>'min_quantity')::numeric AS min_quantity
        FROM products
        WHERE warehouse_limits IS NOT NULL AND jsonb_array_length(warehouse_limits) > 0
      )
      SELECT COUNT(DISTINCT pl.product_id)::int AS count
      FROM product_limits pl
      LEFT JOIN stock_per_wh spw ON pl.product_id = spw.product_id AND pl.warehouse_id = spw.warehouse_id
      WHERE COALESCE(spw.qty, 0) < pl.min_quantity
    `);
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
    const { fromDate, toDate, orderCode, productId, status } = req.query;

    // Build filter conditions
    const params = [];
    const conditions = ['po.is_deleted = FALSE'];

    if (fromDate && toDate) {
      params.push(fromDate, toDate);
      conditions.push(`po.created_at::date >= $${params.length - 1} AND po.created_at::date <= $${params.length}`);
    }
    if (orderCode) {
      params.push(`%${orderCode}%`);
      conditions.push(`po.order_code ILIKE $${params.length}`);
    }
    if (productId) {
      params.push(productId);
      conditions.push(`po.product_id = $${params.length}`);
    }
    if (status && status !== 'Tất cả') {
      params.push(status);
      conditions.push(`po.status = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    // Summary stats
    const summaryQuery = await db.query(`
      SELECT
        COUNT(*)::int AS total_orders,
        COALESCE(SUM(po.quantity), 0) AS total_plan_qty,
        COALESCE(SUM(COALESCE(pt.done_qty, 0)), 0) AS total_done_qty,
        COUNT(*) FILTER (WHERE po.status = 'Đang sản xuất')::int AS in_production,
        COUNT(*) FILTER (WHERE po.due_date < CURRENT_DATE AND po.status NOT IN ('Hoàn thành', 'Đã hủy'))::int AS overdue
      FROM production_orders po
      LEFT JOIN (
        SELECT production_order_id, SUM(actual_qty) AS done_qty
        FROM production_tasks GROUP BY production_order_id
      ) pt ON pt.production_order_id = po.id
      WHERE ${whereClause}
    `, params);

    // Chart 1: Quantity by status (bar chart)
    const byStatusQuery = await db.query(`
      SELECT po.status, COALESCE(SUM(po.quantity), 0) AS plan_qty,
             COALESCE(SUM(COALESCE(pt.done_qty, 0)), 0) AS done_qty,
             COUNT(*)::int AS cnt
      FROM production_orders po
      LEFT JOIN (
        SELECT production_order_id, SUM(actual_qty) AS done_qty
        FROM production_tasks GROUP BY production_order_id
      ) pt ON pt.production_order_id = po.id
      WHERE ${whereClause}
      GROUP BY po.status
    `, params);

    // Chart 2: Plan vs Done over time (line chart, group by planned_date)
    const trendQuery = await db.query(`
      SELECT to_char(po.planned_date, 'DD/MM') AS date,
             COALESCE(SUM(po.quantity), 0) AS plan_qty,
             COALESCE(SUM(COALESCE(pt.done_qty, 0)), 0) AS done_qty
      FROM production_orders po
      LEFT JOIN (
        SELECT production_order_id, SUM(actual_qty) AS done_qty
        FROM production_tasks GROUP BY production_order_id
      ) pt ON pt.production_order_id = po.id
      WHERE ${whereClause}
      GROUP BY po.planned_date
      ORDER BY po.planned_date
    `, params);

    // Chart 3: Status distribution (donut)
    const statusDistQuery = await db.query(`
      SELECT po.status AS name, COUNT(*)::int AS value
      FROM production_orders po
      WHERE ${whereClause}
      GROUP BY po.status
    `, params);

    // Main list
    const detailedQuery = await db.query(`
      SELECT po.id, po.order_code, po.quantity, po.unit, po.status,
             po.planned_date, po.due_date, po.note,
             p.product_name, c.name AS customer_name,
             COALESCE(pt.done_qty, 0) AS actual_qty
      FROM production_orders po
      JOIN products p ON p.id = po.product_id
      LEFT JOIN customers c ON c.id = po.customer_id
      LEFT JOIN (
        SELECT production_order_id, SUM(actual_qty) AS done_qty
        FROM production_tasks GROUP BY production_order_id
      ) pt ON pt.production_order_id = po.id
      WHERE ${whereClause}
      ORDER BY po.created_at DESC
      LIMIT 200
    `, params);

    // Products list for filter dropdown
    const productsQuery = await db.query(`
      SELECT id, product_name FROM products
      WHERE is_deleted = FALSE
      ORDER BY product_name
    `);

    // Order codes list for filter dropdown
    const orderCodesQuery = await db.query(`
      SELECT order_code, product_id, status FROM production_orders
      WHERE is_deleted = FALSE
      ORDER BY order_code DESC
    `);

    res.json({
      summary: summaryQuery.rows[0],
      charts: {
        byStatus: byStatusQuery.rows,
        trend: trendQuery.rows,
        statusDist: statusDistQuery.rows
      },
      data: detailedQuery.rows,
      products: productsQuery.rows,
      orderCodes: orderCodesQuery.rows
    });
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

    // Dữ liệu máy — chỉ dùng các cột thực sự tồn tại trong schema
    const machinesQuery = await db.query(`
      SELECT m.id, m.machine_code, m.name, m.factory, m.machine_type, m.status,
             COALESCE(m.capacity_per_hour, 0) AS capacity_per_hour,
             COUNT(t.id) FILTER (WHERE t.status = 'Hoàn thành')::int AS tasks_done,
             COUNT(t.id)::int AS tasks_total,
             COALESCE(SUM(t.actual_qty) FILTER (WHERE t.status = 'Hoàn thành'), 0) AS total_actual_qty
      FROM machines m
      LEFT JOIN production_tasks t ON t.machine_id = m.id
      WHERE m.is_deleted = FALSE
      GROUP BY m.id, m.machine_code, m.name, m.factory, m.machine_type, m.status, m.capacity_per_hour
      ORDER BY m.machine_code
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

// GET /reports/employees — tổng hợp hiệu suất từng nhân viên
exports.employees = async (req, res) => {
  try {
    const { fromDate, toDate, stage, shift, team, orderCode } = req.query;
    const params = []; let i = 1;
    
    // 1. Điều kiện cho tasks
    const taskWhere = [];
    if (fromDate)  { taskWhere.push(`COALESCE(t.planned_date, po.planned_date, po.created_at::date) >= $${i++}`); params.push(fromDate); }
    if (toDate)    { taskWhere.push(`COALESCE(t.planned_date, po.planned_date, po.created_at::date) <= $${i++}`); params.push(toDate); }
    if (stage)     { taskWhere.push(`t.stage = $${i++}`); params.push(stage); }
    if (shift)     { taskWhere.push(`t.shift = $${i++}`); params.push(shift); }
    if (orderCode) { taskWhere.push(`po.order_code ILIKE $${i++}`); params.push(`%${orderCode}%`); }
    
    // Nếu user bị gán cố định với 1 worker, chỉ được xem báo cáo của worker đó
    if (req.user && req.user.linked_worker) {
      taskWhere.push(`COALESCE(t.assigned_worker, po.assigned_worker) = $${i++}`);
      params.push(req.user.linked_worker);
    }
    
    const taskWhereClause = taskWhere.length ? `AND ${taskWhere.join(' AND ')}` : '';

    // 2. Điều kiện cho nhân viên
    const empWhere = [`e.is_deleted = FALSE`];
    if (team) {
      empWhere.push(`e.factory = $${i++}`);
      params.push(team);
    }

    const { rows } = await db.query(`
      WITH filtered_tasks AS (
        SELECT t.*,
               COALESCE(t.assigned_worker, po.assigned_worker) AS final_worker,
               po.order_code
        FROM production_tasks t
        JOIN production_orders po ON po.id = t.production_order_id AND po.is_deleted = FALSE
        WHERE COALESCE(t.assigned_worker, po.assigned_worker) IS NOT NULL
          AND COALESCE(t.assigned_worker, po.assigned_worker) != ''
          ${taskWhereClause}
      )
      SELECT
        e.name                                                                        AS worker,
        e.factory                                                                     AS team,
        COUNT(t.id)::int                                                              AS tasks_count,
        COUNT(DISTINCT t.production_order_id)::int                                    AS orders_count,
        COALESCE(SUM(t.quantity), 0)::numeric                                         AS planned_qty,
        COALESCE(SUM(CASE WHEN t.status = 'Hoàn thành'
          THEN COALESCE(t.actual_qty, t.quantity) ELSE 0 END), 0)::numeric            AS actual_qty,
        COALESCE(SUM(t.scrap_qty), 0)::numeric                                        AS scrap_qty,
        COUNT(DISTINCT t.planned_date)::int                                           AS work_days,
        COUNT(DISTINCT CONCAT(t.planned_date::text,'||',COALESCE(t.shift,''))) * 8   AS work_hours,
        COUNT(t.id) FILTER (WHERE t.status = 'Hoàn thành')::int                       AS done_count,
        COUNT(t.id) FILTER (WHERE t.status IN ('Đang sản xuất','Chờ'))::int           AS active_count,
        COUNT(t.id) FILTER (WHERE t.status = 'Dừng sản xuất')::int                   AS paused_count,
        STRING_AGG(DISTINCT t.stage, ', ' ORDER BY t.stage)                           AS stages,
        STRING_AGG(DISTINCT t.shift, ', ')
          FILTER (WHERE t.shift IS NOT NULL AND t.shift != '')                        AS shifts
      FROM employees e
      LEFT JOIN filtered_tasks t ON t.final_worker = e.name
      WHERE ${empWhere.join(' AND ')}
      GROUP BY e.id, e.name, e.factory
      ORDER BY actual_qty DESC, planned_qty DESC, e.name
    `, params);
    res.json({ data: rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy báo cáo nhân viên' }); }
};

// GET /reports/employees/:worker/tasks — chi tiết lệnh + phân tích theo ngày & công đoạn
exports.employeeTasks = async (req, res) => {
  try {
    const worker = req.params.worker;
    
    // Nếu user bị gán cố định với 1 worker, và yêu cầu truy cập chi tiết worker khác thì chặn
    if (req.user && req.user.linked_worker && req.user.linked_worker !== worker) {
      return res.status(403).json({ message: 'Bạn không có quyền xem báo cáo của nhân viên khác' });
    }
    
    const { fromDate, toDate, stage, shift, team } = req.query;
    const params = [worker]; let i = 2;
    // Match task-level OR order-level assigned_worker
    const where = [`COALESCE(t.assigned_worker, po.assigned_worker) = $1`, `po.is_deleted = FALSE`];
    if (fromDate) { where.push(`COALESCE(t.planned_date, po.planned_date, po.created_at::date) >= $${i++}`); params.push(fromDate); }
    if (toDate)   { where.push(`COALESCE(t.planned_date, po.planned_date, po.created_at::date) <= $${i++}`); params.push(toDate); }
    if (stage)    { where.push(`t.stage = $${i++}`); params.push(stage); }
    if (shift)    { where.push(`t.shift = $${i++}`); params.push(shift); }
    if (team)     { where.push(`COALESCE(t.assigned_team, po.assigned_team) = $${i++}`); params.push(team); }
    const ws = where.join(' AND ');


    const [tasksQ, dailyQ, stagesQ] = await Promise.all([
      db.query(`
        SELECT t.id, t.task_code, t.stage, t.quantity, t.actual_qty, t.scrap_qty,
               t.status, t.planned_date, t.shift, t.assigned_team,
               po.id AS order_id, po.order_code, po.unit,
               so.order_code AS sales_order_code,
               p.product_name, p.product_code, c.name AS customer_name
        FROM production_tasks t
        JOIN production_orders po ON po.id = t.production_order_id AND po.is_deleted = FALSE
        JOIN products p ON p.id = po.product_id
        LEFT JOIN sales_orders so ON so.id = po.sales_order_id
        LEFT JOIN customers c ON c.id = po.customer_id
        WHERE ${ws}
        ORDER BY t.planned_date DESC NULLS LAST, po.order_code
      `, params),
      db.query(`
        SELECT t.planned_date,
               to_char(t.planned_date, 'DD/MM') AS date_label,
               COALESCE(SUM(CASE WHEN t.status='Hoàn thành'
                 THEN COALESCE(t.actual_qty,t.quantity) ELSE 0 END),0)::numeric AS actual_qty,
               COALESCE(SUM(t.quantity),0)::numeric AS planned_qty
        FROM production_tasks t
        JOIN production_orders po ON po.id = t.production_order_id AND po.is_deleted = FALSE
        WHERE ${ws} AND t.planned_date IS NOT NULL
        GROUP BY t.planned_date
        ORDER BY t.planned_date
      `, params),
      db.query(`
        SELECT t.stage,
               COALESCE(SUM(CASE WHEN t.status='Hoàn thành'
                 THEN COALESCE(t.actual_qty,t.quantity) ELSE 0 END),0)::numeric AS actual_qty,
               COALESCE(SUM(t.quantity),0)::numeric AS planned_qty,
               COUNT(*)::int AS tasks_count
        FROM production_tasks t
        JOIN production_orders po ON po.id = t.production_order_id AND po.is_deleted = FALSE
        WHERE ${ws}
        GROUP BY t.stage
        ORDER BY actual_qty DESC
      `, params),
    ]);
    res.json({ tasks: tasksQ.rows, daily: dailyQ.rows, stages: stagesQ.rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy chi tiết nhân viên' }); }
};

