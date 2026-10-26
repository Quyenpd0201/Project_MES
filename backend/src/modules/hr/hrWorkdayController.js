// [HR-G3] Tính công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// Phân ca, duyệt lần chấm cần xác nhận, sửa công, duyệt tăng ca, xem / tính lại ngày công.
// Mọi thao tác ghi: transaction + audit; xong (sau COMMIT) thì tính lại ngày công liên quan.
const db = require('../../core/db');
const { hrScope, isEmployeeInScope, canManageAllUnits, subtreeSql, UUID_RE } = require('../../core/lib/hrScope');
const { logHr } = require('../../core/lib/hrAudit');
const { enqueue, around, drainEmployees, addDays, vnDate, datesBetween } = require('./hrRecalc');
const { assertOpen, monthsBetween, PeriodClosedError } = require('../../core/lib/periodLock'); // [HR-G5] chặn ghi tháng đã chốt

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 62;
const MAX_ITEMS = 500;
const isUuid = (v) => UUID_RE.test(String(v || ''));
const str = (v) => (v == null ? '' : String(v).trim());

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };

/** Chạy fn trong transaction; HttpError → mã lỗi tương ứng. Trả kết quả fn hoặc undefined (đã trả lỗi). */
async function tx(res, fn) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof HttpError) { res.status(err.status).json({ message: err.message }); return undefined; }
    if (err instanceof PeriodClosedError) { res.status(409).json({ message: err.message }); return undefined; } // [HR-G5]
    if (err.code === '23514' || err.code === '22007' || err.code === '22P02') { res.status(400).json({ message: 'Dữ liệu không hợp lệ' }); return undefined; }
    throw err;
  } finally { client.release(); }
}

async function requireInScope(conn, req, employeeId) {
  if (!(await isEmployeeInScope(conn, req, employeeId))) fail(404, 'Không tìm thấy nhân viên');
}

function parseRange(q, { defaultDays = 7 } = {}) {
  const to = DATE_RE.test(q.to || '') ? q.to : vnDate(new Date());
  const from = DATE_RE.test(q.from || '') ? q.from : addDays(to, -(defaultDays - 1));
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (!(span >= 0)) fail(400, 'Ngày bắt đầu phải trước ngày kết thúc');
  if (span > MAX_RANGE_DAYS) fail(400, `Chỉ xem tối đa ${MAX_RANGE_DAYS} ngày mỗi lần`);
  return { from, to };
}

/** Sau COMMIT (kết nối đã trả): tính ngay các dòng hàng đợi của những nhân viên này — lỗi thì worker tính sau. */
const drain = (items) => drainEmployees(items.map((x) => x.employeeId));

/** [Review G3] Không được xử lý ngày công của CHÍNH MÌNH (nhân viên gắn với tài khoản đang đăng nhập). */
async function forbidSelf(client, req, employeeId) {
  const { rows: [e] } = await client.query('SELECT user_id FROM employees WHERE id = $1', [employeeId]);
  if (e?.user_id && e.user_id === req.user.id) fail(403, 'Không được tự xử lý ngày công của chính mình — chuyển người khác');
}

/** Ngày đã chốt? FOR SHARE: thao tác chốt công chạy đồng thời phải chờ → không vượt được kiểm tra. */
async function isLocked(client, employeeId, workDate) {
  const { rows } = await client.query(
    'SELECT 1 FROM attendance_days WHERE employee_id = $1 AND work_date = $2 AND locked FOR SHARE', [employeeId, workDate]);
  return rows.length > 0;
}

const sendErr = (res, err) => { if (err instanceof HttpError) { res.status(err.status).json({ message: err.message }); return true; } return false; };

