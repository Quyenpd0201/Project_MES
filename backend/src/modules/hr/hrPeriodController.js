// [HR-G5] Chốt công tháng — 2026-10-26, CHƯA PHÁT HÀNH (file mới)
// Kỳ công cả nhà máy theo tháng (Q3). Chốt: kiểm việc chờ (chặn) + cảnh báo (cần xác nhận) → khóa ngày công cả tháng
// trong 1 transaction. Mở khóa: bắt buộc lý do, ghi lịch sử + audit, xếp hàng tính lại cả tháng (Q6).
// Quyết định Q1–Q8: docs/ai/plans/2026-10-26-hr-g5-bang-cong-chot-cong.md.
const db = require('../../core/db');
const { canManageAllUnits } = require('../../core/lib/hrScope');
const { logHr } = require('../../core/lib/hrAudit');
const { YM_RE, monthDays } = require('../../core/lib/timesheetRules');
const { vnDate } = require('./hrRecalc');

class HttpError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; } }
const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };
const str = (v) => (v == null ? '' : String(v).trim());

async function tx(res, fn) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof HttpError) { res.status(err.status).json({ message: err.message, ...err.extra }); return undefined; }
    // [Review G5] hết thời gian chờ khóa / deadlock → báo thử lại, không 500
    if (err.code === '55P03' || err.code === '40P01') { res.status(409).json({ message: 'Đang có thao tác khác trên ngày công — vui lòng thử lại sau ít phút' }); return undefined; }
    throw err;
  } finally { client.release(); }
}

function parseYm(ym) {
  if (!YM_RE.test(String(ym || ''))) fail(400, 'Tháng không hợp lệ (YYYY-MM)');
  const days = monthDays(ym);
  return { ym, from: days[0].date, to: days[days.length - 1].date };
}

/** Việc chặn chốt + cảnh báo của tháng (cả nhà máy, không lọc phạm vi — chỉ nhân sự được chốt). */
async function precheckOf(conn, { ym, from, to }) {
  const blockers = []; const warnings = [];
  if (ym >= vnDate(new Date()).slice(0, 7)) blockers.push({ key: 'not_past', label: 'Tháng chưa kết thúc — chỉ chốt được tháng đã qua', count: 1 });
  // Tuần tự (có thể chạy trên client của transaction)
  const count = async (sql) => (await conn.query(sql, [from, to])).rows[0].n;
  const checks = [
    ['punch_reviews', 'Lần chấm chờ xác nhận', `SELECT count(*)::int n FROM attendance_punches p
       WHERE p.needs_review AND p.work_date BETWEEN $1 AND $2 AND NOT EXISTS (SELECT 1 FROM punch_reviews r WHERE r.punch_id = p.id)`],
    ['corrections', 'Yêu cầu sửa công chờ duyệt', `SELECT count(*)::int n FROM attendance_corrections WHERE status = 'Chờ duyệt' AND work_date BETWEEN $1 AND $2`],
    ['leaves', 'Đơn nghỉ chờ duyệt', `SELECT count(*)::int n FROM leave_requests
       WHERE status IN ('Chờ trưởng đơn vị', 'Chờ nhân sự') AND from_date <= $2 AND to_date >= $1`],
    ['overtime', 'Tăng ca chờ duyệt', `SELECT count(*)::int n FROM attendance_days WHERE ot_status = 'pending' AND work_date BETWEEN $1 AND $2`],
    ['recalc_queue', 'Ngày công đang chờ tính lại (thử lại sau ít phút)', `SELECT count(*)::int n FROM attendance_recalc_queue WHERE work_date BETWEEN $1 AND $2`],
  ];
  for (const [key, label, sql] of checks) { const n = await count(sql); if (n) blockers.push({ key, label, count: n }); }
  const warns = [
    ['missing_punch', 'Ngày thiếu giờ vào / ra (tính 0 công)', `SELECT count(*)::int n FROM attendance_days
       WHERE status IN ('Thiếu giờ vào', 'Thiếu giờ ra', 'Chưa kết thúc', 'Chờ xác nhận') AND work_date BETWEEN $1 AND $2`],
    ['absent', 'Ngày vắng không phép', `SELECT count(*)::int n FROM attendance_days WHERE status = 'Vắng không phép' AND work_date BETWEEN $1 AND $2`],
  ];
  for (const [key, label, sql] of warns) { const n = await count(sql); if (n) warnings.push({ key, label, count: n }); }
  return { blockers, warnings };
}

const requireCloser = (req) => { if (!canManageAllUnits(req)) fail(403, 'Chỉ nhân sự (quyền xem mọi đơn vị) được chốt / mở khóa công'); };
const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (err) {
    if (err instanceof HttpError) res.status(err.status).json({ message: err.message, ...err.extra }); else throw err;
  }
};

