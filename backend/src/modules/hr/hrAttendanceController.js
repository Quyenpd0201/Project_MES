// [HR-G2] Kiosk chấm công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// Quản lý: duyệt / thu hồi tablet, danh sách lần chấm, xem ảnh (link ký có hạn + ghi log).
const db = require('../../core/db');
const { hrScope, canManageAllUnits, UUID_RE } = require('../../core/lib/hrScope');
const { logHr } = require('../../core/lib/hrAudit');
const photoStore = require('../../core/lib/photoStore');

const PHOTO_URL_TTL_S = 300;
const isUuid = (v) => UUID_RE.test(String(v || ''));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const forbid = (res) => res.status(403).json({ message: 'Chỉ nhân sự (quyền xem mọi đơn vị) mới được duyệt / thu hồi tablet.' });

async function tx(fn) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
}

// ── Tablet ───────────────────────────────────────────────────────────────
exports.listDevices = async (req, res) => {
  const { rows } = await db.query(`
    SELECT d.id, d.name, d.status, d.org_unit_id, u.name AS org_unit_name, d.register_code,
           (d.status = 'Chờ duyệt' AND d.register_expires_at < now()) AS expired,
           d.approved_at, d.last_seen_at, d.clock_skew_ms, (d.token_hash IS NOT NULL) AS has_token, d.created_at
      FROM kiosk_devices d LEFT JOIN org_units u ON u.id = d.org_unit_id
     WHERE d.status <> 'Chờ duyệt' OR d.register_expires_at > now() - interval '1 day'
     ORDER BY d.status, d.created_at DESC`);
  res.json(rows);
};

async function checkUnit(client, unitId) {
  if (!isUuid(unitId)) return 'Vui lòng chọn xưởng / đơn vị cho tablet.';
  const { rows: [u] } = await client.query(`SELECT status FROM org_units WHERE id = $1 AND is_deleted = FALSE`, [unitId]);
  if (!u) return 'Đơn vị không tồn tại.';
  return u.status === 'Hoạt động' ? null : 'Đơn vị đang ngừng hoạt động.';
}

exports.approveDevice = async (req, res) => {
  if (!canManageAllUnits(req)) return forbid(res);
  const code = String(req.body?.code || '').trim().toUpperCase();
  const { org_unit_id: unitId } = req.body || {};
  const name = String(req.body?.name || '').trim().slice(0, 100);
  const out = await tx(async (client) => {
    const bad = await checkUnit(client, unitId);
    if (bad) return { status: 400, body: { message: bad } };
    const { rows: [d] } = await client.query(
      `SELECT * FROM kiosk_devices WHERE register_code = $1 AND status = 'Chờ duyệt' AND register_expires_at > now() FOR UPDATE`, [code]);
    if (!d) return { status: 404, body: { message: 'Mã đăng ký không đúng hoặc đã hết hạn — trên tablet bấm "Lấy mã mới"' } };
    const { rows: [u] } = await client.query(
      `UPDATE kiosk_devices SET status = 'Hoạt động', org_unit_id = $1, name = COALESCE(NULLIF($2, ''), name),
              approved_by = $3, approved_at = now(), register_code = NULL
        WHERE id = $4 RETURNING id, name, org_unit_id, status`, [unitId, name, req.user.id, d.id]);
    await logHr(client, req, { action: 'approve_device', entity: 'kiosk_device', entityId: d.id, after: u });
    return { status: 200, body: u };
  });
  res.status(out.status).json(out.body);
};

exports.updateDevice = async (req, res) => {
  if (!canManageAllUnits(req)) return forbid(res);
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ message: 'Không tìm thấy tablet' });
  const out = await tx(async (client) => {
    const { rows: [cur] } = await client.query('SELECT id, name, org_unit_id, status FROM kiosk_devices WHERE id = $1 FOR UPDATE', [id]);
    if (!cur) return { status: 404, body: { message: 'Không tìm thấy tablet' } };
    const unitId = req.body?.org_unit_id !== undefined ? req.body.org_unit_id : cur.org_unit_id;
    if (req.body?.org_unit_id !== undefined) {
      const bad = await checkUnit(client, unitId);
      if (bad) return { status: 400, body: { message: bad } };
    }
    const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 100) : cur.name;
    const { rows: [u] } = await client.query(
      'UPDATE kiosk_devices SET name = $1, org_unit_id = $2 WHERE id = $3 RETURNING id, name, org_unit_id, status', [name, unitId, id]);
    await logHr(client, req, { action: 'update_device', entity: 'kiosk_device', entityId: id, before: cur, after: u });
    return { status: 200, body: u };
  });
  res.status(out.status).json(out.body);
};

exports.revokeDevice = async (req, res) => {
  if (!canManageAllUnits(req)) return forbid(res);
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ message: 'Không tìm thấy tablet' });
  const out = await tx(async (client) => {
    const { rows: [u] } = await client.query(
      `UPDATE kiosk_devices SET status = 'Thu hồi', token_hash = NULL, claim_hash = NULL, register_code = NULL
        WHERE id = $1 RETURNING id, name, status`, [id]);
    if (!u) return { status: 404, body: { message: 'Không tìm thấy tablet' } };
    await logHr(client, req, { action: 'revoke_device', entity: 'kiosk_device', entityId: id, after: u });
    return { status: 200, body: u };
  });
  res.status(out.status).json(out.body);
};