// ── Phân ca ──────────────────────────────────────────────────────────────
exports.listAssignments = async (req, res) => {
  try {
    const { from, to } = parseRange(req.query);
    const params = [from, to];
    let unitSql = '';
    if (isUuid(req.query.org_unit_id)) { params.push(req.query.org_unit_id); unitSql = `AND e.org_unit_id IN ${subtreeSql(params.length)}`; }
    const sc = await hrScope(req, { col: 'e.org_unit_id', startIndex: params.length + 1 });
    const { rows } = await db.query(`
      SELECT a.id, a.employee_id, to_char(a.work_date, 'YYYY-MM-DD') AS work_date, a.shift_id, s.shift_code, s.name AS shift_name, a.note
        FROM shift_assignments a JOIN employees e ON e.id = a.employee_id JOIN shifts s ON s.id = a.shift_id
       WHERE a.work_date BETWEEN $1 AND $2 ${unitSql} AND ${sc.sql}
       ORDER BY a.work_date`, [...params, ...sc.params]);
    res.json({ data: rows });
  } catch (err) { if (!sendErr(res, err)) throw err; }
};

exports.saveAssignments = async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items || !items.length || items.length > MAX_ITEMS) return res.status(400).json({ message: `Danh sách gán ca không hợp lệ (1–${MAX_ITEMS} dòng)` });
  const out = await tx(res, async (client) => {
    await assertOpen(client, items.map((it) => (DATE_RE.test(it?.work_date || '') ? it.work_date : null))); // [HR-G5]
    for (const it of items) {
      if (!isUuid(it.employee_id) || !DATE_RE.test(it.work_date || '')) fail(400, 'Dòng gán ca thiếu nhân viên hoặc ngày');
      await requireInScope(client, req, it.employee_id);
      // [Review G3] đổi ca ngày đã qua làm thay đổi ngày công đã có → chỉ nhân sự (tránh 1 người tự làm đẹp công)
      if (it.work_date < vnDate(new Date()) && !canManageAllUnits(req)) {
        fail(403, `Ngày ${it.work_date} đã qua — chỉ nhân sự được đổi ca; trưởng tổ hãy tạo yêu cầu sửa công`);
      }
      await forbidSelf(client, req, it.employee_id);
      const { rows: [cur] } = await client.query(
        'SELECT id, shift_id FROM shift_assignments WHERE employee_id = $1 AND work_date = $2 FOR UPDATE', [it.employee_id, it.work_date]);
      if (await isLocked(client, it.employee_id, it.work_date)) fail(409, `Ngày ${it.work_date} đã chốt công, không đổi ca được`);
      if (it.shift_id == null || it.shift_id === '') {
        if (cur) await client.query('DELETE FROM shift_assignments WHERE id = $1', [cur.id]);
      } else {
        if (!isUuid(it.shift_id)) fail(400, 'Ca làm không hợp lệ');
        const { rows: [s] } = await client.query(`SELECT overnight FROM shifts WHERE id = $1 AND is_deleted = FALSE`, [it.shift_id]);
        if (!s) fail(400, 'Ca làm không tồn tại');
        // [HR-G4 review R5] Q3: ca đêm chỉ nghỉ cả ca → không gán ca đêm vào ngày đang có đơn nghỉ NỬA buổi
        if (s.overnight) {
          const { rows: half } = await client.query(`
            SELECT 1 FROM leave_requests WHERE employee_id = $1 AND status IN ('Chờ trưởng đơn vị', 'Chờ nhân sự', 'Đã duyệt')
               AND ((from_date = $2 AND from_part <> 'FULL') OR (to_date = $2 AND to_part <> 'FULL')) LIMIT 1`, [it.employee_id, it.work_date]);
          if (half.length) fail(409, `Ngày ${it.work_date} có đơn nghỉ nửa buổi — ca đêm chỉ nghỉ cả ca, hãy sửa đơn trước`);
        }
        await client.query(
          `INSERT INTO shift_assignments (employee_id, work_date, shift_id, note, assigned_by) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (employee_id, work_date) DO UPDATE SET shift_id = EXCLUDED.shift_id, note = EXCLUDED.note,
                  assigned_by = EXCLUDED.assigned_by, created_at = now()`,
          [it.employee_id, it.work_date, it.shift_id, str(it.note) || null, req.user.id]);
      }
      await logHr(client, req, { action: 'assign_shift', entity: 'employee', entityId: it.employee_id,
        before: cur ? { work_date: it.work_date, shift_id: cur.shift_id } : null, after: { work_date: it.work_date, shift_id: it.shift_id || null } });
      await enqueue(client, around(it.employee_id, it.work_date));
    }
    return { saved: items.length };
  });
  if (!out) return;
  await drain(items.map((it) => ({ employeeId: it.employee_id })));
  res.json(out);
};

