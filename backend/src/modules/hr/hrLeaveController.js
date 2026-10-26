// [HR-G4] Đơn nghỉ phép — 2026-10-26, CHƯA PHÁT HÀNH (file mới)
// Tạo hộ → trưởng đơn vị duyệt → (tùy loại) nhân sự duyệt cuối → vào ngày công. Số dư phép, đính kèm, thông báo.
// Quyết định Q1–Q8 (2026-10-26): plan docs/ai/plans/2026-10-26-hr-g4-don-nghi-phep.md.
const db = require('../../core/db');
const { hrScope, isEmployeeInScope, canManageAllUnits, UUID_RE } = require('../../core/lib/hrScope');
const { logHr } = require('../../core/lib/hrAudit');
const { getAppSettings } = require('../../core/lib/settings');
const photoStore = require('../../core/lib/photoStore');
const { normalizeParts, slotRange, countDays, daysByYear } = require('../../core/lib/leaveRules');
const { enqueue, drainEmployees, vnDate, datesBetween } = require('./hrRecalc');
const { assertOpen, monthsBetween, PeriodClosedError } = require('../../core/lib/periodLock'); // [HR-G5] chặn ghi tháng đã chốt

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PENDING = ['Chờ trưởng đơn vị', 'Chờ nhân sự'];
const isUuid = (v) => UUID_RE.test(String(v || ''));
const str = (v) => (v == null ? '' : String(v).trim());

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };

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
    if (err.code === '23P01') { res.status(409).json({ message: 'Trùng ngày với một đơn nghỉ khác của nhân viên này' }); return undefined; }
    if (/^2[23]/.test(String(err.code || ''))) { res.status(400).json({ message: 'Dữ liệu không hợp lệ' }); return undefined; }
    throw err;
  } finally { client.release(); }
}
const wrap = (fn) => async (req, res) => { try { await fn(req, res); } catch (err) { if (err instanceof HttpError) res.status(err.status).json({ message: err.message }); else throw err; } };

/** Lịch dùng cho đếm ngày: ngày làm việc trong tuần + ngày lễ trong khoảng */
async function calendar(conn, from, to) {
  const s = await getAppSettings(conn);
  const { rows } = await conn.query(`SELECT to_char(date, 'YYYY-MM-DD') d FROM holidays WHERE date BETWEEN $1 AND $2`, [from, to]);
  return {
    workdays: new Set(String(s.hr_workdays).split(',').map((x) => Number(x.trim())).filter(Boolean)),
    holidays: new Set(rows.map((r) => r.d)),
  };
}

async function notify(client, userIds, n) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  await client.query(`
    INSERT INTO notifications (user_id, type, title, body, ref_type, ref_id)
    SELECT unnest($1::uuid[]), $2, $3, $4, 'leave_request', $5`, [ids, n.type, n.title, n.body || null, String(n.ref_id)]);
}

/** Người quản lý đơn vị của nhân viên và các đơn vị cha (người nhận thông báo "có đơn chờ duyệt"). */
async function managersOf(client, employeeId) {
  const { rows } = await client.query(`
    WITH RECURSIVE up AS (
      SELECT u.id, u.parent_id FROM org_units u JOIN employees e ON e.org_unit_id = u.id WHERE e.id = $1
      UNION SELECT p.id, p.parent_id FROM org_units p JOIN up ON up.parent_id = p.id)
    SELECT DISTINCT m.user_id FROM org_unit_managers m JOIN up ON up.id = m.org_unit_id`, [employeeId]);
  return rows.map((r) => r.user_id);
}

