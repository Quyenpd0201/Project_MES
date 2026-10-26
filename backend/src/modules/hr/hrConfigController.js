// [HR-G1] Module Chấm công — 2026-10-22, CHƯA PHÁT HÀNH (file mới)
// Cấu hình Chấm công & Nghỉ phép: đơn vị/tổ, trưởng đơn vị, ca + khung nghỉ, loại nghỉ, ngày lễ, PIN nhân viên.
// Mọi thao tác ghi: 1 transaction + ghi hr_audit_logs. Lọc nhân viên theo phạm vi qua hrScope.
const crypto = require('crypto');
const db = require('../../core/db');
const { hashPassword } = require('../auth/authController');
const { hrScope, isEmployeeInScope, UUID_RE } = require('../../core/lib/hrScope');
const { logHr } = require('../../core/lib/hrAudit');
const { isTime } = require('../../core/lib/validate');
const { canManageAllUnits } = require('../../core/lib/hrScope');
const { hasAppPerm } = require('../../core/requireAuth');
const { assertOpen, PeriodClosedError } = require('../../core/lib/periodLock'); // [HR-G5] chặn đổi ngày lễ tháng đã chốt

// [HR-G3] Đổi ngày lễ / sửa ca → xếp hàng tính lại TRONG transaction (worker nền tính, không mất khi lỗi)
async function enqueueHoliday(client, date) {
  await client.query(`
    INSERT INTO attendance_recalc_queue (employee_id, work_date)
    SELECT id, $1::date FROM employees WHERE is_deleted = FALSE AND status = 'Hoạt động'
    ON CONFLICT (employee_id, work_date) DO UPDATE SET queued_at = now()`, [date]);
}
async function enqueueShiftDays(client, shiftId) {
  await client.query(`
    INSERT INTO attendance_recalc_queue (employee_id, work_date)
    SELECT employee_id, work_date FROM attendance_days
     WHERE shift_id = $1 AND NOT locked AND work_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 62
    ON CONFLICT (employee_id, work_date) DO UPDATE SET queued_at = now()`, [shiftId]);
}

const UNIT_KINDS = ['XUONG', 'PHONG', 'TO'];
const PIN_LENGTH = 6;

class BadRequest extends Error {}
const bad = (msg) => { throw new BadRequest(msg); };

// Thông báo khi vi phạm UNIQUE — theo tên ràng buộc để đúng ngữ cảnh
const UNIQUE_MESSAGES = {
  org_units_code_key: 'Mã đơn vị đã tồn tại, vui lòng chọn mã khác.',
  shifts_shift_code_key: 'Mã ca đã tồn tại, vui lòng chọn mã khác.',
  leave_types_code_key: 'Mã loại nghỉ đã tồn tại, vui lòng chọn mã khác.',
  holidays_date_key: 'Ngày này đã có trong danh sách ngày lễ.',
  shift_breaks_shift_start_uq: 'Có hai khung nghỉ cùng giờ bắt đầu.',
};

/** Sửa cấu trúc cây đơn vị / gán quản lý: chỉ admin hoặc người xem được mọi đơn vị (nhân sự).
 *  Trưởng tổ có hr_config:edit KHÔNG được — nếu không sẽ tự mở rộng phạm vi của mình. */
const canManageTree = canManageAllUnits;
const forbidTree = (res) => res.status(403).json({ message: 'Chỉ nhân sự (quyền xem mọi đơn vị) mới được sửa cơ cấu đơn vị và người quản lý.' });

/** Chạy fn(client) trong transaction; BadRequest / lỗi dữ liệu (22xxx, 23xxx) → 400. */
async function inTx(res, fn) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof BadRequest) { res.status(400).json({ message: err.message }); return undefined; }
    if (err instanceof PeriodClosedError) { res.status(409).json({ message: err.message }); return undefined; } // [HR-G5]
    if (err.code === '23505') {
      res.status(400).json({ message: UNIQUE_MESSAGES[err.constraint] || 'Dữ liệu bị trùng, vui lòng kiểm tra lại.' });
      return undefined;
    }
    if (/^2[23]/.test(String(err.code || ''))) { res.status(400).json({ message: 'Dữ liệu không hợp lệ.' }); return undefined; }
    throw err;
  } finally {
    client.release();
  }
}
const send = (res, status, body) => { if (body !== undefined && !res.headersSent) res.status(status).json(body); };

