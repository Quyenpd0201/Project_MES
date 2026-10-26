// [HR-G3] Tính lại ngày công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// Đọc dữ liệu gốc (lần chấm, duyệt, sửa công, gán ca, ngày lễ, tăng ca được duyệt) → attendanceEngine.computeDay
// → ghi attendance_days. Ngày đã chốt (locked) và ngày trong tương lai không ghi.
//
// HÀNG ĐỢI (review G3): mọi thao tác làm thay đổi ngày công ghi (nhân viên, ngày) vào attendance_recalc_queue
// TRONG transaction của chính nó (enqueue). Sau COMMIT (đã trả kết nối) gọi drainEmployees để tính ngay cho
// người dùng thấy; lỗi thì dòng vẫn còn trong hàng đợi → worker nền (mỗi phút) tính lại. Không bao giờ mất.
//
// Gán lần chấm vào ngày công: duyệt từng ngày theo thứ tự thời gian (có 2 ngày đệm phía trước). Ca của ngày:
// gán trước → tự nhận theo lần chấm VÀO đầu tiên của ngày (direction do kiosk quyết, chỉ dùng làm gợi ý nhận ca;
// ghép cặp VÀO/RA vẫn do engine xếp theo thời gian) → ca mặc định. Mỗi ngày lấy các lần chấm CHƯA được ngày trước
// dùng trong cửa sổ [đầu ngày (ca ngày) | giờ vào ca − 4h (ca đêm), giờ ra ca + 7h (ca ngày) | + 4h (ca đêm)].
const db = require('../../core/db');
const { getAppSettings } = require('../../core/lib/settings');
const { computeDay, shiftWindow } = require('../../core/lib/attendanceEngine');
const { partOnDate } = require('../../core/lib/leaveRules'); // [HR-G4]
const { LATE_PUNCH_FLAG } = require('../../core/lib/timesheetRules'); // [HR-G5]
const { lockPeriods, monthsBetween } = require('../../core/lib/periodLock'); // [HR-G5]

const DAY_MS = 86400000;
const H = 3600000;
const CALC_VERSION = 2;
const BUFFER_DAYS = 2;
const QUEUE_BATCH = 300;

const vnDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
const vnMinutes = (d) => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(d).split(':').map(Number);
  return h * 60 + m;
};
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const isoWeekday = (ymd) => ((new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = thứ 2 … 7 = CN
const hhmm = (t) => (t ? String(t).slice(0, 5) : null);
const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const inDetect = ([a, b], m) => (a <= b ? m >= a && m <= b : m >= a || m <= b);

function datesBetween(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Cài đặt + danh sách ca: nạp 1 lần, dùng cho nhiều nhân viên */
async function loadContext(conn) {
  const s = await getAppSettings(conn);
  const { rows } = await conn.query(`
    SELECT s.id, s.shift_code, s.start_time, s.end_time, s.overnight, s.required_minutes, s.late_grace_min, s.early_grace_min,
           s.ot_enabled, s.ot_requires_approval, s.auto_detect_from, s.auto_detect_to,
           COALESCE((SELECT json_agg(json_build_object('start', b.start_time, 'end', b.end_time)) FROM shift_breaks b WHERE b.shift_id = s.id), '[]') AS breaks
      FROM shifts s WHERE s.is_deleted = FALSE AND s.start_time IS NOT NULL AND s.end_time IS NOT NULL`);
  const shifts = rows.map((x) => ({
    id: x.id, code: x.shift_code, start: hhmm(x.start_time), end: hhmm(x.end_time), overnight: x.overnight,
    required_minutes: x.required_minutes, late_grace_min: x.late_grace_min, early_grace_min: x.early_grace_min,
    ot_enabled: x.ot_enabled, ot_requires_approval: x.ot_requires_approval,
    detect: x.auto_detect_from && x.auto_detect_to ? [toMin(hhmm(x.auto_detect_from)), toMin(hhmm(x.auto_detect_to))] : null,
    breaks: x.breaks.map((b) => ({ start: hhmm(b.start), end: hhmm(b.end) })),
  }));
  const defShift = shifts.find((x) => x.code === s.hr_default_shift_code) || shifts[0];
  if (!defShift) throw new Error('Chưa cấu hình ca làm');
  return {
    shifts, byId: Object.fromEntries(shifts.map((x) => [x.id, x])), defShift,
    workdays: new Set(String(s.hr_workdays).split(',').map((x) => Number(x.trim())).filter(Boolean)),
    cfg: { otNightFrom: s.hr_ot_night_from, otMinMinutes: s.hr_ot_min_minutes, otBlock: s.hr_ot_block_minutes },
  };
}

/**
 * Tính lại ngày công của 1 nhân viên trong [from, to] (YYYY-MM-DD). Một transaction, khóa advisory theo nhân viên.
 * Xóa các dòng hàng đợi đã được tính (queued_at ≤ lúc bắt đầu) trong cùng transaction.
 */
async function recalcRange(conn, employeeId, from, to, { now = new Date(), ctx = null } = {}) {
  const pool = conn.pool || conn;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('hr-recalc:' || $1))`, [employeeId]);
    if (process.env.HR_RECALC_FAIL_FOR_TEST && process.env.HR_RECALC_FAIL_FOR_TEST === employeeId) throw new Error('lỗi giả lập (test)');
    // [HR-G5 review R1] khóa kỳ công (FOR SHARE): lệnh chốt chờ lần tính này xong; tháng đã chốt thì không ghi ngày nào
    const closedYm = await lockPeriods(client, monthsBetween(from, to));
    const { shifts, byId, defShift, workdays, cfg } = ctx || await loadContext(client);

    const start = addDays(from, -BUFFER_DAYS);
    const qFrom = new Date(Date.parse(`${start}T00:00:00+07:00`));
    const qTo = new Date(Date.parse(`${to}T00:00:00+07:00`) + 2 * DAY_MS);
    // Tuần tự: 1 client trong transaction không chạy nhiều truy vấn cùng lúc
    const punches = (await client.query(`
      SELECT p.id, p.punched_at AS at, p.direction, p.needs_review, r.decision AS review, p.created_at
        FROM attendance_punches p LEFT JOIN punch_reviews r ON r.punch_id = p.id
       WHERE p.employee_id = $1 AND p.punched_at >= $2 AND p.punched_at < $3 ORDER BY p.punched_at`, [employeeId, qFrom, qTo])).rows;
    const assignOf = Object.fromEntries((await client.query(
      `SELECT to_char(work_date, 'YYYY-MM-DD') d, shift_id FROM shift_assignments WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3`,
      [employeeId, start, to])).rows.map((r) => [r.d, r.shift_id]));
    const holidaySet = new Set((await client.query(
      `SELECT to_char(date, 'YYYY-MM-DD') d FROM holidays WHERE date BETWEEN $1 AND $2`, [start, to])).rows.map((r) => r.d));
    const corrections = (await client.query(`
      SELECT to_char(work_date, 'YYYY-MM-DD') d, kind, new_time, punch_id, decided_at FROM attendance_corrections
       WHERE employee_id = $1 AND status = 'Đã duyệt' AND work_date BETWEEN $2 AND $3`, [employeeId, start, to])).rows;
    const approvalOf = Object.fromEntries((await client.query(`
      SELECT to_char(work_date, 'YYYY-MM-DD') d, approved_ot_min, approved_ot_night_min, approved_ot_holiday_min
        FROM overtime_approvals WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3`, [employeeId, start, to])).rows
      .map((r) => [r.d, { ot_min: r.approved_ot_min, ot_night_min: r.approved_ot_night_min, ot_holiday_min: r.approved_ot_holiday_min }]));
    // [HR-G4] Đơn nghỉ ĐÃ DUYỆT giao với khoảng tính
    const leaves = (await client.query(`
      SELECT r.id, to_char(r.from_date, 'YYYY-MM-DD') AS from_date, to_char(r.to_date, 'YYYY-MM-DD') AS to_date,
             r.from_part, r.to_part, t.paid
        FROM leave_requests r JOIN leave_types t ON t.id = r.leave_type_id
       WHERE r.employee_id = $1 AND r.status = 'Đã duyệt' AND r.from_date <= $3 AND r.to_date >= $2`, [employeeId, start, to])).rows;
    const leaveOn = (d) => {
      for (const l of leaves) { const part = partOnDate(l, d); if (part) return { part, paid: l.paid, id: l.id }; }
      return null;
    };
    // [HR-G5] ngày đã khóa → mốc chốt (kỳ công; thiếu thì lúc tính cuối) để nhận ra lần chấm đến sau khi chốt (Q5)
    const lockedSince = new Map((await client.query(`
      SELECT to_char(a.work_date, 'YYYY-MM-DD') d, COALESCE(p.closed_at, a.calculated_at) AS since
        FROM attendance_days a LEFT JOIN attendance_periods p ON p.year_month = to_char(a.work_date, 'YYYY-MM')
       WHERE a.employee_id = $1 AND a.locked AND a.work_date BETWEEN $2 AND $3`,
    [employeeId, from, to])).rows.map((r) => [r.d, r.since]));

    const used = new Set();
    const today = vnDate(now);
    let written = 0;
    for (const d of datesBetween(start, to)) {
      let shift = assignOf[d] && byId[assignOf[d]];
      if (!shift) {
        // Tự nhận theo lần VÀO đầu tiên của ngày (lần RA sáng sớm của ca đêm hôm trước không làm nhận nhầm ca ngày)
        const first = punches.find((p) => !used.has(p.id) && p.direction === 'IN' && vnDate(p.at) === d);
        if (first) shift = shifts.find((x) => x.detect && inDetect(x.detect, vnMinutes(first.at)));
      }
      shift = shift || defShift;
      const win = shiftWindow(d, shift);
      const dayStart = Date.parse(`${d}T00:00:00+07:00`);
      const lo = shift.overnight ? win.start - 4 * H : Math.min(win.start - 4 * H, dayStart); // ca ngày: từ 00:00 (chấm rất sớm)
      const hi = win.end + (shift.overnight ? 4 : 7) * H;
      const mine = punches.filter((p) => !used.has(p.id) && p.at.getTime() >= lo && p.at.getTime() < hi);
      mine.forEach((p) => used.add(p.id));
      if (d >= from && (lockedSince.has(d) || closedYm.has(d.slice(0, 7)))) {
        // [HR-G5] Q5: không tính lại ngày đã chốt; lần chấm mới (vd tablet offline đồng bộ muộn) chỉ gắn cờ để xem
        const since = lockedSince.get(d);
        if (since && mine.some((p) => p.created_at > since)) {
          await client.query(`UPDATE attendance_days SET flags = flags || $3::jsonb
                               WHERE employee_id = $1 AND work_date = $2 AND NOT (flags ? $4)`,
          [employeeId, d, JSON.stringify([LATE_PUNCH_FLAG]), LATE_PUNCH_FLAG]);
        }
        continue;
      }
      if (d < from || d > today) continue;

      const lv = leaveOn(d);
      const r = computeDay({
        workDate: d, shift, punches: mine, corrections: corrections.filter((c) => c.d === d),
        isHoliday: holidaySet.has(d), isWorkday: workdays.has(isoWeekday(d)), otApproval: approvalOf[d] || null, cfg, now, leave: lv,
      });
      await client.query(`
        INSERT INTO attendance_days (employee_id, work_date, shift_id, first_in, last_out, worked_min, late_min, early_min,
               ot_min, ot_night_min, ot_holiday_min, ot_calc_min, ot_calc_night_min, ot_calc_holiday_min, ot_status, status, flags,
               calc_version, calculated_at, leave_request_id, leave_part)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now(), $19, $20)
        ON CONFLICT (employee_id, work_date) DO UPDATE SET
               shift_id = EXCLUDED.shift_id, first_in = EXCLUDED.first_in, last_out = EXCLUDED.last_out,
               worked_min = EXCLUDED.worked_min, late_min = EXCLUDED.late_min, early_min = EXCLUDED.early_min,
               ot_min = EXCLUDED.ot_min, ot_night_min = EXCLUDED.ot_night_min, ot_holiday_min = EXCLUDED.ot_holiday_min,
               ot_calc_min = EXCLUDED.ot_calc_min, ot_calc_night_min = EXCLUDED.ot_calc_night_min,
               ot_calc_holiday_min = EXCLUDED.ot_calc_holiday_min, ot_status = EXCLUDED.ot_status, status = EXCLUDED.status,
               flags = EXCLUDED.flags, calc_version = EXCLUDED.calc_version, calculated_at = now(),
               leave_request_id = EXCLUDED.leave_request_id, leave_part = EXCLUDED.leave_part
         WHERE attendance_days.locked = FALSE`,
      [employeeId, d, shift.id, r.first_in, r.last_out, r.worked_min, r.late_min, r.early_min,
        r.ot_min, r.ot_night_min, r.ot_holiday_min, r.ot_calc_min, r.ot_calc_night_min, r.ot_calc_holiday_min,
        r.ot_status, r.status, JSON.stringify(r.flags), CALC_VERSION,
        r.leave_applied ? lv.id : null, r.leave_applied ? r.leave_applied : null]);
      written++;
    }
    // Dòng hàng đợi được xếp TRƯỚC lúc transaction này bắt đầu đã được tính → xóa. Dòng xếp sau giữ lại.
    await client.query(`DELETE FROM attendance_recalc_queue WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3
                         AND queued_at <= transaction_timestamp()`, [employeeId, from, to]);
    await client.query('COMMIT');
    return { written };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
}

// ── Hàng đợi ─────────────────────────────────────────────────────────────
/** Xếp (nhân viên, ngày) vào hàng đợi — gọi BẰNG client của transaction thao tác chính. */
async function enqueue(client, items) {
  const list = items.filter((x) => x.employeeId && x.workDate);
  if (!list.length) return;
  await client.query(`
    INSERT INTO attendance_recalc_queue (employee_id, work_date)
    SELECT * FROM unnest($1::uuid[], $2::date[])
    ON CONFLICT (employee_id, work_date) DO UPDATE SET queued_at = now()`,
  [list.map((x) => x.employeeId), list.map((x) => x.workDate)]);
}

/** Ngày D và các ngày lân cận bị ảnh hưởng (ca đêm của ngày trước / ngày sau) */
const around = (employeeId, workDate) => [-1, 0, 1].map((k) => ({ employeeId, workDate: addDays(workDate, k) }));

async function processRows(conn, rows, ctx) {
  // Gom theo nhân viên → 1 lần tính lại [min, max] / người
  const byEmp = new Map();
  for (const r of rows) {
    const cur = byEmp.get(r.employee_id) || { from: r.d, to: r.d };
    byEmp.set(r.employee_id, { from: r.d < cur.from ? r.d : cur.from, to: r.d > cur.to ? r.d : cur.to });
  }
  let employees = 0; let failed = 0;
  for (const [id, { from, to }] of byEmp) {
    try { await recalcRange(conn, id, from, to, { ctx }); employees++; } catch (err) {
      failed++; console.error('[hrRecalc] lỗi tính lại', id, from, to, err.message);
    }
  }
  return { employees, failed };
}

/** Tính ngay các dòng hàng đợi của vài nhân viên (sau COMMIT của thao tác). Lỗi: dòng còn trong hàng đợi. */
async function drainEmployees(employeeIds, conn = db) {
  const ids = [...new Set(employeeIds)].filter(Boolean);
  if (!ids.length) return { employees: 0, failed: 0 };
  try {
    const { rows } = await conn.query(
      `SELECT employee_id, to_char(work_date, 'YYYY-MM-DD') d FROM attendance_recalc_queue WHERE employee_id = ANY($1::uuid[])`, [ids]);
    if (!rows.length) return { employees: 0, failed: 0 };
    return await processRows(conn, rows, await loadContext(conn));
  } catch (err) {
    console.error('[hrRecalc] drain', err.message);
    return { employees: 0, failed: ids.length };
  }
}

/**
 * Worker: xử lý hàng đợi theo lô. Chỉ 1 tiến trình chạy cùng lúc (pg_try_advisory_lock mức session) —
 * an toàn khi chạy nhiều server.
 */
async function processRecalcQueue(conn = db, { batch = QUEUE_BATCH } = {}) {
  const pool = conn.pool || conn;
  const lockClient = await pool.connect();
  let total = { employees: 0, failed: 0 };
  try {
    const { rows: [{ ok }] } = await lockClient.query(`SELECT pg_try_advisory_lock(hashtext('hr-recalc-queue')) AS ok`);
    if (!ok) return { ...total, skipped: true };
    try {
      const ctx = await loadContext(conn);
      const seenFail = new Set();
      for (;;) {
        const { rows } = await conn.query(`
          SELECT employee_id, to_char(work_date, 'YYYY-MM-DD') d FROM attendance_recalc_queue
           WHERE NOT (employee_id = ANY($2::uuid[])) ORDER BY queued_at LIMIT $1`, [batch, [...seenFail]]);
        if (!rows.length) break;
        const r = await processRows(conn, rows, ctx);
        total = { employees: total.employees + r.employees, failed: total.failed + r.failed };
        if (r.failed) rows.forEach((x) => seenFail.add(x.employee_id)); // lỗi → để lượt sau, không lặp vô hạn
        if (rows.length < batch) break;
      }
    } finally {
      await lockClient.query(`SELECT pg_advisory_unlock(hashtext('hr-recalc-queue'))`);
    }
    return total;
  } finally { lockClient.release(); }
}

/** Job đêm: hôm kia + hôm qua của mọi người đang làm, cộng các ngày "Chưa kết thúc" đã qua (ca đêm quên RA). */
async function nightlyEnqueue(conn = db, { now = new Date() } = {}) {
  const today = vnDate(now);
  const y = addDays(today, -1); const y2 = addDays(today, -2);
  await conn.query(`
    INSERT INTO attendance_recalc_queue (employee_id, work_date)
    SELECT e.id, d::date FROM employees e CROSS JOIN unnest($1::date[]) d
     WHERE e.is_deleted = FALSE AND e.status = 'Hoạt động'
    UNION
    SELECT employee_id, work_date FROM attendance_days WHERE status = 'Chưa kết thúc' AND work_date < $2::date AND NOT locked
    ON CONFLICT (employee_id, work_date) DO UPDATE SET queued_at = now()`, [[y2, y], today]);
}

/** Worker nền: hàng đợi mỗi phút; sau 02:00 (giờ VN) mỗi ngày thêm job đêm. */
function scheduleRecalcWorker(conn = db) {
  let lastNightly = null; let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      const today = vnDate(now);
      if (vnMinutes(now) >= 120 && lastNightly !== today) { lastNightly = today; await nightlyEnqueue(conn, { now }); }
      const r = await processRecalcQueue(conn);
      if (r.failed) console.error(`[hrRecalc] worker: lỗi ${r.failed} nhân viên — sẽ thử lại`);
    } catch (err) { console.error('[hrRecalc] worker', err.message); } finally { running = false; }
  };
  setInterval(tick, 60 * 1000).unref();
}

module.exports = {
  recalcRange, enqueue, around, drainEmployees, processRecalcQueue, nightlyEnqueue, scheduleRecalcWorker,
  addDays, vnDate, datesBetween,
};