// ── Duyệt lần chấm cần xác nhận ──────────────────────────────────────────
exports.pendingReviews = async (req, res) => {
  try {
    const { from, to } = parseRange(req.query, { defaultDays: 31 });
    const sc = await hrScope(req, { col: 'e.org_unit_id', startIndex: 3 });
    const { rows } = await db.query(`
      SELECT p.id, p.employee_id, e.employee_code, e.name AS employee_name, u.name AS org_unit_name, p.punched_at,
             to_char(p.work_date, 'YYYY-MM-DD') AS work_date, p.source, p.pin_verified, p.review_reason, p.photo_id,
             (ph.purged_at IS NOT NULL) AS photo_purged, d.name AS device_name
        FROM attendance_punches p
        JOIN employees e ON e.id = p.employee_id
        LEFT JOIN org_units u ON u.id = e.org_unit_id
        LEFT JOIN punch_photos ph ON ph.id = p.photo_id
        LEFT JOIN kiosk_devices d ON d.id = p.device_id
       WHERE p.needs_review AND NOT EXISTS (SELECT 1 FROM punch_reviews r WHERE r.punch_id = p.id)
         AND p.work_date BETWEEN $1 AND $2 AND ${sc.sql}
       ORDER BY p.punched_at LIMIT 1000`, [from, to, ...sc.params]);
    res.json({ data: rows });
  } catch (err) { if (!sendErr(res, err)) throw err; }
};

exports.reviewPunch = async (req, res) => {
  const { id } = req.params;
  const decision = req.body?.decision;
  const reason = str(req.body?.reason);
  if (!isUuid(id)) return res.status(404).json({ message: 'Không tìm thấy lần chấm' });
  if (!['accept', 'reject'].includes(decision)) return res.status(400).json({ message: 'Chọn Duyệt hoặc Từ chối' });
  if (decision === 'reject' && !reason) return res.status(400).json({ message: 'Vui lòng nhập lý do từ chối' });
  const out = await tx(res, async (client) => {
    const { rows: [p] } = await client.query(
      `SELECT id, employee_id, to_char(work_date, 'YYYY-MM-DD') AS work_date, needs_review FROM attendance_punches WHERE id = $1`, [id]);
    if (!p) fail(404, 'Không tìm thấy lần chấm');
    await requireInScope(client, req, p.employee_id);
    await forbidSelf(client, req, p.employee_id);
    await assertOpen(client, [p.work_date]); // [HR-G5]
    if (!p.needs_review) fail(400, 'Lần chấm này không cần xác nhận');
    const ins = await client.query(
      `INSERT INTO punch_reviews (punch_id, decision, reason, reviewed_by) VALUES ($1, $2, $3, $4) ON CONFLICT (punch_id) DO NOTHING`,
      [id, decision, reason || null, req.user.id]);
    if (!ins.rowCount) fail(409, 'Lần chấm này đã được xử lý');
    await logHr(client, req, { action: decision === 'accept' ? 'accept_punch' : 'reject_punch', entity: 'attendance_punch', entityId: id,
      after: { employee_id: p.employee_id, reason } });
    await enqueue(client, around(p.employee_id, p.work_date));
    return p;
  });
  if (!out) return;
  await drain([{ employeeId: out.employee_id }]);
  res.json({ id, decision });
};

// ── Sửa công ─────────────────────────────────────────────────────────────
const CORRECTION_KINDS = ['add_in', 'add_out', 'ignore_punch'];