const isUuid = (v) => UUID_RE.test(String(v || ''));
const str = (v) => (v == null ? '' : String(v).trim());

// ── Đơn vị / tổ ──────────────────────────────────────────────────────────
exports.listOrgUnits = async (req, res) => {
  if (!canManageAllUnits(req) && !hasAppPerm(req, 'hr_config', 'view')) {
    const sc = await hrScope(req, { col: 'u.id', startIndex: 1 });
    const { rows } = await db.query(`
      SELECT u.id, u.code, u.name, u.kind, u.parent_id, u.status FROM org_units u
       WHERE u.is_deleted = FALSE AND ${sc.sql} ORDER BY u.parent_id NULLS FIRST, u.code`, sc.params);
    return res.json(rows);
  }
  const { rows } = await db.query(`
    SELECT u.id, u.code, u.name, u.kind, u.parent_id, u.status,
           (SELECT count(*)::int FROM employees e WHERE e.org_unit_id = u.id AND e.is_deleted = FALSE) AS employee_count,
           COALESCE((SELECT json_agg(json_build_object('id', us.id, 'name', COALESCE(us.full_name, us.username)) ORDER BY us.username)
                       FROM org_unit_managers m JOIN users us ON us.id = m.user_id WHERE m.org_unit_id = u.id), '[]') AS managers
      FROM org_units u
     WHERE u.is_deleted = FALSE
     ORDER BY u.parent_id NULLS FIRST, u.code`);
  res.json(rows);
};