/** Số dư 1 loại nghỉ / năm: được hưởng (+ chỉnh), đã dùng (đơn đã duyệt), đang chờ, còn lại. */
async function balanceOf(conn, employeeId, leaveType, year, { excludeId = null } = {}) {
  const { rows: [b] } = await conn.query(
    'SELECT entitled, adjusted FROM leave_balances WHERE employee_id = $1 AND year = $2 AND leave_type_id = $3', [employeeId, year, leaveType.id]);
  const entitled = b ? Number(b.entitled) : Number(leaveType.annual_days);
  const adjusted = b ? Number(b.adjusted) : 0;
  const { rows: reqs } = await conn.query(`
    SELECT id, to_char(from_date, 'YYYY-MM-DD') from_date, to_char(to_date, 'YYYY-MM-DD') to_date, from_part, to_part, status, days_by_year
      FROM leave_requests WHERE employee_id = $1 AND leave_type_id = $2 AND status IN ('Đã duyệt', 'Chờ trưởng đơn vị', 'Chờ nhân sự')
       AND from_date <= make_date($3, 12, 31) AND to_date >= make_date($3, 1, 1) AND ($4::uuid IS NULL OR id <> $4)`,
  [employeeId, leaveType.id, year, excludeId]);
  let cal = null;
  let used = 0; let pending = 0;
  for (const r of reqs) {
    let n;
    if (r.days_by_year) n = Number(r.days_by_year[year]) || 0; // [Review G4 R12] số ngày CHỐT lúc tạo đơn
    else { cal = cal || await calendar(conn, `${year - 1}-12-01`, `${year + 1}-01-31`); n = daysByYear(r, cal)[year] || 0; }
    if (r.status === 'Đã duyệt') used += n; else pending += n;
  }
  return { entitled, adjusted, used, pending, remaining: entitled + adjusted - used };
}

/** [Review G4 R2] Khóa theo (nhân viên, loại nghỉ) trong transaction → 2 thao tác đồng thời không cùng qua kiểm số dư. */
const lockBalance = (client, employeeId, leaveTypeId) =>
  client.query(`SELECT pg_advisory_xact_lock(hashtext('hr-leave-balance:' || $1 || ':' || $2))`, [employeeId, leaveTypeId]);

async function loadType(conn, id) {
  if (!isUuid(id)) fail(400, 'Chọn loại nghỉ');
  const { rows: [t] } = await conn.query(`SELECT * FROM leave_types WHERE id = $1 AND is_deleted = FALSE AND status = 'Hoạt động'`, [id]);
  if (!t) fail(400, 'Loại nghỉ không tồn tại hoặc đã ngừng');
  return t;
}

async function requireInScope(conn, req, employeeId) {
  if (!(await isEmployeeInScope(conn, req, employeeId))) fail(404, 'Không tìm thấy nhân viên');
}
async function forbidSelf(conn, req, r) {
  if (r.created_by === req.user.id) fail(403, 'Không được tự duyệt đơn do chính mình tạo');
  const { rows: [e] } = await conn.query('SELECT user_id FROM employees WHERE id = $1', [r.employee_id]);
  if (e?.user_id && e.user_id === req.user.id) fail(403, 'Không được tự duyệt đơn nghỉ của chính mình');
}

/** Các ngày của đơn → hàng đợi tính lại ngày công */
const leaveDays = (r) => datesBetween(r.from_date, r.to_date).map((d) => ({ employeeId: r.employee_id, workDate: d }));

const SELECT_REQ = `
  SELECT r.*, to_char(r.from_date, 'YYYY-MM-DD') AS from_date, to_char(r.to_date, 'YYYY-MM-DD') AS to_date,
         e.employee_code, e.name AS employee_name, u.name AS org_unit_name, t.name AS leave_type_name, t.code AS leave_type_code,
         t.requires_attachment, t.requires_hr_approval, t.paid,
         cu.full_name AS created_by_name, au.full_name AS approved_by_name, hu.full_name AS hr_approved_by_name, ru.full_name AS rejected_by_name,
         (SELECT count(*)::int FROM leave_attachments a WHERE a.request_id = r.id) AS attachment_count
    FROM leave_requests r
    JOIN employees e ON e.id = r.employee_id
    LEFT JOIN org_units u ON u.id = e.org_unit_id
    JOIN leave_types t ON t.id = r.leave_type_id
    LEFT JOIN users cu ON cu.id = r.created_by LEFT JOIN users au ON au.id = r.approved_by
    LEFT JOIN users hu ON hu.id = r.hr_approved_by LEFT JOIN users ru ON ru.id = r.rejected_by`;