exports.listCorrections = async (req, res) => {
  try {
    const { from, to } = parseRange(req.query, { defaultDays: 31 });
    const params = [from, to];
    let statusSql = '';
    if (req.query.status) { params.push(String(req.query.status)); statusSql = `AND c.status = $${params.length}`; }
    const sc = await hrScope(req, { col: 'e.org_unit_id', startIndex: params.length + 1 });
    const { rows } = await db.query(`
      SELECT c.id, c.employee_id, e.employee_code, e.name AS employee_name, to_char(c.work_date, 'YYYY-MM-DD') AS work_date,
             c.kind, c.new_time, c.punch_id, c.reason, c.status, c.requested_by, ru.full_name AS requested_by_name,
             c.decided_by, du.full_name AS decided_by_name, c.decided_at, c.reject_reason, c.created_at,
             (c.requested_by = $${params.length + sc.params.length + 1}) AS mine
        FROM attendance_corrections c
        JOIN employees e ON e.id = c.employee_id
        LEFT JOIN users ru ON ru.id = c.requested_by
        LEFT JOIN users du ON du.id = c.decided_by
       WHERE c.work_date BETWEEN $1 AND $2 ${statusSql} AND ${sc.sql}
       ORDER BY c.created_at DESC LIMIT 1000`, [...params, ...sc.params, req.user.id]);
    res.json({ data: rows });
  } catch (err) { if (!sendErr(res, err)) throw err; }
};

exports.createCorrection = async (req, res) => {
  const b = req.body || {};
  const out = await tx(res, async (client) => {
    if (!isUuid(b.employee_id) || !DATE_RE.test(b.work_date || '')) fail(400, 'Thiếu nhân viên hoặc ngày công');
    if (!CORRECTION_KINDS.includes(b.kind)) fail(400, 'Loại sửa công không hợp lệ');
    if (!str(b.reason)) fail(400, 'Vui lòng nhập lý do sửa công');
    await requireInScope(client, req, b.employee_id);
    await assertOpen(client, [b.work_date]); // [HR-G5]
    if (await isLocked(client, b.employee_id, b.work_date)) fail(409, 'Ngày công đã chốt — cần mở khóa trước khi sửa');
    const lo = Date.parse(`${b.work_date}T00:00:00+07:00`) - 86400000;
    const hi = Date.parse(`${b.work_date}T00:00:00+07:00`) + 2 * 86400000;
    let newTime = null; let punchId = null;
    if (b.kind === 'ignore_punch') {
      if (!isUuid(b.punch_id)) fail(400, 'Chọn lần chấm cần bỏ');
      const { rows: [p] } = await client.query('SELECT punched_at FROM attendance_punches WHERE id = $1 AND employee_id = $2', [b.punch_id, b.employee_id]);
      if (!p) fail(400, 'Lần chấm không thuộc nhân viên này');
      if (p.punched_at < lo || p.punched_at >= hi) fail(400, 'Lần chấm không thuộc ngày công này (± 1 ngày)');
      punchId = b.punch_id;
    } else {
      newTime = new Date(b.new_time);
      if (Number.isNaN(newTime.getTime()) || newTime < lo || newTime >= hi) fail(400, 'Giờ bổ sung phải nằm trong ngày công (± 1 ngày)');
      if (newTime > new Date()) fail(400, 'Giờ bổ sung không được ở tương lai');
    }
    // [Review G3] mỗi loại / ngày (hoặc mỗi lần chấm) chỉ 1 yêu cầu đang chờ → không có 2 giờ RA mâu thuẫn
    const { rows: dup } = await client.query(
      `SELECT 1 FROM attendance_corrections WHERE employee_id = $1 AND work_date = $2 AND kind = $3 AND status = 'Chờ duyệt'
         AND ($4::uuid IS NULL OR punch_id = $4) FOR UPDATE`, [b.employee_id, b.work_date, b.kind, punchId]);
    if (dup.length) fail(409, 'Đã có yêu cầu cùng loại đang chờ duyệt cho ngày này — hủy hoặc chờ duyệt yêu cầu đó');
    const { rows: [c] } = await client.query(
      `INSERT INTO attendance_corrections (employee_id, work_date, kind, new_time, punch_id, reason, requested_by, created_on_behalf)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING id, status`,
      [b.employee_id, b.work_date, b.kind, newTime, punchId, str(b.reason).slice(0, 500), req.user.id]);
    await logHr(client, req, { action: 'create_correction', entity: 'attendance_correction', entityId: c.id,
      after: { employee_id: b.employee_id, work_date: b.work_date, kind: b.kind, new_time: newTime, punch_id: punchId } });
    return c;
  });
  if (out) res.status(201).json(out);
};