// ── Lần chấm ─────────────────────────────────────────────────────────────
const MAX_RANGE_DAYS = 62;
const MAX_ROWS = 2000;
const ymdVn = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);

exports.listPunches = async (req, res) => {
  const q = req.query;
  // #8 luôn có khoảng ngày (mặc định 7 ngày gần nhất), tối đa 62 ngày → không quét toàn bảng
  const to = DATE_RE.test(q.to || '') ? q.to : ymdVn(new Date());
  const from = DATE_RE.test(q.from || '') ? q.from : ymdVn(new Date(Date.parse(`${to}T00:00:00Z`) - 6 * 86400000));
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (!(span >= 0)) return res.status(400).json({ message: 'Ngày bắt đầu phải trước ngày kết thúc' });
  if (span > MAX_RANGE_DAYS) return res.status(400).json({ message: `Chỉ xem tối đa ${MAX_RANGE_DAYS} ngày mỗi lần` });
  const where = ['TRUE']; const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  add('p.work_date >= ?', from);
  add('p.work_date <= ?', to);
  if (isUuid(q.employee_id)) add('p.employee_id = ?', q.employee_id);
  if (isUuid(q.org_unit_id)) {
    add(`e.org_unit_id IN (WITH RECURSIVE sub AS (SELECT ?::uuid AS id UNION SELECT c.id FROM org_units c JOIN sub ON c.parent_id = sub.id) SELECT id FROM sub)`, q.org_unit_id);
  }
  if (q.needs_review === '1') where.push('p.needs_review');
  const sc = await hrScope(req, { col: 'e.org_unit_id', startIndex: params.length + 1 });
  const { rows } = await db.query(`
    SELECT p.id, p.employee_id, e.employee_code, e.name AS employee_name, u.name AS org_unit_name,
           p.punched_at, p.direction, to_char(p.work_date, 'YYYY-MM-DD') AS work_date, p.source, p.pin_verified,
           p.needs_review, p.review_reason, d.name AS device_name,
           p.photo_id, (ph.purged_at IS NOT NULL) AS photo_purged
      FROM attendance_punches p
      JOIN employees e ON e.id = p.employee_id
      LEFT JOIN org_units u ON u.id = e.org_unit_id
      LEFT JOIN kiosk_devices d ON d.id = p.device_id
      LEFT JOIN punch_photos ph ON ph.id = p.photo_id
     WHERE ${where.join(' AND ')} AND ${sc.sql}
     ORDER BY p.punched_at DESC
     LIMIT ${MAX_ROWS + 1}`, [...params, ...sc.params]);
  res.json({ data: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS, from, to, max_rows: MAX_ROWS });
};

// ── Ảnh ─────────────────────────────────────────────────────────────────
exports.photoUrl = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) return res.status(404).json({ message: 'Không tìm thấy ảnh' });
  const sc = await hrScope(req, { col: 'e.org_unit_id', startIndex: 2 });
  const out = await tx(async (client) => {
    const { rows: [ph] } = await client.query(
      `SELECT ph.id, ph.purged_at, ph.employee_id FROM punch_photos ph JOIN employees e ON e.id = ph.employee_id
        WHERE ph.id = $1 AND ${sc.sql}`, [id, ...sc.params]);
    if (!ph) return { status: 404, body: { message: 'Không tìm thấy ảnh' } };
    if (ph.purged_at) return { status: 410, body: { message: 'Ảnh đã bị xóa theo chính sách lưu trữ' } };
    await logHr(client, req, { action: 'view_photo', entity: 'punch_photo', entityId: id, after: { employee_id: ph.employee_id } });
    const { exp, sig } = photoStore.signPhoto(id, PHOTO_URL_TTL_S);
    return { status: 200, body: { url: `/api/hr/photos/raw/${id}?exp=${exp}&sig=${sig}`, expires_in: PHOTO_URL_TTL_S } };
  });
  res.status(out.status).json(out.body);
};

/** Public (không JWT) — chỉ cần chữ ký còn hạn. Dùng được trong <img src>. */
exports.photoRaw = async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id) || !photoStore.verifyPhoto(id, req.query.exp, req.query.sig)) {
    return res.status(403).json({ message: 'Link xem ảnh không hợp lệ hoặc đã hết hạn' });
  }
  const { rows: [ph] } = await db.query('SELECT storage_key, mime, purged_at FROM punch_photos WHERE id = $1', [id]);
  if (!ph || ph.purged_at) return res.status(410).json({ message: 'Ảnh đã bị xóa' });
  const buf = await photoStore.read(ph.storage_key);
  res.set({
    'Content-Type': ph.mime, 'Cache-Control': 'private, max-age=300',
    'Cross-Origin-Resource-Policy': 'cross-origin', // frontend (Vercel) khác origin với API (Render)
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(buf);
};