// ── Danh sách / chi tiết ─────────────────────────────────────────────────
exports.list = wrap(async (req, res) => {
  const q = req.query; const params = []; const where = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (DATE_RE.test(q.from || '')) add('r.to_date >= ?', q.from);
  if (DATE_RE.test(q.to || '')) add('r.from_date <= ?', q.to);
  if (isUuid(q.employee_id)) add('r.employee_id = ?', q.employee_id);
  if (q.status === 'pending') where.push(`r.status IN ('Chờ trưởng đơn vị', 'Chờ nhân sự')`);
  else if (q.status) add('r.status = ?', String(q.status));
  if (q.mine === '1') add('r.created_by = ?', req.user.id);
  const sc = await hrScope(req, { col: 'e.org_unit_id', startIndex: params.length + 1 });
  const { rows } = await db.query(`${SELECT_REQ} WHERE ${[...where, sc.sql].join(' AND ') || 'TRUE'}
    ORDER BY r.created_at DESC LIMIT 1000`, [...params, ...sc.params]);
  res.json({ data: rows });
});

exports.detail = wrap(async (req, res) => {
  if (!isUuid(req.params.id)) fail(404, 'Không tìm thấy đơn');
  const { rows: [r] } = await db.query(`${SELECT_REQ} WHERE r.id = $1`, [req.params.id]);
  if (!r || !(await isEmployeeInScope(db, req, r.employee_id))) fail(404, 'Không tìm thấy đơn');
  const { rows: attachments } = await db.query(
    `SELECT a.id, a.mime, a.bytes, a.file_name, a.created_at, u.full_name AS uploaded_by_name
       FROM leave_attachments a LEFT JOIN users u ON u.id = a.uploaded_by WHERE a.request_id = $1 ORDER BY a.created_at`, [r.id]);
  res.json({ ...r, attachments });
});