async function checkParent(client, id, parentId, kind) {
  // Mọi thao tác đổi cây chạy tuần tự → 2 request song song không tạo được vòng lặp A↔B
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('org_units_tree'))`);
  if (kind === 'TO' && !parentId) bad('Tổ phải thuộc một xưởng/phòng.');
  if (id && kind === 'TO') {
    const { rows } = await client.query('SELECT 1 FROM org_units WHERE parent_id = $1 AND is_deleted = FALSE LIMIT 1', [id]);
    if (rows.length) bad('Đơn vị đang có đơn vị con, không thể đổi thành Tổ.');
  }
  if (!parentId) return;
  if (!isUuid(parentId)) bad('Đơn vị cha không hợp lệ.');
  const { rows: [p] } = await client.query('SELECT kind, status FROM org_units WHERE id = $1 AND is_deleted = FALSE', [parentId]);
  if (!p) bad('Đơn vị cha không tồn tại.');
  if (p.kind === 'TO') bad('Đơn vị cha phải là xưởng hoặc phòng, không phải tổ.');
  if (p.status !== 'Hoạt động') bad('Đơn vị cha đang ngừng hoạt động.');
  if (id) {
    // Cha mới không được nằm trong cây con của chính nó (chống vòng lặp)
    const { rows } = await client.query(`
      WITH RECURSIVE sub AS (SELECT $1::uuid AS id UNION SELECT c.id FROM org_units c JOIN sub ON c.parent_id = sub.id)
      SELECT 1 FROM sub WHERE id = $2`, [id, parentId]);
    if (rows.length) bad('Không thể đặt đơn vị cha là chính nó hoặc đơn vị con của nó.');
  }
}

exports.createOrgUnit = async (req, res) => {
  if (!canManageTree(req)) return forbidTree(res);
  const b = req.body || {};
  const code = str(b.code).toUpperCase(); const name = str(b.name); const kind = str(b.kind).toUpperCase();
  const out = await inTx(res, async (client) => {
    if (!code || !name) bad('Vui lòng nhập mã và tên đơn vị.');
    if (!UNIT_KINDS.includes(kind)) bad('Loại đơn vị phải là Xưởng, Phòng hoặc Tổ.');
    const parentId = b.parent_id || null;
    await checkParent(client, null, parentId, kind);
    const { rows: [u] } = await client.query(
      `INSERT INTO org_units (code, name, kind, parent_id) VALUES ($1, $2, $3, $4) RETURNING *`, [code, name, kind, parentId]);
    await logHr(client, req, { action: 'create', entity: 'org_unit', entityId: u.id, after: u });
    return u;
  });
  send(res, 201, out);
};

exports.updateOrgUnit = async (req, res) => {
  if (!canManageTree(req)) return forbidTree(res);
  const { id } = req.params; const b = req.body || {};
  if (!isUuid(id)) return res.status(404).json({ message: 'Không tìm thấy đơn vị' });
  const out = await inTx(res, async (client) => {
    const { rows: [cur] } = await client.query('SELECT * FROM org_units WHERE id = $1 AND is_deleted = FALSE FOR UPDATE', [id]);
    if (!cur) { res.status(404).json({ message: 'Không tìm thấy đơn vị' }); return undefined; }
    const next = {
      name: b.name !== undefined ? str(b.name) : cur.name,
      kind: b.kind !== undefined ? str(b.kind).toUpperCase() : cur.kind,
      parent_id: b.parent_id !== undefined ? (b.parent_id || null) : cur.parent_id,
      status: b.status !== undefined ? str(b.status) : cur.status,
    };
    if (!next.name) bad('Vui lòng nhập tên đơn vị.');
    if (!UNIT_KINDS.includes(next.kind)) bad('Loại đơn vị phải là Xưởng, Phòng hoặc Tổ.');
    await checkParent(client, id, next.parent_id, next.kind);
    const { rows: [u] } = await client.query(
      `UPDATE org_units SET name = $1, kind = $2, parent_id = $3, status = $4, updated_at = now() WHERE id = $5 RETURNING *`,
      [next.name, next.kind, next.parent_id, next.status, id]);
    await logHr(client, req, { action: 'update', entity: 'org_unit', entityId: id, before: cur, after: u });
    return u;
  });
  send(res, 200, out);
};

exports.setOrgUnitManagers = async (req, res) => {
  if (!canManageTree(req)) return forbidTree(res);
  const { id } = req.params;
  const userIds = Array.isArray(req.body?.user_ids) ? [...new Set(req.body.user_ids)] : null;
  if (!isUuid(id)) return res.status(404).json({ message: 'Không tìm thấy đơn vị' });
  const out = await inTx(res, async (client) => {
    if (!userIds || userIds.some((u) => !isUuid(u))) bad('Danh sách người quản lý không hợp lệ.');
    const { rows: [unit] } = await client.query('SELECT id FROM org_units WHERE id = $1 AND is_deleted = FALSE FOR UPDATE', [id]);
    if (!unit) { res.status(404).json({ message: 'Không tìm thấy đơn vị' }); return undefined; }
    const { rows: found } = await client.query('SELECT id FROM users WHERE id = ANY($1) AND is_deleted = FALSE', [userIds]);
    if (found.length !== userIds.length) bad('Có tài khoản không tồn tại hoặc đã bị xóa.');
    const before = (await client.query('SELECT user_id FROM org_unit_managers WHERE org_unit_id = $1', [id])).rows.map((r) => r.user_id);
    await client.query('DELETE FROM org_unit_managers WHERE org_unit_id = $1', [id]);
    if (userIds.length) {
      await client.query(
        'INSERT INTO org_unit_managers (user_id, org_unit_id) SELECT unnest($1::uuid[]), $2', [userIds, id]);
    }
    await logHr(client, req, { action: 'set_managers', entity: 'org_unit', entityId: id, before: { user_ids: before }, after: { user_ids: userIds } });
    return { org_unit_id: id, user_ids: userIds };
  });
  send(res, 200, out);
};

/** Tài khoản có thể gán làm quản lý — chỉ id/tên, không cần quyền quản trị tài khoản. */
exports.listAssignableUsers = async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, username, COALESCE(full_name, username) AS name FROM users
      WHERE is_deleted = FALSE AND status = 'Hoạt động' ORDER BY COALESCE(full_name, username)`);
  res.json(rows);
};

