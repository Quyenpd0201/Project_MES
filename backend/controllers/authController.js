// backend/controllers/authController.js — đăng nhập + phiên (token trong bộ nhớ)
const crypto = require('crypto');
const db = require('../db');

// ── Token store: token → { userId, expiresAt } ──────────────────────────────
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 giờ
const tokens = new Map(); // token → { userId, expiresAt }

// Dọn token hết hạn mỗi 30 phút để tránh leak memory
setInterval(() => {
  const now = Date.now();
  for (const [tk, val] of tokens) {
    if (val.expiresAt < now) tokens.delete(tk);
  }
}, 30 * 60 * 1000);

// ── Brute-force protection ────────────────────────────────────────────────────
const FAIL_MAX = 5;         // số lần sai tối đa
const LOCK_MS  = 15 * 60 * 1000; // khóa 15 phút
const loginAttempts = new Map(); // ip → { count, lockedUntil }

function checkBruteForce(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) return true; // đang khóa
  return false;
}
function recordFailedLogin(ip) {
  const entry = loginAttempts.get(ip) || { count: 0, lockedUntil: null };
  entry.count++;
  if (entry.count >= FAIL_MAX) {
    entry.lockedUntil = Date.now() + LOCK_MS;
    entry.count = 0; // reset để tính lại sau khi hết khóa
  }
  loginAttempts.set(ip, entry);
}
function clearFailedLogin(ip) {
  loginAttempts.delete(ip);
}
// Dọn entries cũ mỗi giờ
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of loginAttempts) {
    if (!e.lockedUntil || e.lockedUntil < now) loginAttempts.delete(ip);
  }
}, 60 * 60 * 1000);

// ── Password helpers ──────────────────────────────────────────────────────────
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(pw, stored) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  try { return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex')); } catch { return false; }
}

// ── User payload (không trả password_hash) ──────────────────────────────────
async function userPayload(id) {
  const { rows } = await db.query(`
    SELECT u.id, u.username, u.full_name, u.status, u.team,
           r.id AS role_id, r.name AS role_name, COALESCE(r.is_admin, FALSE) AS is_admin, COALESCE(r.permissions, '{}'::jsonb) AS permissions
    FROM users u LEFT JOIN roles r ON r.id = u.role_id
    WHERE u.id = $1 AND u.is_deleted = FALSE`, [id]);
  return rows[0];
}

// ── Routes ───────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';

    // Kiểm tra brute-force
    if (checkBruteForce(ip)) {
      return res.status(429).json({ message: 'Tài khoản tạm thời bị khóa do đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.' });
    }

    const { username, password } = req.body;
    // Validate input cơ bản
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'Cần nhập tài khoản và mật khẩu' });
    }

    const { rows } = await db.query(
      `SELECT * FROM users WHERE username = $1 AND is_deleted = FALSE`,
      [String(username).trim().slice(0, 100)]
    );
    const u = rows[0];
    if (!u || u.status !== 'Hoạt động' || !verifyPassword(password, u.password_hash)) {
      recordFailedLogin(ip);
      return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu' });
    }

    clearFailedLogin(ip);
    const token = crypto.randomUUID();
    tokens.set(token, { userId: u.id, expiresAt: Date.now() + TOKEN_TTL_MS });
    res.json({ token, user: await userPayload(u.id) });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi đăng nhập' }); }
};

exports.me = async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const entry = tokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    tokens.delete(token);
    return res.status(401).json({ message: 'Phiên đăng nhập hết hạn' });
  }
  const user = await userPayload(entry.userId);
  if (!user) return res.status(401).json({ message: 'Tài khoản không tồn tại' });
  // Làm mới expiry mỗi lần dùng (sliding window)
  entry.expiresAt = Date.now() + TOKEN_TTL_MS;
  res.json({ user });
};

exports.logout = (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  tokens.delete(token);
  res.json({ message: 'Đã đăng xuất' });
};

exports.hashPassword = hashPassword;

// Hàm lấy userId từ token (dùng bởi middleware requireAuth)
exports.getUserIdFromToken = (token) => {
  const entry = tokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) { tokens.delete(token); return null; }
  entry.expiresAt = Date.now() + TOKEN_TTL_MS; // sliding window
  return entry.userId;
};

// Tạo tài khoản admin mặc định nếu DB chưa có user nào (kể cả chưa bị xóa)
exports.ensureSeedAdmin = async () => {
  try {
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM users WHERE is_deleted = FALSE`);
    if (rows[0].n > 0) return;
    const role = (await db.query(`SELECT id FROM roles WHERE is_admin = TRUE LIMIT 1`)).rows[0];
    await db.query(
      `INSERT INTO users (username, password_hash, full_name, role_id) VALUES ($1,$2,$3,$4)`,
      ['admin', hashPassword('admin123'), 'Quản trị viên', role?.id || null]
    );
    console.log('✅ Đã tạo tài khoản mặc định: admin / admin123 (hãy đổi mật khẩu sau khi đăng nhập lần đầu)');
  } catch (e) { console.error('Seed admin lỗi:', e.message); }
};