async function decideCorrection(req, res, action) {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ message: 'Không tìm thấy yêu cầu' });
  const rejectReason = str(req.body?.reject_reason);
  if (action === 'reject' && !rejectReason) return res.status(400).json({ message: 'Vui lòng nhập lý do từ chối' });
  const out = await tx(res, async (client) => {
    const { rows: [c] } = await client.query(
      `SELECT id, employee_id, to_char(work_date, 'YYYY-MM-DD') AS work_date, status, requested_by FROM attendance_corrections WHERE id = $1 FOR UPDATE`, [id]);
    if (!c) fail(404, 'Không tìm thấy yêu cầu');
    await requireInScope(client, req, c.employee_id);
    if (c.status !== 'Chờ duyệt') fail(409, `Yêu cầu đã ở trạng thái "${c.status}"`);
    if (action === 'cancel') {
      if (c.requested_by !== req.user.id) fail(403, 'Chỉ người tạo mới hủy được yêu cầu');
      await client.query(`UPDATE attendance_corrections SET status = 'Đã hủy', decided_at = now() WHERE id = $1`, [id]);
    } else {
      if (c.requested_by === req.user.id) fail(403, 'Không được tự duyệt yêu cầu do chính mình tạo — chuyển trưởng xưởng / nhân sự duyệt');
      await forbidSelf(client, req, c.employee_id);
      if (action === 'approve') await assertOpen(client, [c.work_date]); // [HR-G5]
      if (action === 'approve' && await isLocked(client, c.employee_id, c.work_date)) fail(409, 'Ngày công đã chốt — cần mở khóa trước khi duyệt');
      await client.query(
        `UPDATE attendance_corrections SET status = $1, decided_by = $2, decided_at = now(), reject_reason = $3 WHERE id = $4`,
        [action === 'approve' ? 'Đã duyệt' : 'Từ chối', req.user.id, action === 'reject' ? rejectReason : null, id]);
    }
    await logHr(client, req, { action: `${action}_correction`, entity: 'attendance_correction', entityId: id,
      before: { status: c.status }, after: { reject_reason: rejectReason || null } });
    if (action === 'approve') await enqueue(client, around(c.employee_id, c.work_date));
    return c;
  });
  if (!out) return;
  if (action === 'approve') await drain([{ employeeId: out.employee_id }]);
  res.json({ id, action });
}
exports.approveCorrection = (req, res) => decideCorrection(req, res, 'approve');
exports.rejectCorrection = (req, res) => decideCorrection(req, res, 'reject');
exports.cancelCorrection = (req, res) => decideCorrection(req, res, 'cancel');