// ── Tạo đơn hộ ───────────────────────────────────────────────────────────
exports.create = async (req, res) => {
  const b = req.body || {};
  const out = await tx(res, async (client) => {
    if (!isUuid(b.employee_id)) fail(400, 'Chọn nhân viên');
    if (!DATE_RE.test(b.from_date || '') || !DATE_RE.test(b.to_date || '')) fail(400, 'Chọn từ ngày và đến ngày');
    if (!str(b.reason)) fail(400, 'Vui lòng nhập lý do nghỉ');
    await requireInScope(client, req, b.employee_id);
    const type = await loadType(client, b.leave_type_id);
    const r = { from_date: b.from_date, to_date: b.to_date, from_part: b.from_part || 'FULL', to_part: b.to_part || 'FULL' };
    try { Object.assign(r, normalizeParts(r)); } catch (e) { fail(400, e.message); }
    await assertOpen(client, monthsBetween(r.from_date, r.to_date)); // [HR-G5] trước khóa số dư (thứ tự khóa)
    // Q3: ca đêm chỉ nghỉ cả ca — đơn nửa buổi vào ngày đã gán ca đêm → 400
    if (r.from_part !== 'FULL' || r.to_part !== 'FULL') {
      const halfDays = [r.from_part !== 'FULL' ? r.from_date : null, r.to_part !== 'FULL' ? r.to_date : null].filter(Boolean);
      const { rows: night } = await client.query(`
        SELECT 1 FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
         WHERE a.employee_id = $1 AND a.work_date = ANY($2::date[]) AND s.overnight`, [b.employee_id, halfDays]);
      if (night.length) fail(400, 'Ngày làm ca đêm chỉ nghỉ được cả ca, không nghỉ nửa buổi');
    }
    const cal = await calendar(client, r.from_date, r.to_date);
    const days = countDays(r, cal);
    if (days <= 0) fail(400, 'Khoảng nghỉ không có ngày làm việc (toàn Chủ nhật / ngày lễ)');
    const byYear = daysByYear(r, cal);
    if (type.uses_balance) {
      await lockBalance(client, b.employee_id, type.id);
      for (const [year, need] of Object.entries(byYear)) {
        const bal = await balanceOf(client, b.employee_id, type, Number(year));
        const free = bal.remaining - bal.pending;
        if (need > free) {
          fail(400, `${type.name} năm ${year} chỉ còn ${Math.max(0, free)} ngày (đã tính cả đơn đang chờ) — có thể tạo đơn "Nghỉ không lương" cho phần vượt`);
        }
      }
    }
    const [lo, hi] = slotRange(r);
    const { rows: [x] } = await client.query(`
      INSERT INTO leave_requests (employee_id, leave_type_id, from_date, to_date, from_part, to_part, days, slots, reason, created_by, created_on_behalf, days_by_year)
      VALUES ($1, $2, $3, $4, $5, $6, $7, int4range($8, $9), $10, $11, true, $12) RETURNING id, status, days`,
    [b.employee_id, type.id, r.from_date, r.to_date, r.from_part, r.to_part, days, lo, hi, str(b.reason).slice(0, 500), req.user.id, JSON.stringify(byYear)]);
    await logHr(client, req, { action: 'create_leave', entity: 'leave_request', entityId: x.id, after: { employee_id: b.employee_id, ...r, days, type: type.code } });
    const { rows: [e] } = await client.query('SELECT name FROM employees WHERE id = $1', [b.employee_id]);
    await notify(client, (await managersOf(client, b.employee_id)).filter((u) => u !== req.user.id), {
      type: 'leave_pending', ref_id: x.id, title: `Đơn ${type.name} của ${e.name} chờ duyệt`,
      body: `${r.from_date}${r.to_date !== r.from_date ? ` → ${r.to_date}` : ''} · ${days} ngày`,
    });
    return { ...x, days: Number(x.days) };
  });
  if (out) res.status(201).json(out);
};

// ── Đính kèm ─────────────────────────────────────────────────────────────
exports.uploadAttachment = async (req, res) => {
  const { id } = req.params;
  const file = req.file;
  if (!isUuid(id)) return res.status(404).json({ message: 'Không tìm thấy đơn' });
  if (!file) return res.status(400).json({ message: 'Chọn tệp đính kèm' });
  const mime = photoStore.sniffDoc(file.buffer);
  if (!mime) return res.status(400).json({ message: 'Chỉ nhận ảnh (JPEG / PNG / WebP) hoặc PDF' });
  const key = `leave/${photoStore.makeKey(new Date(), mime)}`;
  let saved = false;
  const out = await tx(res, async (client) => {
    const { rows: [r] } = await client.query('SELECT id, employee_id, status FROM leave_requests WHERE id = $1 FOR UPDATE', [id]);
    if (!r) fail(404, 'Không tìm thấy đơn');
    await requireInScope(client, req, r.employee_id);
    if (!PENDING.includes(r.status)) fail(409, 'Chỉ bổ sung đính kèm khi đơn đang chờ duyệt');
    await photoStore.save(key, file.buffer, mime); saved = true;
    const { rows: [a] } = await client.query(`
      INSERT INTO leave_attachments (request_id, storage_key, mime, bytes, file_name, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, mime, bytes, file_name`,
    [id, key, mime, file.size, str(file.originalname).slice(0, 200) || null, req.user.id]);
    await logHr(client, req, { action: 'add_leave_attachment', entity: 'leave_request', entityId: id, after: { attachment_id: a.id, mime, bytes: file.size } });
    return a;
  });
  if (!out && saved) await photoStore.remove(key).catch(() => {});
  if (out) res.status(201).json(out);
};

