const db = require('./src/core/db');

async function test() {
  const q = `SELECT dsr.id, dsr.worker_name, dsr.record_date, dsr.note, dsr.updated_at, e.employee_code, e.name as employee_name, COALESCE(SUM(dsi.scrap_qty), 0)::numeric as total_scrap FROM daily_scrap_records dsr LEFT JOIN employees e ON dsr.employee_id = e.id LEFT JOIN daily_scrap_items dsi ON dsi.record_id = dsr.id WHERE dsr.record_date = '2026-10-02' GROUP BY dsr.id, dsr.worker_name, dsr.record_date, dsr.note, dsr.updated_at, e.employee_code, e.name ORDER BY dsr.updated_at DESC`;
  try {
    const r = await db.query(q);
    console.log('SUCCESS', r.rows);
  } catch (e) {
    console.error('ERROR', e.message);
  }
  process.exit(0);
}

test();