// ── Ca làm + khung nghỉ ──────────────────────────────────────────────────
const SHIFT_INT_COLS = { required_minutes: [1, 1440], late_grace_min: [0, 240], early_grace_min: [0, 240], rounding_min: [1, 60] };
const SHIFT_BOOL_COLS = ['overnight', 'ot_enabled', 'ot_requires_approval'];
const SHIFT_TIME_COLS = ['start_time', 'end_time', 'auto_detect_from', 'auto_detect_to'];

const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };

/** Kiểm + chuẩn hóa dữ liệu ca. cur = bản ghi hiện tại (khi sửa) để kiểm tổ hợp start/end/overnight. */
function normalizeShift(b, cur = {}) {
  const v = {};
  if (b.name !== undefined) { v.name = str(b.name); if (!v.name) bad('Vui lòng nhập tên ca.'); }
  for (const c of SHIFT_TIME_COLS) {
    if (b[c] === undefined) continue;
    if (b[c] === null || b[c] === '') { if (c.startsWith('auto_')) { v[c] = null; continue; } bad('Vui lòng nhập giờ bắt đầu và kết thúc ca.'); }
    if (!isTime(b[c])) bad('Giờ không hợp lệ (định dạng HH:MM, 00:00–23:59).');
    v[c] = b[c];
  }
  for (const [c, [min, max]] of Object.entries(SHIFT_INT_COLS)) {
    if (b[c] === undefined) continue;
    const n = Number(b[c]);
    if (!Number.isInteger(n) || n < min || n > max) bad(`Giá trị "${c}" phải là số nguyên từ ${min} đến ${max}.`);
    v[c] = n;
  }
  for (const c of SHIFT_BOOL_COLS) if (b[c] !== undefined) v[c] = b[c] === true || b[c] === 'true';
  const from = v.auto_detect_from !== undefined ? v.auto_detect_from : cur.auto_detect_from ?? null;
  const to = v.auto_detect_to !== undefined ? v.auto_detect_to : cur.auto_detect_to ?? null;
  if ((from == null) !== (to == null)) bad('Tự nhận ca: nhập đủ cả giờ "từ" và "đến", hoặc để trống cả hai.');
  const start = v.start_time ?? cur.start_time; const end = v.end_time ?? cur.end_time;
  const overnight = v.overnight ?? cur.overnight ?? false;
  if (start && end) {
    if (toMin(start) === toMin(end)) bad('Giờ bắt đầu và kết thúc ca không được trùng nhau.');
    if (!overnight && toMin(end) < toMin(start)) bad('Giờ kết thúc trước giờ bắt đầu — nếu là ca qua đêm hãy bật "Ca qua đêm".');
    if (overnight && toMin(end) > toMin(start)) bad('Ca qua đêm phải kết thúc vào sáng hôm sau (giờ kết thúc nhỏ hơn giờ bắt đầu).');
  }
  return v;
}

function normalizeBreaks(breaks) {
  if (breaks === undefined) return undefined;
  if (!Array.isArray(breaks) || breaks.length > 5) bad('Khung nghỉ không hợp lệ (tối đa 5 khung).');
  const list = breaks.map((x) => {
    if (!isTime(x?.start_time) || !isTime(x?.end_time)) bad('Giờ nghỉ không hợp lệ (định dạng HH:MM).');
    if (toMin(x.start_time) === toMin(x.end_time)) bad('Khung nghỉ phải có giờ bắt đầu khác giờ kết thúc.');
    return [x.start_time, x.end_time];
  });
  // Chống chồng lấn (kể cả khung qua nửa đêm): tách thành đoạn phút trên trục 0–1440 rồi so từng cặp
  const segs = (s, e) => (toMin(e) > toMin(s) ? [[toMin(s), toMin(e)]] : [[toMin(s), 1440], [0, toMin(e)]]);
  const all = list.flatMap(([s, e], i) => segs(s, e).map((g) => [...g, i]));
  for (const a of all) {
    for (const b of all) {
      if (a[2] < b[2] && a[0] < b[1] && b[0] < a[1]) bad('Các khung nghỉ bị chồng lên nhau, vui lòng kiểm tra lại.');
    }
  }
  return list;
}

