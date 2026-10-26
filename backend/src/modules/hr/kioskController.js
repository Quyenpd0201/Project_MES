// [HR-G2] Kiosk chấm công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// API cho tablet: đăng ký thiết bị, giờ server, danh sách tên, xác thực PIN, đồng ý NĐ13, chấm công (online/offline).
const crypto = require('crypto');
const db = require('../../core/db');
const { getAppSettings } = require('../../core/lib/settings');
const { logHr } = require('../../core/lib/hrAudit');
const { subtreeSql, UUID_RE } = require('../../core/lib/hrScope');
const { decideDirection, resolveOfflineTime } = require('../../core/lib/punchRules');
const photoStore = require('../../core/lib/photoStore');
const { enqueue, around, drainEmployees } = require('./hrRecalc'); // [HR-G3]
const { issueSession, readSession, consumeSession, markConsentAnswered, sha256, randomToken } = require('./kioskAuth');

const MAX_OPEN_HOURS = 16;
const REGISTER_TTL_MIN = 15;
const MAX_PENDING_REGISTRATIONS = 50;         // #14 chống spam đăng ký
const OFFLINE_REJECT_DAYS = 7;                // #1 bản offline cũ hơn → từ chối hẳn (24h–7 ngày: nhận + cần xác nhận)
const OFFLINE_PER_DAY = () => Number(process.env.KIOSK_OFFLINE_PER_DAY) || 30; // #1 hạn mức / tablet / 24h
const DEVICE_FAIL_WINDOW_MS = 10 * 60 * 1000; // #6 tablet sai PIN quá nhiều → chặn tạm cả tablet
const DEVICE_FAIL_MAX = 20;
const MAX_LOCK_MIN = 24 * 60;
const GENERIC_CODE_ERROR = 'Mã nhân viên hoặc PIN không đúng (hoặc PIN đang bị khóa) — gặp trưởng tổ nếu cần';

// #6 Đếm số lần sai PIN theo tablet trong 10 phút (bộ nhớ; 1 tiến trình server)
const deviceFails = new Map(); // deviceId → [mốc ms]
function deviceFailCount(deviceId) {
  const now = Date.now();
  const list = (deviceFails.get(deviceId) || []).filter((t) => now - t < DEVICE_FAIL_WINDOW_MS);
  deviceFails.set(deviceId, list);
  return list.length;
}
const recordDeviceFail = (deviceId) => { deviceFailCount(deviceId); deviceFails.get(deviceId).push(Date.now()); };
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ 0/O/1/I cho dễ đọc
const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

const isUuid = (v) => UUID_RE.test(String(v || ''));
const randomCode = () => Array.from(crypto.randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
const kioskReq = (req) => ({ ...req, user: null }); // audit từ kiosk: không có user, ghi IP + thiết bị trong after

// So khớp PIN theo đúng định dạng salt:hash (scrypt) mà authController.hashPassword tạo ra
function verifyPin(pin, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(String(pin), salt, 64);
  const want = Buffer.from(hash, 'hex');
  return want.length === h.length && crypto.timingSafeEqual(h, want);
}

// ── Đăng ký thiết bị (public) ─────────────────────────────────────────────
exports.register = async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 100) || null;
  const { rows: [{ n }] } = await db.query(
    `SELECT count(*)::int n FROM kiosk_devices WHERE status = 'Chờ duyệt' AND register_expires_at > now()`);
  if (n >= MAX_PENDING_REGISTRATIONS) return res.status(429).json({ message: 'Đang có quá nhiều yêu cầu đăng ký chờ duyệt, vui lòng thử lại sau' });
  const claimSecret = randomToken(32);
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    try {
      const { rows: [d] } = await db.query(
        `INSERT INTO kiosk_devices (name, register_code, register_expires_at, claim_hash)
         VALUES ($1, $2, now() + make_interval(mins => $3), $4) RETURNING id`, [name, code, REGISTER_TTL_MIN, sha256(claimSecret)]);
      return res.status(201).json({ device_id: d.id, code, claim_secret: claimSecret, expires_in_minutes: REGISTER_TTL_MIN });
    } catch (err) {
      if (err.code !== '23505') throw err; // trùng mã → thử mã khác
    }
  }
  res.status(503).json({ message: 'Không tạo được mã đăng ký, vui lòng thử lại' });
};