exports.attachmentUrl = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ message: 'Không tìm thấy tệp' });
  const out = await tx(res, async (client) => {
    const { rows: [a] } = await client.query(
      'SELECT a.id, r.employee_id FROM leave_attachments a JOIN leave_requests r ON r.id = a.request_id WHERE a.id = $1', [id]);
    if (!a) fail(404, 'Không tìm thấy tệp');
    await requireInScope(client, req, a.employee_id);
    await logHr(client, req, { action: 'view_leave_attachment', entity: 'leave_attachment', entityId: id });
    const { exp, sig } = photoStore.signPhoto(id, 300, 'leave');
    return { url: `/api/hr/leave-attachments/raw/${id}?exp=${exp}&sig=${sig}`, expires_in: 300 };
  });
  if (out) res.json(out);
};

/** Public — chỉ cần chữ ký còn hạn */
exports.attachmentRaw = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id) || !photoStore.verifyPhoto(id, req.query.exp, req.query.sig, 'leave')) {
    return res.status(403).json({ message: 'Link xem tệp không hợp lệ hoặc đã hết hạn' });
  }
  const { rows: [a] } = await db.query('SELECT storage_key, mime, file_name FROM leave_attachments WHERE id = $1', [id]);
  if (!a) return res.status(404).json({ message: 'Không tìm thấy tệp' });
  const buf = await photoStore.read(a.storage_key);
  res.set({
    'Content-Type': a.mime, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff',
    // [Review G4 R10] sandbox: script trong PDF / ảnh không chạy với quyền của trang; mở ở tab riêng nên same-origin đủ
    'Content-Security-Policy': 'sandbox', 'Cross-Origin-Resource-Policy': 'same-origin', 'Content-Disposition': 'inline',
  });
  res.send(buf);
};

// ── Duyệt / từ chối / hủy ────────────────────────────────────────────────
async function lockReq(client, req, id) {
  if (!isUuid(id)) fail(404, 'Không tìm thấy đơn');
  const { rows: [r] } = await client.query(`
    SELECT r.*, to_char(r.from_date, 'YYYY-MM-DD') AS from_date, to_char(r.to_date, 'YYYY-MM-DD') AS to_date,
           t.name AS type_name, t.requires_attachment, t.requires_hr_approval, t.uses_balance, t.annual_days, t.id AS type_id
      FROM leave_requests r JOIN leave_types t ON t.id = r.leave_type_id WHERE r.id = $1 FOR UPDATE OF r`, [id]);
  if (!r) fail(404, 'Không tìm thấy đơn');
  await requireInScope(client, req, r.employee_id);
  return r;
}

async function recheckBalance(client, r) {
  if (!r.uses_balance) return;
  await lockBalance(client, r.employee_id, r.type_id);
  const byYear = r.days_by_year || daysByYear(r, await calendar(client, r.from_date, r.to_date));
  for (const [year, need] of Object.entries(byYear)) {
    const bal = await balanceOf(client, r.employee_id, { id: r.type_id, annual_days: r.annual_days }, Number(year), { excludeId: r.id });
    if (need > bal.remaining) fail(409, `${r.type_name} năm ${year} chỉ còn ${Math.max(0, bal.remaining)} ngày — không duyệt được`);
  }
}