const SHIFT_SELECT = `
  SELECT s.*, COALESCE((SELECT json_agg(json_build_object('id', b.id, 'start_time', b.start_time, 'end_time', b.end_time)
                                         ORDER BY b.start_time) FROM shift_breaks b WHERE b.shift_id = s.id), '[]') AS breaks
    FROM shifts s`;

async function replaceBreaks(client, shiftId, list) {
  await client.query('DELETE FROM shift_breaks WHERE shift_id = $1', [shiftId]);
  for (const [s, e] of list) {
    await client.query('INSERT INTO shift_breaks (shift_id, start_time, end_time) VALUES ($1, $2, $3)', [shiftId, s, e]);
  }
}

exports.listShifts = async (req, res) => {
  const { rows } = await db.query(`${SHIFT_SELECT} WHERE s.is_deleted = FALSE ORDER BY s.shift_code`);
  res.json(rows);
};

exports.createShift = async (req, res) => {
  const b = req.body || {};
  const out = await inTx(res, async (client) => {
    const code = str(b.shift_code).toUpperCase();
    if (!code) bad('Vui lòng nhập mã ca.');
    if (b.name === undefined) bad('Vui lòng nhập tên ca.');
    if (!b.start_time || !b.end_time) bad('Vui lòng nhập giờ bắt đầu và kết thúc ca.');
    const v = normalizeShift(b);
    const breaks = normalizeBreaks(b.breaks) || [];
    const cols = ['shift_code', ...Object.keys(v)];
    const vals = [code, ...Object.values(v)];
    const { rows: [s] } = await client.query(
      `INSERT INTO shifts (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, vals);
    await replaceBreaks(client, s.id, breaks);
    const { rows: [full] } = await client.query(`${SHIFT_SELECT} WHERE s.id = $1`, [s.id]);
    await logHr(client, req, { action: 'create', entity: 'shift', entityId: s.id, after: full });
    return full;
  });
  send(res, 201, out);
};

exports.updateShift = async (req, res) => {
  const { id } = req.params; const b = req.body || {};
  if (!isUuid(id)) return res.status(404).json({ message: 'Không tìm thấy ca' });
  const out = await inTx(res, async (client) => {
    const { rows: [cur] } = await client.query(`${SHIFT_SELECT} WHERE s.id = $1 AND s.is_deleted = FALSE FOR UPDATE OF s`, [id]);
    if (!cur) { res.status(404).json({ message: 'Không tìm thấy ca' }); return undefined; }
    const v = normalizeShift(b, cur);
    const breaks = normalizeBreaks(b.breaks);
    if (!Object.keys(v).length && breaks === undefined) bad('Không có trường nào để cập nhật.');
    if (Object.keys(v).length) {
      const cols = Object.keys(v);
      await client.query(
        `UPDATE shifts SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${cols.length + 1}`,
        [...Object.values(v), id]);
    }
    if (breaks !== undefined) await replaceBreaks(client, id, breaks);
    const { rows: [full] } = await client.query(`${SHIFT_SELECT} WHERE s.id = $1`, [id]);
    await logHr(client, req, { action: 'update', entity: 'shift', entityId: id, before: cur, after: full });
    await enqueueShiftDays(client, id); // [HR-G3] C11: ngày công đã tính theo ca này cần tính lại
    return full;
  });
  send(res, 200, out);
};

// ── Loại nghỉ ────────────────────────────────────────────────────────────
const LT_BOOL = ['paid', 'uses_balance', 'requires_attachment', 'requires_hr_approval'];

function normalizeLeaveType(b) {
  const v = {};
  if (b.name !== undefined) { v.name = str(b.name); if (!v.name) bad('Vui lòng nhập tên loại nghỉ.'); }
  for (const c of LT_BOOL) if (b[c] !== undefined) v[c] = b[c] === true || b[c] === 'true';
  if (b.annual_days !== undefined) {
    const n = Number(b.annual_days);
    if (!Number.isFinite(n) || n < 0 || n > 366 || Math.round(n * 2) !== n * 2) bad('Số ngày/năm phải từ 0 đến 366, bước 0,5.');
    v.annual_days = n;
  }
  if (b.status !== undefined) v.status = str(b.status);
  return v;
}

exports.listLeaveTypes = async (req, res) => {
  const { rows } = await db.query('SELECT * FROM leave_types WHERE is_deleted = FALSE ORDER BY code');
  res.json(rows);
};

exports.createLeaveType = async (req, res) => {
  const b = req.body || {};
  const out = await inTx(res, async (client) => {
    const code = str(b.code).toUpperCase();
    if (!code || b.name === undefined) bad('Vui lòng nhập mã và tên loại nghỉ.');
    const v = normalizeLeaveType(b);
    const cols = ['code', ...Object.keys(v)];
    const { rows: [t] } = await client.query(
      `INSERT INTO leave_types (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      [code, ...Object.values(v)]);
    await logHr(client, req, { action: 'create', entity: 'leave_type', entityId: t.id, after: t });
    return t;
  });
  send(res, 201, out);
};

exports.updateLeaveType = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ message: 'Không tìm thấy loại nghỉ' });
  const out = await inTx(res, async (client) => {
    const { rows: [cur] } = await client.query('SELECT * FROM leave_types WHERE id = $1 AND is_deleted = FALSE FOR UPDATE', [id]);
    if (!cur) { res.status(404).json({ message: 'Không tìm thấy loại nghỉ' }); return undefined; }
    const v = normalizeLeaveType(req.body || {});
    if (!Object.keys(v).length) bad('Không có trường nào để cập nhật.');
    const cols = Object.keys(v);
    const { rows: [t] } = await client.query(
      `UPDATE leave_types SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${cols.length + 1} RETURNING *`,
      [...Object.values(v), id]);
    await logHr(client, req, { action: 'update', entity: 'leave_type', entityId: id, before: cur, after: t });
    return t;
  });
  send(res, 200, out);
};