exports.list = wrap(async (req, res) => {
  const full = canManageAllUnits(req); // [Review G5] lý do mở khóa chỉ cho nhân sự
  const year = Number(req.query.year) || Number(vnDate(new Date()).slice(0, 4));
  if (!Number.isInteger(year) || year < 1900 || year > 2999) fail(400, 'Năm không hợp lệ');
  const yms = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const { rows } = await db.query(`
    SELECT p.year_month, p.status, p.closed_at, p.close_note, p.warnings, u.full_name AS closed_by_name,
           COALESCE((SELECT json_agg(json_build_object('reason', x.reason, 'at', x.unlocked_at, 'by', uu.full_name) ORDER BY x.unlocked_at DESC)
                       FROM period_unlocks x LEFT JOIN users uu ON uu.id = x.unlocked_by WHERE x.year_month = p.year_month), '[]') AS unlocks
      FROM attendance_periods p LEFT JOIN users u ON u.id = p.closed_by
     WHERE p.year_month = ANY($1::text[])`, [yms]);
  const by = Object.fromEntries(rows.map((r) => [r.year_month, r]));
  res.json({ data: yms.map((ym) => ({ ...(by[ym] || { year_month: ym, status: 'Mở' }), unlocks: full ? by[ym]?.unlocks || [] : [] })) });
});

exports.precheck = wrap(async (req, res) => {
  requireCloser(req); // [Review G5] số liệu cả nhà máy — chỉ người được chốt
  const p = parseYm(req.params.ym);
  const { rows: [cur] } = await db.query('SELECT status FROM attendance_periods WHERE year_month = $1', [p.ym]);
  res.json({ year_month: p.ym, status: cur?.status || 'Mở', ...(await precheckOf(db, p)) });
});

exports.close = wrap(async (req, res) => {
  requireCloser(req);
  const p = parseYm(req.params.ym);
  const ack = req.body?.acknowledge_warnings === true;
  const note = str(req.body?.note).slice(0, 500) || null;
  const out = await tx(res, async (client) => {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query('INSERT INTO attendance_periods (year_month) VALUES ($1) ON CONFLICT (year_month) DO NOTHING', [p.ym]);
    // FOR UPDATE: chờ các thao tác đang giữ FOR SHARE (periodLock) commit; lệnh chốt thứ 2 chờ rồi thấy "Đã chốt"
    const { rows: [cur] } = await client.query('SELECT status FROM attendance_periods WHERE year_month = $1 FOR UPDATE', [p.ym]);
    if (cur.status === 'Đã chốt') fail(409, `Tháng ${p.ym} đã chốt`);
    const { blockers, warnings } = await precheckOf(client, p);
    if (blockers.length) fail(409, 'Còn việc chờ xử lý trong tháng — chưa chốt được', { blockers, warnings });
    if (warnings.length && !ack) fail(409, 'Có cảnh báo — xem và xác nhận trước khi chốt', { blockers, warnings });
    const { rowCount } = await client.query(
      'UPDATE attendance_days SET locked = true WHERE work_date BETWEEN $1 AND $2 AND NOT locked', [p.from, p.to]);
    // [Review G5] dòng hàng đợi chen vào sau precheck: ngày đã chốt không tính lại nữa → xóa, tránh chặn lần chốt sau
    await client.query('DELETE FROM attendance_recalc_queue WHERE work_date BETWEEN $1 AND $2', [p.from, p.to]);
    await client.query(`UPDATE attendance_periods SET status = 'Đã chốt', closed_by = $2, closed_at = now(), close_note = $3, warnings = $4
                         WHERE year_month = $1`, [p.ym, req.user.id, note, JSON.stringify(warnings)]);
    await logHr(client, req, { action: 'close_period', entity: 'attendance_period', entityId: p.ym, after: { note, warnings, days: rowCount } });
    return { year_month: p.ym, status: 'Đã chốt', locked_days: rowCount };
  });
  if (out) res.json(out);
});

exports.unlock = wrap(async (req, res) => {
  requireCloser(req);
  const p = parseYm(req.params.ym);
  const reason = str(req.body?.reason);
  if (reason.length < 5) fail(400, 'Vui lòng nhập lý do mở khóa (ít nhất 5 ký tự)');
  const out = await tx(res, async (client) => {
    const { rows: [cur] } = await client.query('SELECT status FROM attendance_periods WHERE year_month = $1 FOR UPDATE', [p.ym]);
    if (cur?.status !== 'Đã chốt') fail(409, `Tháng ${p.ym} chưa chốt`);
    await client.query('INSERT INTO period_unlocks (year_month, reason, unlocked_by) VALUES ($1, $2, $3)', [p.ym, reason.slice(0, 500), req.user.id]);
    await client.query(`UPDATE attendance_periods SET status = 'Mở' WHERE year_month = $1`, [p.ym]);
    const { rowCount } = await client.query('UPDATE attendance_days SET locked = false WHERE work_date BETWEEN $1 AND $2 AND locked', [p.from, p.to]);
    // Q6: tính lại cả tháng (lần chấm / sửa đến trong lúc khóa) — worker nền xử lý
    await client.query(`
      INSERT INTO attendance_recalc_queue (employee_id, work_date)
      SELECT employee_id, work_date FROM attendance_days WHERE work_date BETWEEN $1 AND $2
      UNION -- [Review G5] cả ngày chưa có dòng (chấm đồng bộ muộn trong lúc khóa)
      SELECT e.id, g::date FROM employees e CROSS JOIN generate_series($1::date, $2::date, interval '1 day') g
       WHERE e.is_deleted = FALSE AND e.status = 'Hoạt động'
      ON CONFLICT (employee_id, work_date) DO UPDATE SET queued_at = now()`, [p.from, p.to]);
    await logHr(client, req, { action: 'unlock_period', entity: 'attendance_period', entityId: p.ym, after: { reason, days: rowCount } });
    return { year_month: p.ym, status: 'Mở', unlocked_days: rowCount };
  });
  if (out) res.json(out);
});