// ── Duyệt tăng ca ────────────────────────────────────────────────────────
exports.approveOvertime = async (req, res) => {
  const { employeeId, date } = req.params;
  if (!isUuid(employeeId) || !DATE_RE.test(date)) return res.status(404).json({ message: 'Không tìm thấy ngày công' });
  const v = {
    ot_min: Number(req.body?.ot_min ?? 0), ot_night_min: Number(req.body?.ot_night_min ?? 0), ot_holiday_min: Number(req.body?.ot_holiday_min ?? 0),
  };
  if (Object.values(v).some((n) => !Number.isInteger(n) || n < 0)) return res.status(400).json({ message: 'Số phút tăng ca phải là số nguyên ≥ 0' });
  const out = await tx(res, async (client) => {
    await requireInScope(client, req, employeeId);
    await forbidSelf(client, req, employeeId);
    await assertOpen(client, [date]); // [HR-G5]
    const { rows: [d] } = await client.query(
      'SELECT ot_calc_min, ot_calc_night_min, ot_calc_holiday_min, locked FROM attendance_days WHERE employee_id = $1 AND work_date = $2 FOR UPDATE',
      [employeeId, date]);
    if (!d) fail(404, 'Chưa có ngày công này');
    if (d.locked) fail(409, 'Ngày công đã chốt');
    if (v.ot_min > d.ot_calc_min || v.ot_night_min > d.ot_calc_night_min || v.ot_holiday_min > d.ot_calc_holiday_min) {
      fail(400, `Không được duyệt quá số phút tính được (thường ${d.ot_calc_min}, đêm ${d.ot_calc_night_min}, ngày nghỉ/lễ ${d.ot_calc_holiday_min})`);
    }
    await client.query(
      `INSERT INTO overtime_approvals (employee_id, work_date, approved_ot_min, approved_ot_night_min, approved_ot_holiday_min, note, approved_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (employee_id, work_date) DO UPDATE SET approved_ot_min = EXCLUDED.approved_ot_min,
              approved_ot_night_min = EXCLUDED.approved_ot_night_min, approved_ot_holiday_min = EXCLUDED.approved_ot_holiday_min,
              note = EXCLUDED.note, approved_by = EXCLUDED.approved_by, approved_at = now()`,
      [employeeId, date, v.ot_min, v.ot_night_min, v.ot_holiday_min, str(req.body?.note) || null, req.user.id]);
    await logHr(client, req, { action: 'approve_overtime', entity: 'employee', entityId: employeeId, after: { work_date: date, ...v } });
    await enqueue(client, [{ employeeId, workDate: date }]);
    return true;
  });
  if (!out) return;
  await drain([{ employeeId }]);
  res.json({ employee_id: employeeId, work_date: date, ...v });
};

// ── Ngày công ────────────────────────────────────────────────────────────
exports.listDays = async (req, res) => {
  try {
    const { from, to } = parseRange(req.query);
    const params = [from, to];
    const extra = [];
    if (isUuid(req.query.employee_id)) { params.push(req.query.employee_id); extra.push(`a.employee_id = $${params.length}`); }
    if (isUuid(req.query.org_unit_id)) { params.push(req.query.org_unit_id); extra.push(`e.org_unit_id IN ${subtreeSql(params.length)}`); }
    if (req.query.status) { params.push(String(req.query.status)); extra.push(`a.status = $${params.length}`); }
    if (req.query.ot_status) { params.push(String(req.query.ot_status)); extra.push(`a.ot_status = $${params.length}`); }
    const sc = await hrScope(req, { col: 'e.org_unit_id', startIndex: params.length + 1 });
    const { rows } = await db.query(`
      SELECT a.employee_id, e.employee_code, e.name AS employee_name, u.name AS org_unit_name,
             to_char(a.work_date, 'YYYY-MM-DD') AS work_date, s.shift_code, s.name AS shift_name, a.first_in, a.last_out,
             a.worked_min, a.late_min, a.early_min, a.ot_min, a.ot_night_min, a.ot_holiday_min,
             a.ot_calc_min, a.ot_calc_night_min, a.ot_calc_holiday_min, a.ot_status, a.status, a.flags, a.locked
        FROM attendance_days a
        JOIN employees e ON e.id = a.employee_id
        LEFT JOIN org_units u ON u.id = e.org_unit_id
        LEFT JOIN shifts s ON s.id = a.shift_id
       WHERE a.work_date BETWEEN $1 AND $2 ${extra.map((x) => `AND ${x}`).join(' ')} AND ${sc.sql}
       ORDER BY a.work_date DESC, u.name, e.name LIMIT 5000`, [...params, ...sc.params]);
    res.json({ data: rows });
  } catch (err) { if (!sendErr(res, err)) throw err; }
};