// ── Ngày lễ ──────────────────────────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

exports.listHolidays = async (req, res) => {
  const year = Number(req.query.year);
  const { rows } = Number.isInteger(year)
    ? await db.query(`SELECT id, to_char(date, 'YYYY-MM-DD') AS date, name FROM holidays
                       WHERE date >= make_date($1, 1, 1) AND date < make_date($1 + 1, 1, 1) ORDER BY date`, [year])
    : await db.query(`SELECT id, to_char(date, 'YYYY-MM-DD') AS date, name FROM holidays ORDER BY date DESC LIMIT 200`);
  res.json(rows);
};

exports.createHoliday = async (req, res) => {
  const b = req.body || {};
  const out = await inTx(res, async (client) => {
    if (!DATE_RE.test(str(b.date)) || !str(b.name)) bad('Vui lòng nhập ngày (YYYY-MM-DD) và tên ngày lễ.');
    await assertOpen(client, [b.date]); // [HR-G5]
    // ON CONFLICT thay cho SELECT-rồi-INSERT → 2 request cùng ngày gửi đồng thời vẫn báo đúng
    const { rows: [h] } = await client.query(
      `INSERT INTO holidays (date, name) VALUES ($1, $2) ON CONFLICT (date) DO NOTHING
       RETURNING id, to_char(date, 'YYYY-MM-DD') AS date, name`, [b.date, str(b.name)]);
    if (!h) bad('Ngày này đã có trong danh sách ngày lễ.');
    await logHr(client, req, { action: 'create', entity: 'holiday', entityId: h.id, after: h });
    await enqueueHoliday(client, h.date); // [HR-G3]
    return h;
  });
  send(res, 201, out);
};

exports.deleteHoliday = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ message: 'Không tìm thấy ngày lễ' });
  const out = await inTx(res, async (client) => {
    const { rows: [h] } = await client.query(
      `DELETE FROM holidays WHERE id = $1 RETURNING id, to_char(date, 'YYYY-MM-DD') AS date, name`, [id]);
    if (!h) { res.status(404).json({ message: 'Không tìm thấy ngày lễ' }); return undefined; }
    await assertOpen(client, [h.date]); // [HR-G5] (lỗi → ROLLBACK, ngày lễ không bị xóa)
    await logHr(client, req, { action: 'delete', entity: 'holiday', entityId: id, before: h });
    await enqueueHoliday(client, h.date); // [HR-G3]
    return { message: 'Đã xóa', date: h.date };
  });
  send(res, 200, out);
};