exports.approve = async (req, res) => {
  let r;
  const out = await tx(res, async (client) => {
    r = await lockReq(client, req, req.params.id);
    if (r.status !== 'Chờ trưởng đơn vị') fail(409, `Đơn đang ở trạng thái "${r.status}"`);
    await forbidSelf(client, req, r);
    await assertOpen(client, monthsBetween(r.from_date, r.to_date)); // [HR-G5]
    if (r.requires_attachment) {
      const { rows } = await client.query('SELECT 1 FROM leave_attachments WHERE request_id = $1 LIMIT 1', [r.id]);
      if (!rows.length) fail(409, 'Loại nghỉ này cần giấy tờ đính kèm (vd giấy khám) — bổ sung rồi mới duyệt');
    }
    await recheckBalance(client, r);
    const next = r.requires_hr_approval ? 'Chờ nhân sự' : 'Đã duyệt';
    await client.query(`UPDATE leave_requests SET status = $1, approved_by = $2, approved_at = now() WHERE id = $3`, [next, req.user.id, r.id]);
    await logHr(client, req, { action: 'approve_leave', entity: 'leave_request', entityId: r.id, before: { status: r.status }, after: { status: next } });
    if (next === 'Đã duyệt') await enqueue(client, leaveDays(r));
    await notify(client, [r.created_by], {
      type: next === 'Đã duyệt' ? 'leave_approved' : 'leave_waiting_hr', ref_id: r.id,
      title: next === 'Đã duyệt' ? `Đơn ${r.type_name} đã được duyệt` : `Đơn ${r.type_name} chờ nhân sự duyệt cuối`,
    });
    return { id: r.id, status: next };
  });
  if (!out) return;
  if (out.status === 'Đã duyệt') await drainEmployees([r.employee_id]);
  res.json(out);
};

exports.hrApprove = async (req, res) => {
  if (!canManageAllUnits(req)) return res.status(403).json({ message: 'Chỉ nhân sự được duyệt cuối' });
  let r;
  const out = await tx(res, async (client) => {
    r = await lockReq(client, req, req.params.id);
    if (r.status !== 'Chờ nhân sự') fail(409, `Đơn đang ở trạng thái "${r.status}"`);
    await forbidSelf(client, req, r);
    if (r.approved_by === req.user.id) fail(403, 'Người đã duyệt cấp 1 không được duyệt cuối — cần nhân sự khác');
    await assertOpen(client, monthsBetween(r.from_date, r.to_date)); // [HR-G5]
    await recheckBalance(client, r);
    await client.query(`UPDATE leave_requests SET status = 'Đã duyệt', hr_approved_by = $1, hr_approved_at = now() WHERE id = $2`, [req.user.id, r.id]);
    await logHr(client, req, { action: 'hr_approve_leave', entity: 'leave_request', entityId: r.id });
    await enqueue(client, leaveDays(r));
    await notify(client, [r.created_by, r.approved_by], { type: 'leave_approved', ref_id: r.id, title: `Đơn ${r.type_name} đã được duyệt` });
    return { id: r.id, status: 'Đã duyệt' };
  });
  if (!out) return;
  await drainEmployees([r.employee_id]);
  res.json(out);
};

exports.reject = async (req, res) => {
  const reason = str(req.body?.reject_reason);
  if (!reason) return res.status(400).json({ message: 'Vui lòng nhập lý do từ chối' });
  const out = await tx(res, async (client) => {
    const r = await lockReq(client, req, req.params.id);
    if (!PENDING.includes(r.status)) fail(409, `Đơn đang ở trạng thái "${r.status}"`);
    if (r.status === 'Chờ nhân sự' && !canManageAllUnits(req)) fail(403, 'Đơn đang chờ nhân sự — chỉ nhân sự được từ chối');
    await forbidSelf(client, req, r);
    await client.query(`UPDATE leave_requests SET status = 'Từ chối', rejected_by = $1, reject_reason = $2 WHERE id = $3`, [req.user.id, reason.slice(0, 500), r.id]);
    await logHr(client, req, { action: 'reject_leave', entity: 'leave_request', entityId: r.id, after: { reason } });
    await notify(client, [r.created_by], { type: 'leave_rejected', ref_id: r.id, title: `Đơn ${r.type_name} bị từ chối`, body: reason });
    return { id: r.id, status: 'Từ chối' };
  });
  if (out) res.json(out);
};