exports.dayDetail = async (req, res) => {
  const { employeeId, date } = req.params;
  if (!isUuid(employeeId) || !DATE_RE.test(date)) return res.status(404).json({ message: 'Không tìm thấy ngày công' });
  if (!(await isEmployeeInScope(db, req, employeeId))) return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
  const lo = new Date(Date.parse(`${date}T00:00:00+07:00`) - 6 * 3600000);
  const hi = new Date(Date.parse(`${date}T00:00:00+07:00`) + 36 * 3600000);
  const [emp, day, punches, corrections, assignment, ot] = await Promise.all([
    db.query(`SELECT e.id, e.employee_code, e.name, u.name AS org_unit_name FROM employees e LEFT JOIN org_units u ON u.id = e.org_unit_id WHERE e.id = $1`, [employeeId]),
    db.query(`SELECT a.*, to_char(a.work_date, 'YYYY-MM-DD') AS work_date, s.shift_code, s.name AS shift_name
                FROM attendance_days a LEFT JOIN shifts s ON s.id = a.shift_id WHERE a.employee_id = $1 AND a.work_date = $2`, [employeeId, date]),
    db.query(`SELECT p.id, p.punched_at, p.source, p.pin_verified, p.needs_review, p.review_reason, p.photo_id,
                     (ph.purged_at IS NOT NULL) AS photo_purged, r.decision, r.reason AS review_note, ru.full_name AS reviewed_by_name, d.name AS device_name
                FROM attendance_punches p
                LEFT JOIN punch_reviews r ON r.punch_id = p.id LEFT JOIN users ru ON ru.id = r.reviewed_by
                LEFT JOIN punch_photos ph ON ph.id = p.photo_id LEFT JOIN kiosk_devices d ON d.id = p.device_id
               WHERE p.employee_id = $1 AND p.punched_at >= $2 AND p.punched_at < $3 ORDER BY p.punched_at`, [employeeId, lo, hi]),
    db.query(`SELECT c.*, ru.full_name AS requested_by_name, du.full_name AS decided_by_name
                FROM attendance_corrections c LEFT JOIN users ru ON ru.id = c.requested_by LEFT JOIN users du ON du.id = c.decided_by
               WHERE c.employee_id = $1 AND c.work_date = $2 ORDER BY c.created_at`, [employeeId, date]),
    db.query(`SELECT a.shift_id, s.name AS shift_name FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE a.employee_id = $1 AND a.work_date = $2`, [employeeId, date]),
    db.query(`SELECT o.*, u.full_name AS approved_by_name FROM overtime_approvals o LEFT JOIN users u ON u.id = o.approved_by WHERE o.employee_id = $1 AND o.work_date = $2`, [employeeId, date]),
  ]);
  res.json({ employee: emp.rows[0], day: day.rows[0] || null, punches: punches.rows, corrections: corrections.rows,
    assignment: assignment.rows[0] || null, overtime_approval: ot.rows[0] || null });
};

exports.recalculate = async (req, res) => {
  if (!canManageAllUnits(req)) return res.status(403).json({ message: 'Chỉ nhân sự mới được tính lại hàng loạt' });
  try {
    const { from, to } = parseRange(req.body || {}, { defaultDays: 1 });
    const empId = req.body?.employee_id;
    if (empId && !isUuid(empId)) return res.status(400).json({ message: 'Nhân viên không hợp lệ' });
    // [Review G3] không chạy trong request: xếp hàng đợi, worker nền tính (mỗi phút) → 202
    const { rowCount } = await db.query(`
      INSERT INTO attendance_recalc_queue (employee_id, work_date)
      SELECT e.id, d::date FROM employees e CROSS JOIN unnest($1::date[]) d
       WHERE e.is_deleted = FALSE AND (($2::uuid IS NULL AND e.status = 'Hoạt động') OR e.id = $2)
      ON CONFLICT (employee_id, work_date) DO UPDATE SET queued_at = now()`, [datesBetween(from, to), empId || null]);
    await logHr(db, req, { action: 'recalculate', entity: 'attendance_days', entityId: empId || null, after: { from, to, queued: rowCount } });
    res.status(202).json({ from, to, queued: rowCount, message: 'Đã xếp hàng tính lại — kết quả cập nhật trong vài phút' });
  } catch (err) { if (!sendErr(res, err)) throw err; }
};
