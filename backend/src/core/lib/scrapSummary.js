// Tổng hợp phế theo ngày — MỘT định nghĩa cho Báo cáo sản lượng (/scrap/summary) và Báo cáo giám đốc.
// Phế: module Quản lý phế, theo ngày cân. Thành phẩm: Σ công đoạn CUỐI đã hoàn thành trong ngày
// (phiếu phế không nhập TP — finished_qty luôn 0 → trước đây tỷ lệ phế 100% / "—").
// Ngày của task theo updated_at (người dùng chấp nhận, 2026-11-10).
const { FINAL_STAGE_OF_TASK } = require('./finalStage');

async function scrapByDay(db, from, to) {
  const { rows } = await db.query(`
    WITH s AS (
      SELECT dsr.record_date AS d, SUM(dsi.scrap_qty) AS scrap_qty
      FROM daily_scrap_records dsr
      JOIN daily_scrap_items dsi ON dsi.record_id = dsr.id
      WHERE dsr.record_date BETWEEN $1::date AND $2::date
      GROUP BY dsr.record_date
    ), f AS (
      SELECT t.updated_at::date AS d, SUM(COALESCE(t.actual_qty, t.quantity)) AS finished_qty
      FROM production_tasks t
      JOIN production_orders po ON po.id = t.production_order_id AND po.is_deleted = FALSE
      WHERE t.status = 'Hoàn thành'
        AND t.updated_at::date BETWEEN $1::date AND $2::date
        AND t.stage = ${FINAL_STAGE_OF_TASK}
      GROUP BY t.updated_at::date
    )
    SELECT COALESCE(s.d, f.d)::text AS date,
           COALESCE(s.scrap_qty, 0)::numeric    AS scrap_qty,
           COALESCE(f.finished_qty, 0)::numeric AS finished_qty
    FROM s FULL JOIN f ON f.d = s.d
    ORDER BY 1`, [from, to]);
  const by_day = rows.map((r) => ({
    date: r.date, scrap_qty: Number(r.scrap_qty) || 0, finished_qty: Number(r.finished_qty) || 0,
  }));
  return {
    by_day,
    total_scrap: by_day.reduce((a, r) => a + r.scrap_qty, 0),
    total_finished: by_day.reduce((a, r) => a + r.finished_qty, 0),
  };
}

module.exports = { scrapByDay };