exports.cancel = async (req, res) => {
  let r;
  const out = await tx(res, async (client) => {
    r = await lockReq(client, req, req.params.id);
    if (PENDING.includes(r.status)) {
      if (r.created_by !== req.user.id && !canManageAllUnits(req)) fail(403, 'Chỉ người tạo đơn (hoặc nhân sự) được hủy đơn đang chờ');
    } else if (r.status === 'Đã duyệt') {
      // Q5: chỉ nhân sự, chỉ trước ngày nghỉ
      if (!canManageAllUnits(req)) fail(403, 'Đơn đã duyệt — chỉ nhân sự được hủy');
      if (r.from_date <= vnDate(new Date())) fail(409, 'Ngày nghỉ đã bắt đầu / đã qua — điều chỉnh bằng sửa công, không hủy đơn');
    } else fail(409, `Đơn đang ở trạng thái "${r.status}"`);
    if (r.status === 'Đã duyệt') await assertOpen(client, monthsBetween(r.from_date, r.to_date)); // [HR-G5]
    await client.query(`UPDATE leave_requests SET status = 'Đã hủy', cancelled_by = $1, cancelled_at = now() WHERE id = $2`, [req.user.id, r.id]);
    await logHr(client, req, { action: 'cancel_leave', entity: 'leave_request', entityId: r.id, before: { status: r.status } });
    if (r.status === 'Đã duyệt') await enqueue(client, leaveDays(r));
    if (r.created_by !== req.user.id) await notify(client, [r.created_by], { type: 'leave_cancelled', ref_id: r.id, title: `Đơn ${r.type_name} đã bị hủy` });
    return { id: r.id, status: 'Đã hủy', wasApproved: r.status === 'Đã duyệt' };
  });
  if (!out) return;
  if (out.wasApproved) await drainEmployees([r.employee_id]);
  res.json({ id: out.id, status: out.status });
};

// ── Số dư ────────────────────────────────────────────────────────────────
exports.balances = wrap(async (req, res) => {
  // [Review G4 R3] Số truy vấn cố định, KHÔNG phụ thuộc số nhân viên: đọc nhân viên / loại / số dư / đơn / lịch mỗi thứ 1 lần
  const year = Number(req.query.year) || Number(vnDate(new Date()).slice(0, 4));
  const params = []; let empSql = '';
  if (isUuid(req.query.employee_id)) { params.push(req.query.employee_id); empSql = `AND e.id = $${params.length}`; }
  const sc = await hrScope(req, { col: 'e.org_unit_id', startIndex: params.length + 1 });
  const { rows: emps } = await db.query(`
    SELECT e.id, e.employee_code, e.name, u.name AS org_unit_name FROM employees e LEFT JOIN org_units u ON u.id = e.org_unit_id
     WHERE e.is_deleted = FALSE AND e.status = 'Hoạt động' ${empSql} AND ${sc.sql} ORDER BY u.name, e.name LIMIT 2000`, [...params, ...sc.params]);
  const { rows: types } = await db.query(`SELECT id, code, name, annual_days FROM leave_types WHERE uses_balance AND is_deleted = FALSE`);
  const ids = emps.map((e) => e.id);
  if (!ids.length || !types.length) return res.json({ year, data: [] });
  const { rows: bals } = await db.query(
    'SELECT employee_id, leave_type_id, entitled, adjusted FROM leave_balances WHERE year = $1 AND employee_id = ANY($2::uuid[])', [year, ids]);
  const { rows: reqs } = await db.query(`
    SELECT employee_id, leave_type_id, to_char(from_date, 'YYYY-MM-DD') from_date, to_char(to_date, 'YYYY-MM-DD') to_date,
           from_part, to_part, status, days_by_year
      FROM leave_requests WHERE employee_id = ANY($2::uuid[]) AND leave_type_id = ANY($3::uuid[])
       AND status IN ('Đã duyệt', 'Chờ trưởng đơn vị', 'Chờ nhân sự')
       AND from_date <= make_date($1, 12, 31) AND to_date >= make_date($1, 1, 1)`, [year, ids, types.map((t) => t.id)]);
  const cal = reqs.some((r) => !r.days_by_year) ? await calendar(db, `${year - 1}-12-01`, `${year + 1}-01-31`) : null;
  const key = (e, t) => `${e}|${t}`;
  const balOf = new Map(bals.map((x) => [key(x.employee_id, x.leave_type_id), x]));
  const agg = new Map();
  for (const r of reqs) {
    const n = r.days_by_year ? Number(r.days_by_year[year]) || 0 : daysByYear(r, cal)[year] || 0;
    const k = key(r.employee_id, r.leave_type_id);
    const cur = agg.get(k) || { used: 0, pending: 0 };
    if (r.status === 'Đã duyệt') cur.used += n; else cur.pending += n;
    agg.set(k, cur);
  }
  const data = [];
  for (const e of emps) {
    for (const t of types) {
      const bl = balOf.get(key(e.id, t.id));
      const entitled = bl ? Number(bl.entitled) : Number(t.annual_days);
      const adjusted = bl ? Number(bl.adjusted) : 0;
      const { used, pending } = agg.get(key(e.id, t.id)) || { used: 0, pending: 0 };
      data.push({ employee_id: e.id, employee_code: e.employee_code, employee_name: e.name, org_unit_name: e.org_unit_name,
        leave_type_id: t.id, leave_type_name: t.name, year, entitled, adjusted, used, pending, remaining: entitled + adjusted - used });
    }
  }
  res.json({ year, data });
});