// ── Nhân viên: đơn vị + PIN ──────────────────────────────────────────────
exports.listEmployees = async (req, res) => {
  const sc = await hrScope(req, { col: 'e.org_unit_id', startIndex: 1 });
  const { rows } = await db.query(`
    SELECT e.id, e.employee_code, e.name, e.status, e.org_unit_id, u.name AS org_unit_name,
           (e.pin_hash IS NOT NULL) AS has_pin,
           (e.pin_locked_until IS NOT NULL AND e.pin_locked_until > now()) AS pin_locked,
           e.face_consent_at
      FROM employees e LEFT JOIN org_units u ON u.id = e.org_unit_id
     WHERE e.is_deleted = FALSE AND ${sc.sql}
     ORDER BY u.name NULLS LAST, e.name`, sc.params);
  res.json(rows);
};

/** 404 nếu nhân viên ngoài phạm vi (không để lộ việc bản ghi tồn tại). */
async function requireEmployeeInScope(client, req, res, id) {
  if (await isEmployeeInScope(client, req, id)) return true;
  res.status(404).json({ message: 'Không tìm thấy nhân viên' });
  return false;
}

exports.resetPin = async (req, res) => {
  const { id } = req.params;
  const out = await inTx(res, async (client) => {
    if (!(await requireEmployeeInScope(client, req, res, id))) return undefined;
    const pin = String(crypto.randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, '0');
    await client.query(
      `UPDATE employees SET pin_hash = $1, pin_failed_count = 0, pin_locked_until = NULL, updated_at = now() WHERE id = $2`,
      [hashPassword(pin), id]);
    await logHr(client, req, { action: 'reset_pin', entity: 'employee', entityId: id });
    return { pin }; // Trả 1 lần duy nhất để in/đưa cho công nhân — không lưu ở đâu khác
  });
  send(res, 200, out);
};

exports.unlockPin = async (req, res) => {
  const { id } = req.params;
  const out = await inTx(res, async (client) => {
    if (!(await requireEmployeeInScope(client, req, res, id))) return undefined;
    await client.query(`UPDATE employees SET pin_failed_count = 0, pin_locked_until = NULL, updated_at = now() WHERE id = $1`, [id]);
    await logHr(client, req, { action: 'unlock_pin', entity: 'employee', entityId: id });
    return { message: 'Đã mở khóa PIN' };
  });
  send(res, 200, out);
};

exports.moveEmployeeUnit = async (req, res) => {
  const { id } = req.params; const unitId = req.body?.org_unit_id;
  const out = await inTx(res, async (client) => {
    if (!(await requireEmployeeInScope(client, req, res, id))) return undefined;
    if (!isUuid(unitId)) bad('Vui lòng chọn tổ/đơn vị.');
    // Tổ đích cũng phải nằm trong phạm vi người thao tác (không đẩy nhân viên sang đơn vị người khác quản lý)
    const sc = await hrScope(req, { col: 'u.id', startIndex: 2, conn: client });
    const { rows: [u] } = await client.query(
      `SELECT u.status FROM org_units u WHERE u.id = $1 AND u.is_deleted = FALSE AND ${sc.sql}`, [unitId, ...sc.params]);
    if (!u) bad('Tổ/đơn vị không tồn tại hoặc nằm ngoài phạm vi bạn quản lý.');
    if (u.status !== 'Hoạt động') bad('Tổ/đơn vị đang ngừng hoạt động.');
    const { rows: [cur] } = await client.query('SELECT org_unit_id FROM employees WHERE id = $1 FOR UPDATE', [id]);
    await client.query('UPDATE employees SET org_unit_id = $1, updated_at = now() WHERE id = $2', [unitId, id]);
    await logHr(client, req, { action: 'move_unit', entity: 'employee', entityId: id, before: cur, after: { org_unit_id: unitId } });
    return { id, org_unit_id: unitId };
  });
  send(res, 200, out);
};
