// [HR-G2] Kiosk chấm công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// Xác thực tablet kiosk (header X-Kiosk-Token) + phiên chấm ngắn hạn sau khi nhập PIN.
const crypto = require('crypto');
const db = require('../../core/db');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/** Middleware: chỉ tablet đã duyệt (status Hoạt động) mới qua. Gắn req.kiosk = { id, org_unit_id, clock_skew_ms }. */
async function requireKiosk(req, res, next) {
  const token = req.get('X-Kiosk-Token');
  if (!token || token.length > 200) return res.status(401).json({ message: 'Tablet chưa được đăng ký' });
  try {
    const { rows: [d] } = await db.query(
      `SELECT id, org_unit_id, clock_skew_ms, last_seen_at FROM kiosk_devices WHERE token_hash = $1 AND status = 'Hoạt động'`, [sha256(token)]);
    if (!d) return res.status(401).json({ message: 'Tablet chưa được duyệt hoặc đã bị thu hồi' });
    // #17 chỉ ghi last_seen_at khi đã cũ hơn 1 phút (không ghi DB ở mọi request)
    if (!d.last_seen_at || Date.now() - new Date(d.last_seen_at) > 60000) {
      await db.query(`UPDATE kiosk_devices SET last_seen_at = now() WHERE id = $1`, [d.id]);
    }
    req.kiosk = d;
    next();
  } catch (err) { next(err); }
}

// ── Phiên chấm: token ký HMAC, hết hạn sau SESSION_TTL_S, chỉ dùng cho 1 lần chấm ──────────
// Server chạy 1 tiến trình (Render) → danh sách phiên đã dùng giữ trong bộ nhớ; restart thì
// phiên cũ (≤ 90 giây) có thể dùng lại 1 lần nữa nhưng vẫn bị chặn trùng 2 phút → chấp nhận được.
const SESSION_TTL_S = 90;
const usedSessions = new Map(); // nonce → hết hạn (ms)

const sessionSecret = () => {
  const s = process.env.KIOSK_SESSION_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error('Thiếu KIOSK_SESSION_SECRET / JWT_SECRET');
  return s;
};
const sign = (body) => crypto.createHmac('sha256', sessionSecret()).update(`kiosk-session:${body}`).digest('base64url');

/** Phiên cho nhân viên employeeId trên tablet deviceId. */
function issueSession(employeeId, deviceId) {
  const body = Buffer.from(JSON.stringify({ e: employeeId, d: deviceId, exp: Date.now() + SESSION_TTL_S * 1000, n: randomToken(12) })).toString('base64url');
  return `${body}.${sign(body)}`;
}

/** Kiểm phiên → payload { e, d, exp, n } hoặc null (sai chữ ký / hết hạn / khác tablet / đã dùng). */
function readSession(token, deviceId) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(sign(body)); const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  let p; try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!p || p.exp < Date.now() || p.d !== deviceId || usedSessions.has(p.n)) return null;
  return p;
}

function consumeSession(p) {
  const now = Date.now();
  for (const [n, exp] of usedSessions) if (exp < now) usedSessions.delete(n);
  usedSessions.set(p.n, p.exp);
}

// [HR-G2] #13 mỗi phiên chỉ trả lời đồng ý chụp ảnh 1 lần. true = lần đầu (được ghi), false = đã trả lời.
const answeredConsents = new Map(); // nonce → hết hạn (ms)
function markConsentAnswered(p) {
  const now = Date.now();
  for (const [n, exp] of answeredConsents) if (exp < now) answeredConsents.delete(n);
  if (answeredConsents.has(p.n)) return false;
  answeredConsents.set(p.n, p.exp);
  return true;
}

module.exports = { requireKiosk, issueSession, readSession, consumeSession, markConsentAnswered, sha256, randomToken, SESSION_TTL_S };