exports.adjustBalance = async (req, res) => {
  if (!canManageAllUnits(req)) return res.status(403).json({ message: 'Chỉ nhân sự được chỉnh số dư phép' });
  const { employeeId, year, leaveTypeId } = req.params;
  const adjusted = Number(req.body?.adjusted);
  const reason = str(req.body?.reason);
  if (!isUuid(employeeId) || !isUuid(leaveTypeId) || !/^\d{4}$/.test(year)) return res.status(404).json({ message: 'Không tìm thấy' });
  if (!Number.isFinite(adjusted) || Math.round(adjusted * 2) !== adjusted * 2 || Math.abs(adjusted) > 366) {
    return res.status(400).json({ message: 'Số ngày chỉnh phải là bội số 0,5' });
  }
  if (!reason) return res.status(400).json({ message: 'Vui lòng nhập lý do chỉnh số dư' });
  const out = await tx(res, async (client) => {
    await requireInScope(client, req, employeeId);
    const type = await loadType(client, leaveTypeId);
    const { rows: [cur] } = await client.query(
      'SELECT entitled, adjusted FROM leave_balances WHERE employee_id = $1 AND year = $2 AND leave_type_id = $3 FOR UPDATE', [employeeId, year, leaveTypeId]);
    await client.query(`
      INSERT INTO leave_balances (employee_id, year, leave_type_id, entitled, adjusted, adjust_reason, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (employee_id, year, leave_type_id) DO UPDATE SET adjusted = EXCLUDED.adjusted, adjust_reason = EXCLUDED.adjust_reason,
             updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [employeeId, year, leaveTypeId, cur ? cur.entitled : type.annual_days, adjusted, reason.slice(0, 300), req.user.id]);
    await logHr(client, req, { action: 'adjust_leave_balance', entity: 'employee', entityId: employeeId,
      before: cur || null, after: { year, leave_type: type.code, adjusted, reason } });
    return { employee_id: employeeId, year: Number(year), leave_type_id: leaveTypeId, adjusted };
  });
  if (out) res.json(out);
};

// ── Thông báo (mọi tài khoản đã đăng nhập, chỉ của chính mình) ───────────
exports.notifications = async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, type, title, body, ref_type, ref_id, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user.id]);
  const { rows: [{ n }] } = await db.query('SELECT count(*)::int n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
  res.json({ unread: n, data: rows });
};
exports.readNotification = async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ message: 'Không tìm thấy' });
  const { rowCount } = await db.query('UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rowCount) return res.status(404).json({ message: 'Không tìm thấy' });
  res.json({ ok: true });
};
exports.readAllNotifications = async (req, res) => {
  await db.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
  res.json({ ok: true });
};