/** Tablet hỏi đã được duyệt chưa; được duyệt → nhận token ĐÚNG 1 LẦN. */
exports.claim = async (req, res) => {
  const { device_id: id, claim_secret: secret } = req.body || {};
  if (!isUuid(id) || !secret) return res.status(404).json({ message: 'Không tìm thấy yêu cầu đăng ký' });
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [d] } = await client.query('SELECT * FROM kiosk_devices WHERE id = $1 FOR UPDATE', [id]);
    // Kiểm bí mật TRƯỚC mọi trạng thái → người không có bí mật không dò được tablet nào đã nhận token
    if (!d || !d.claim_hash || d.claim_hash !== sha256(secret)) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Không tìm thấy yêu cầu đăng ký' });
    }
    if (d.token_hash) { await client.query('ROLLBACK'); return res.status(410).json({ message: 'Tablet đã nhận token, không cấp lại' }); }
    if (d.status === 'Thu hồi') { await client.query('ROLLBACK'); return res.status(410).json({ message: 'Yêu cầu đăng ký đã bị từ chối' }); }
    if (d.status !== 'Hoạt động') {
      await client.query('ROLLBACK');
      if (d.register_expires_at && new Date(d.register_expires_at) < new Date()) return res.status(410).json({ message: 'Mã đăng ký đã hết hạn, hãy đăng ký lại' });
      return res.status(202).json({ status: 'Chờ duyệt', code: d.register_code });
    }
    const token = randomToken(32);
    // Giữ claim_hash để lần gọi lại (đúng bí mật) nhận 410 rõ ràng; thu hồi sẽ xóa nó
    await client.query('UPDATE kiosk_devices SET token_hash = $1 WHERE id = $2', [sha256(token), id]);
    await client.query('COMMIT');
    res.json({ token, name: d.name });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
};

// ── Giờ server + đo độ lệch đồng hồ tablet ───────────────────────────────
exports.time = async (req, res) => {
  const now = new Date();
  const client = Date.parse(req.get('X-Client-Time') || '');
  if (Number.isFinite(client) && Math.abs(client - now) < 7 * 86400000) {
    await db.query('UPDATE kiosk_devices SET clock_skew_ms = $1 WHERE id = $2', [Math.round(client - now), req.kiosk.id]);
  }
  res.json({ now: now.toISOString() });
};

// ── Danh sách tên trên tablet ────────────────────────────────────────────
exports.roster = async (req, res) => {
  const s = await getAppSettings(db);
  const { rows } = await db.query(`
    SELECT e.id, e.name, e.employee_code,
           (e.face_consent_refused_at IS NOT NULL AND (e.face_consent_at IS NULL OR e.face_consent_refused_at > e.face_consent_at)) AS consent_refused
      FROM employees e
     WHERE e.is_deleted = FALSE AND e.status = 'Hoạt động' AND e.org_unit_id IN ${subtreeSql(1)}
     ORDER BY e.name`, [req.kiosk.org_unit_id]);
  const { rows: [u] } = await db.query('SELECT name FROM org_units WHERE id = $1', [req.kiosk.org_unit_id]);
  res.json({
    unit_name: u?.name || '', employees: rows, now: new Date().toISOString(),
    consent_version: s.hr_consent_version, result_seconds: s.hr_kiosk_result_seconds,
  });
};

/** Trạng thái đồng ý chụp ảnh với phiên bản hiện tại. */
function consentState(e, version) {
  const refused = e.face_consent_refused_at && (!e.face_consent_at || e.face_consent_refused_at > e.face_consent_at);
  if (refused) return 'refused';
  return e.face_consent_at && e.face_consent_version === version ? 'accepted' : 'needed';
}

async function lastPunch(conn, employeeId, before) {
  const { rows: [p] } = await conn.query(
    `SELECT id, direction, punched_at, to_char(work_date, 'YYYY-MM-DD') AS work_date FROM attendance_punches
      WHERE employee_id = $1 AND punched_at <= $2 ORDER BY punched_at DESC LIMIT 1`, [employeeId, before]);
  return p || null;
}

