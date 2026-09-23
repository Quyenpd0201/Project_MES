const db = require('../../core/db');

// GET /api/scrap/workers — lấy toàn bộ nhân viên đang hoạt động
exports.getWorkers = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT DISTINCT name
      FROM employees
      WHERE is_deleted = FALSE
      ORDER BY name
    `);
    res.json(rows.map(r => r.name));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách công nhân' });
  }
};

// GET /api/scrap/daily-wos?worker_name=...&date=...
// Trả về lệnh SX hoàn thành trong vòng 3 ngày trước ngày ghi nhận.
// Lý do: công nhân có thể cân và ghi phế vào ngày hôm sau (hoặc 2 ngày sau)
// khi đã tập hợp đủ phế từ nhiều ca → không bị mất WO khi lệch ngày.
exports.getDailyWos = async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const worker_name = req.query.worker_name;
    if (!worker_name) return res.status(400).json({ message: 'Thiếu worker_name' });

    // Lấy các lệnh SX hoàn thành trong [date-2, date] (cửa sổ 3 ngày)
    // để tránh lệch ngày giữa ngày hoàn thành task và ngày cân/ghi phế
    const { rows } = await db.query(`
      SELECT 
        po.id as order_id,
        po.order_code,
        po.product_id,
        p.product_name,
        p.product_code,
        p.unit,
        SUM(pt.actual_qty) as total_qty,
        MAX(pt.updated_at) as last_completed_at,
        MAX(pt.updated_at)::date as completed_date
      FROM production_tasks pt
      JOIN production_orders po ON pt.production_order_id = po.id
      JOIN products p ON po.product_id = p.id
      WHERE pt.assigned_worker = $1
        AND pt.status = 'Hoàn thành'
        AND pt.updated_at::date BETWEEN ($2::date - interval '2 days')::date AND $2::date
      GROUP BY po.id, po.order_code, po.product_id, p.product_name, p.product_code, p.unit
      ORDER BY last_completed_at DESC
    `, [worker_name, date]);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách Lệnh SX' });
  }
};

// GET /api/scrap/records?worker_name=...&date=...
exports.getRecords = async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const worker_name = req.query.worker_name;
    if (!worker_name) return res.status(400).json({ message: 'Thiếu worker_name' });

    const { rows } = await db.query(`
      SELECT * FROM daily_scrap_records 
      WHERE worker_name = $1 AND record_date = $2
    `, [worker_name, date]);

    if (!rows.length) return res.json(null);
    const record = rows[0];

    const items = await db.query(`
      SELECT i.*, p.product_name, p.product_code, p.unit
      FROM daily_scrap_items i
      JOIN products p ON i.product_id = p.id
      WHERE i.record_id = $1
    `, [record.id]);
    
    record.items = items.rows;
    res.json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu phế phẩm' });
  }
};

// POST /api/scrap/records
exports.saveRecords = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { worker_name, record_date, note, items } = req.body;
    if (!worker_name || !record_date || !items || !items.length) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
    }

    await client.query('BEGIN');

    // 1. Get Kho Phế Phẩm and its default location
    const wRes = await client.query(`SELECT id FROM warehouses WHERE warehouse_type = 'Phế liệu' LIMIT 1`);
    if (!wRes.rows.length) throw new Error("Chưa có Kho Phế Phẩm trong hệ thống");
    const scrapWarehouseId = wRes.rows[0].id;
    const lRes = await client.query(`SELECT id FROM locations WHERE warehouse_id = $1 LIMIT 1`, [scrapWarehouseId]);
    const scrapLocationId = lRes.rows.length ? lRes.rows[0].id : null;

    // 2. Upsert record
    const rRes = await client.query(`
      INSERT INTO daily_scrap_records (worker_name, record_date, note, updated_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (worker_name, record_date) 
      DO UPDATE SET note = EXCLUDED.note, updated_at = now()
      RETURNING id
    `, [worker_name, record_date, note || null]);
    const recordId = rRes.rows[0].id;

    // 3. Process items
    for (const it of items) {
      // Find difference if updating
      const oldItem = await client.query(`SELECT scrap_qty FROM daily_scrap_items WHERE record_id = $1 AND product_id = $2`, [recordId, it.product_id]);
      const oldQty = oldItem.rows.length ? Number(oldItem.rows[0].scrap_qty) : 0;
      const newQty = Number(it.scrap_qty) || 0;
      const diff = newQty - oldQty;

      // Upsert item
      await client.query(`
        INSERT INTO daily_scrap_items (record_id, product_id, finished_qty, scrap_qty)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (record_id, product_id)
        DO UPDATE SET finished_qty = EXCLUDED.finished_qty, scrap_qty = EXCLUDED.scrap_qty
      `, [recordId, it.product_id, it.finished_qty || 0, newQty]);

      // If there is a difference in scrap qty, adjust inventory
      if (diff !== 0 && scrapLocationId) {
        // Find product unit
        const pRes = await client.query(`SELECT unit FROM products WHERE id = $1`, [it.product_id]);
        const unit = pRes.rows[0]?.unit || 'Kg';
        
        await client.query(`
          INSERT INTO inventory_stock (product_id, location_id, quantity, unit, lot_code, spec_key, specs, attr_size, attr_thickness, attr_color)
          VALUES ($1, $2, $3, $4, '', '||||', '{}'::jsonb, '', '', '')
          ON CONFLICT (product_id, location_id, spec_key, lot_code)
          DO UPDATE SET quantity = GREATEST(0, inventory_stock.quantity + EXCLUDED.quantity), updated_at = now()
        `, [it.product_id, scrapLocationId, diff, unit]);

        await client.query(`
          INSERT INTO inventory_transactions (product_id, location_id, trx_type, quantity, ref_code, note, specs, spec_key, lot_code, attr_size, attr_thickness, attr_color)
          VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb, '||||', '', '', '', '')
        `, [it.product_id, scrapLocationId, diff > 0 ? 'Nhập' : 'Xuất', Math.abs(diff), 'Ghi phế ' + record_date, 'Ghi nhận phế từ CN: ' + worker_name]);
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Đã lưu ghi nhận phế phẩm', recordId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: err.message || 'Lỗi khi lưu dữ liệu phế phẩm' });
  } finally {
    client.release();
  }
};

// GET /api/scrap/statistics?worker_name=...&end_date=...
exports.getStats = async (req, res) => {
  try {
    const end_date = req.query.end_date || new Date().toISOString().slice(0, 10);
    const worker_name = req.query.worker_name;
    if (!worker_name) return res.status(400).json({ message: 'Thiếu worker_name' });

    const statsQuery = await db.query(`
      WITH date_series AS (
        SELECT generate_series($1::date - interval '6 days', $1::date, '1 day')::date AS d
      ),
      wo_stats AS (
        SELECT updated_at::date as d, COUNT(DISTINCT production_order_id) as total_wos, SUM(actual_qty) as total_finished
        FROM production_tasks 
        WHERE status = 'Hoàn thành' 
          AND assigned_worker = $2
          AND updated_at::date >= $1::date - interval '6 days'
        GROUP BY updated_at::date
      ),
      scrap_stats AS (
        SELECT dsr.record_date as d, SUM(dsi.scrap_qty) as total_scrap
        FROM daily_scrap_records dsr
        JOIN daily_scrap_items dsi ON dsi.record_id = dsr.id
        WHERE dsr.worker_name = $2
          AND dsr.record_date >= $1::date - interval '6 days'
        GROUP BY dsr.record_date
      )
      SELECT ds.d as date, 
             COALESCE(ws.total_wos, 0) as total_wos,
             COALESCE(ws.total_finished, 0) as total_finished,
             COALESCE(ss.total_scrap, 0) as total_scrap
      FROM date_series ds
      LEFT JOIN wo_stats ws ON ws.d = ds.d
      LEFT JOIN scrap_stats ss ON ss.d = ds.d
      ORDER BY ds.d ASC
    `, [end_date, worker_name]);

    // Tổng hợp toàn bộ cửa sổ 7 ngày tách biệt để KPI summary luôn đúng
    // dù task hoàn thành và ngày cân phế lệch 1-2 ngày
    const totalsQuery = await db.query(`
      SELECT
        COALESCE(SUM(pt.actual_qty), 0)::numeric AS total_finished,
        COALESCE((
          SELECT SUM(dsi.scrap_qty)
          FROM daily_scrap_records dsr
          JOIN daily_scrap_items dsi ON dsi.record_id = dsr.id
          WHERE dsr.worker_name = $2
            AND dsr.record_date BETWEEN $1::date - interval '6 days' AND $1::date
        ), 0)::numeric AS total_scrap
      FROM production_tasks pt
      WHERE pt.assigned_worker = $2
        AND pt.status = 'Hoàn thành'
        AND pt.updated_at::date BETWEEN $1::date - interval '6 days' AND $1::date
    `, [end_date, worker_name]);

    res.json({ rows: statsQuery.rows, totals: totalsQuery.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi lấy thống kê' });
  }
};


// GET /api/scrap/daily-details?worker_name=...&date=...
exports.getDailyDetails = async (req, res) => {
  try {
    const date = req.query.date;
    const worker_name = req.query.worker_name;
    if (!worker_name || !date) return res.status(400).json({ message: 'Thiếu thông tin' });

    // Fetch tasks completed by worker on this date
    const tasksQuery = await db.query(`
      SELECT 
        pt.id as task_id,
        pt.stage as step_name,
        pt.actual_qty,
        po.id as order_id,
        po.order_code,
        p.product_code,
        p.product_name,
        p.unit,
        p.id as product_id
      FROM production_tasks pt
      JOIN production_orders po ON pt.production_order_id = po.id
      JOIN products p ON po.product_id = p.id
      WHERE pt.assigned_worker = $1
        AND pt.status = 'Hoàn thành'
        AND pt.updated_at::date = $2
      ORDER BY po.order_code ASC, pt.stage ASC
    `, [worker_name, date]);

    // Fetch scrap recorded for this worker on this date
    const scrapQuery = await db.query(`
      SELECT dsi.product_id, dsi.scrap_qty
      FROM daily_scrap_records dsr
      JOIN daily_scrap_items dsi ON dsi.record_id = dsr.id
      WHERE dsr.worker_name = $1 AND dsr.record_date = $2
    `, [worker_name, date]);

    // Map scrap to products
    const scrapMap = {};
    scrapQuery.rows.forEach(r => {
      scrapMap[r.product_id] = Number(r.scrap_qty);
    });

    const tasks = tasksQuery.rows.map(t => ({
      ...t,
      // We pass the total scrap for this product on this day.
      // (Since scrap is recorded per product, not per task)
      product_scrap_qty: scrapMap[t.product_id] || 0
    }));

    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết ngày' });
  }
};