// ── Nhập PIN ─────────────────────────────────────────────────────────────
exports.identify = async (req, res) => {
  const { employee_id: empId, employee_code: empCode, pin } = req.body || {};
  if (!pin || !/^\d{4,8}$/.test(String(pin))) return res.status(400).json({ message: 'Vui lòng nhập PIN (4–8 chữ số)' });
  if (deviceFailCount(req.kiosk.id) >= DEVICE_FAIL_MAX) {
    return res.status(429).json({ message: 'Tablet nhập sai PIN quá nhiều lần — tạm khóa 10 phút, báo trưởng tổ' });
  }
  const byCode = !empId && !!empCode; // "Người xưởng khác": mọi lỗi trả cùng 1 thông báo → không dò được mã NV
  const s = await getAppSettings(db);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    let e;
    if (empId) {
      // Chọn tên trên lưới: chỉ nhân viên thuộc xưởng của tablet
      if (isUuid(empId)) {
        ({ rows: [e] } = await client.query(
          `SELECT * FROM employees WHERE id = $1 AND is_deleted = FALSE AND status = 'Hoạt động'
             AND org_unit_id IN ${subtreeSql(2)} FOR UPDATE`, [empId, req.kiosk.org_unit_id]));
      }
    } else if (empCode) {
      // "Người xưởng khác" (Q5): nhập mã nhân viên, bất kỳ xưởng nào
      ({ rows: [e] } = await client.query(
        `SELECT * FROM employees WHERE upper(employee_code) = upper($1) AND is_deleted = FALSE AND status = 'Hoạt động' FOR UPDATE`,
        [String(empCode).trim().slice(0, 20)]));
    }
    if (!e || !e.pin_hash) {
      await client.query('ROLLBACK');
      if (byCode) { recordDeviceFail(req.kiosk.id); return res.status(401).json({ message: GENERIC_CODE_ERROR }); }
      if (!e) return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
      return res.status(400).json({ message: 'Bạn chưa có PIN chấm công — vui lòng gặp trưởng tổ để được cấp PIN' });
    }
    if (e.pin_locked_until && new Date(e.pin_locked_until) > new Date()) {
      await client.query('ROLLBACK');
      if (byCode) { recordDeviceFail(req.kiosk.id); return res.status(401).json({ message: GENERIC_CODE_ERROR }); }
      const t = new Date(e.pin_locked_until).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
      return res.status(423).json({ message: `PIN đang bị khóa đến ${t} do nhập sai nhiều lần — gặp trưởng tổ để mở khóa` });
    }
    if (!verifyPin(pin, e.pin_hash)) {
      recordDeviceFail(req.kiosk.id);
      // #6 Khóa tăng dần: bộ đếm KHÔNG reset sau mỗi lần khóa (chỉ reset khi nhập đúng / trưởng tổ mở khóa).
      // Lần khóa thứ k (mỗi max_fail lần sai) kéo dài lock_min × 2^(k−1) phút, tối đa 24 giờ.
      const { rows: [u] } = await client.query(
        `UPDATE employees SET pin_failed_count = pin_failed_count + 1,
                pin_locked_until = CASE WHEN (pin_failed_count + 1) % $2 = 0
                  THEN now() + make_interval(mins => LEAST($3 * power(2, (pin_failed_count + 1) / $2 - 1), $4)::int)
                  ELSE pin_locked_until END
          WHERE id = $1 RETURNING pin_failed_count, pin_locked_until`, [e.id, s.hr_pin_max_fail, s.hr_pin_lock_min, MAX_LOCK_MIN]);
      const locked = u.pin_failed_count % s.hr_pin_max_fail === 0;
      if (locked) await logHr(client, kioskReq(req), { action: 'pin_locked', entity: 'employee', entityId: e.id, after: { device_id: req.kiosk.id, fails: u.pin_failed_count } });
      await client.query('COMMIT');
      if (byCode) return res.status(401).json({ message: GENERIC_CODE_ERROR });
      if (locked) {
        const mins = Math.round((new Date(u.pin_locked_until) - Date.now()) / 60000);
        return res.status(423).json({ message: `Nhập sai PIN ${s.hr_pin_max_fail} lần — PIN bị khóa ${mins} phút` });
      }
      return res.status(401).json({ message: `PIN không đúng — còn ${s.hr_pin_max_fail - (u.pin_failed_count % s.hr_pin_max_fail)} lần thử` });
    }
    if (e.pin_failed_count) await client.query('UPDATE employees SET pin_failed_count = 0 WHERE id = $1', [e.id]);
    const last = await lastPunch(client, e.id, new Date());
    await client.query('COMMIT');
    const d = decideDirection(last, new Date(), { dedupeMin: s.hr_punch_dedupe_min, maxOpenHours: MAX_OPEN_HOURS });
    const consent = consentState(e, s.hr_consent_version);
    res.json({
      session: issueSession(e.id, req.kiosk.id),
      employee: { id: e.id, name: e.name, employee_code: e.employee_code },
      expected_direction: d.duplicate ? last.direction : d.direction,
      needs_consent: consent === 'needed', photo_required: consent !== 'refused',
      consent_version: s.hr_consent_version,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
};

// ── Đồng ý / từ chối chụp ảnh (NĐ 13/2023) ───────────────────────────────
exports.consent = async (req, res) => {
  const p = readSession(req.body?.session, req.kiosk.id);
  if (!p) return res.status(401).json({ message: 'Phiên đã hết hạn, vui lòng nhập lại PIN' });
  // #13 Mỗi phiên chỉ trả lời 1 lần → không đổi qua lại để né chụp ảnh
  if (!markConsentAnswered(p)) return res.status(409).json({ message: 'Đã trả lời rồi — vui lòng nhập lại PIN nếu muốn đổi' });
  const accept = req.body?.accept === true;
  const s = await getAppSettings(db);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    if (accept) {
      await client.query(`UPDATE employees SET face_consent_at = now(), face_consent_version = $1, face_consent_refused_at = NULL WHERE id = $2`,
        [s.hr_consent_version, p.e]);
    } else {
      await client.query(`UPDATE employees SET face_consent_refused_at = now() WHERE id = $1`, [p.e]);
    }
    await logHr(client, kioskReq(req), { action: accept ? 'face_consent' : 'face_consent_refused', entity: 'employee', entityId: p.e,
      after: { version: s.hr_consent_version, device_id: req.kiosk.id } });
    await client.query('COMMIT');
    res.json({ accepted: accept, photo_required: accept });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
};

// ── Chấm công ────────────────────────────────────────────────────────────
const fmtTime = (d) => new Date(d).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });

async function findByKey(conn, key) {
  const { rows: [p] } = await conn.query(
    `SELECT p.id, p.direction, p.punched_at, to_char(p.work_date, 'YYYY-MM-DD') AS work_date, p.needs_review, p.device_id, e.name AS employee_name
       FROM attendance_punches p JOIN employees e ON e.id = p.employee_id WHERE p.idempotency_key = $1`, [key]);
  return p || null;
}
const punchView = (p, extra = {}) => ({
  id: p.id, direction: p.direction, punched_at: p.punched_at, work_date: p.work_date,
  employee_name: p.employee_name, needs_review: p.needs_review, duplicate: false, ...extra,
});

exports.punch = async (req, res) => {
  const b = req.body || {};
  const key = String(b.idempotency_key || '');
  if (!KEY_RE.test(key)) return res.status(400).json({ message: 'Thiếu mã chống gửi trùng' });

  // 1) Gửi lại (mạng chập chờn / đồng bộ offline) → trả kết quả cũ, không tạo mới
  const existing = await findByKey(db, key);
  if (existing) {
    if (existing.device_id !== req.kiosk.id) return res.status(409).json({ message: 'Mã chống gửi trùng đã được dùng' });
    return res.status(200).json(punchView(existing, { resent: true }));
  }

  // 2) Ai chấm, lúc nào
  const offline = b.offline === '1' || b.offline === 'true';
  const now = new Date();
  let employeeId; let time = now; let pinVerified = true; const reasons = []; let session = null;
  if (offline) {
    // Q2: offline không kiểm được PIN → chỉ nhận nhân viên thuộc xưởng của tablet, cần trưởng tổ xác nhận
    if (!isUuid(b.employee_id)) return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    // #1 chỉ nhân viên đang hoạt động
    const { rows: [ok] } = await db.query(
      `SELECT 1 FROM employees WHERE id = $1 AND is_deleted = FALSE AND status = 'Hoạt động' AND org_unit_id IN ${subtreeSql(2)}`,
      [b.employee_id, req.kiosk.org_unit_id]);
    if (!ok) return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    employeeId = b.employee_id; pinVerified = false;
    reasons.push('Chấm offline không nhập PIN');
    const t = resolveOfflineTime({ clientTime: b.client_captured_at, skewMs: req.kiosk.clock_skew_ms ?? NaN, now });
    // #1 quá 7 ngày → từ chối hẳn (không cho tự chọn giờ lùi xa)
    if (now - t.time > OFFLINE_REJECT_DAYS * 86400000) {
      return res.status(400).json({ message: `Lần chấm offline quá cũ (hơn ${OFFLINE_REJECT_DAYS} ngày) — không ghi nhận, báo trưởng tổ sửa công` });
    }
    time = t.time; if (t.reason) reasons.push(t.reason);
    // #1 hạn mức số lần chấm offline của tablet trong 24 giờ
    const { rows: [{ n }] } = await db.query(
      `SELECT count(*)::int n FROM attendance_punches WHERE device_id = $1 AND source = 'offline' AND created_at > now() - interval '24 hours'`, [req.kiosk.id]);
    if (n >= OFFLINE_PER_DAY()) {
      return res.status(429).json({ message: `Tablet đã chấm offline ${n} lần trong 24 giờ — vượt hạn mức, báo trưởng tổ` });
    }
  } else {
    session = readSession(b.session, req.kiosk.id);
    if (!session) return res.status(401).json({ message: 'Phiên đã hết hạn, vui lòng nhập lại PIN' });
    employeeId = session.e;
  }

  const s = await getAppSettings(db);
  const { rows: [emp] } = await db.query(
    `SELECT id, name, face_consent_at, face_consent_version, face_consent_refused_at FROM employees
      WHERE id = $1 AND is_deleted = FALSE AND status = 'Hoạt động'`, [employeeId]);
  if (!emp) return res.status(404).json({ message: 'Không tìm thấy nhân viên' }); // #15
  const consent = consentState(emp, s.hr_consent_version);

  // 3) Ảnh: đồng ý → bắt buộc; từ chối (Q4) → không lưu ảnh, cần xác nhận; chưa hỏi → online phải đồng ý trước
  const file = req.file;
  let photo = null;
  if (consent === 'refused') {
    reasons.push('Không chụp ảnh (nhân viên từ chối theo NĐ 13)');
  } else if (!offline && consent === 'needed') {
    return res.status(400).json({ message: 'Cần xác nhận đồng ý chụp ảnh trước khi chấm' });
  } else if (!file) {
    // #1 offline cũng bắt buộc ảnh (ảnh là bằng chứng duy nhất khi không có PIN)
    return res.status(400).json({ message: 'Cần chụp ảnh khuôn mặt để chấm công' });
  } else {
    const mime = photoStore.sniffMime(file.buffer);
    if (!mime) return res.status(400).json({ message: 'Ảnh không hợp lệ (chỉ nhận WebP / JPEG)' });
    photo = { key: photoStore.makeKey(time, mime), mime, bytes: file.size,
      width: Number(b.photo_width) || null, height: Number(b.photo_height) || null };
    await photoStore.save(photo.key, file.buffer, mime);
  }
  const dropPhoto = () => (photo ? photoStore.remove(photo.key).catch(() => {}) : null);

  // 4) Ghi lần chấm (khóa dòng nhân viên → 2 lần chấm đồng thời không cùng ra "VÀO")
  let client;
  try {
    client = await db.pool.connect(); // #9 trong try → lỗi lấy kết nối vẫn dọn ảnh vừa lưu
    await client.query('BEGIN');
    // FOR NO KEY UPDATE: vẫn xếp hàng 2 lần chấm của cùng người, nhưng không chặn kiểm tra khóa ngoại của bảng khác
    await client.query('SELECT 1 FROM employees WHERE id = $1 FOR NO KEY UPDATE', [employeeId]);
    // Request cùng mã chống trùng chạy song song: request kia vừa ghi xong trong lúc mình chờ khóa → trả lại đúng bản ghi đó
    const sameKey = await findByKey(client, key);
    if (sameKey) {
      await client.query('ROLLBACK');
      await dropPhoto();
      return res.status(200).json(punchView(sameKey, { resent: true }));
    }
    const last = await lastPunch(client, employeeId, time);
    let d = decideDirection(last, time, { dedupeMin: s.hr_punch_dedupe_min, maxOpenHours: MAX_OPEN_HOURS });
    let dupOf = d.duplicate ? last : null;
    if (!d.duplicate && offline && s.hr_punch_dedupe_min > 0) {
      // #3 bản offline đến trễ: trùng cả với lần chấm NGAY SAU trong cửa sổ chặn trùng
      const { rows: [next] } = await client.query(
        `SELECT direction, punched_at FROM attendance_punches WHERE employee_id = $1 AND punched_at > $2
           AND punched_at < $2::timestamptz + make_interval(mins => $3) ORDER BY punched_at LIMIT 1`, [employeeId, time, s.hr_punch_dedupe_min]);
      if (next) { d = { duplicate: true }; dupOf = next; }
    }
    if (d.duplicate) {
      await client.query('ROLLBACK');
      await dropPhoto();
      if (session) consumeSession(session);
      return res.status(200).json({ duplicate: true, direction: dupOf.direction, punched_at: dupOf.punched_at, employee_name: emp.name,
        message: `Bạn vừa chấm ${dupOf.direction === 'IN' ? 'VÀO' : 'RA'} lúc ${fmtTime(dupOf.punched_at)}` });
    }
    if (offline) {
      // Có lần chấm SAU thời điểm này (đã đồng bộ trước) → thứ tự VÀO/RA có thể lệch, cần xem lại
      const { rows: later } = await client.query('SELECT 1 FROM attendance_punches WHERE employee_id = $1 AND punched_at > $2 LIMIT 1', [employeeId, time]);
      if (later.length) reasons.push('Có lần chấm sau thời điểm này đã ghi trước');
    }
    let photoId = null;
    if (photo) {
      ({ rows: [{ id: photoId }] } = await client.query(
        `INSERT INTO punch_photos (storage_key, mime, bytes, width, height, taken_at, device_id, employee_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [photo.key, photo.mime, photo.bytes, photo.width, photo.height, time, req.kiosk.id, employeeId]));
    }
    const { rows: [p] } = await client.query(
      `INSERT INTO attendance_punches (employee_id, device_id, punched_at, direction, work_date, source, client_captured_at,
                                       idempotency_key, photo_id, pin_verified, needs_review, review_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, direction, punched_at, to_char(work_date, 'YYYY-MM-DD') AS work_date, needs_review`,
      [employeeId, req.kiosk.id, time, d.direction, d.work_date, offline ? 'offline' : 'online',
        Number.isFinite(Date.parse(b.client_captured_at)) ? new Date(b.client_captured_at) : null,
        key, photoId, pinVerified, reasons.length > 0, reasons.join('; ') || null]);
    await enqueue(client, around(employeeId, p.work_date)); // [HR-G3] xếp hàng tính lại trong cùng transaction
    await client.query('COMMIT');
    client.release(); client = null; // trả kết nối TRƯỚC khi tính lại (không giữ 2 kết nối / lần chấm)
    if (session) consumeSession(session);
    await drainEmployees([employeeId]); // [HR-G3] tính ngay; lỗi → còn trong hàng đợi, worker tính sau
    res.status(201).json(punchView({ ...p, employee_name: emp.name },
      { message: `Đã chấm ${p.direction === 'IN' ? 'VÀO' : 'RA'} lúc ${fmtTime(p.punched_at)}` }));
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    await dropPhoto();
    if (err.code === '23505' && err.constraint === 'attendance_punches_idempotency_key_key') {
      const again = await findByKey(db, key); // 2 request cùng key gửi đồng thời
      if (again) return res.status(200).json(punchView(again, { resent: true }));
    }
    throw err;
  } finally { if (client) client.release(); }
};
