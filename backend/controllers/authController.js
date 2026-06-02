// backend/controllers/authController.js — đăng nhập + phiên (token trong bộ nhớ)
const crypto = require('crypto');
const db = require('../db');

const tokens = new Map(); // token -> userId

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

async function userPayload(id) {
  const { rows } = await db.query(`
    SELECT u.id, u.username, u.full_name, u.status,
           r.id AS role_id, r.name AS role_name, COALESCE(r.is_admin, FALSE) AS is_admin, COALESCE(r.permissions, '{}'::jsonb) AS permissions
    FROM users u LEFT JOIN roles r ON r.id = u.role_id
    WHERE u.id = $1 AND u.is_deleted = FALSE`, [id]);
  return rows[0];
}

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const { rows } = await db.query(`SELECT * FROM users WHERE username = $1 AND is_deleted = FALSE`, [String(username || '').trim()]);
    const u = rows[0];
    if (!u || u.status !== 'Hoạt động' || !verifyPassword(password, u.password_hash))
      return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu' });
    const token = crypto.randomUUID();
    tokens.set(token, u.id);
    res.json({ token, user: await userPayload(u.id) });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi đăng nhập' }); }
};

exports.me = async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const uid = tokens.get(token);
  if (!uid) return res.status(401).json({ message: 'Phiên đăng nhập hết hạn' });
  const user = await userPayload(uid);
  if (!user) return res.status(401).json({ message: 'Tài khoản không tồn tại' });
  res.json({ user });
};

exports.logout = (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  tokens.delete(token);
  res.json({ message: 'Đã đăng xuất' });
};

exports.hashPassword = hashPassword;

// Tạo tài khoản admin mặc định nếu DB chưa có user nào
exports.ensureSeedAdmin = async () => {
  try {
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM users`);
    if (rows[0].n > 0) return;
    const role = (await db.query(`SELECT id FROM roles WHERE is_admin = TRUE LIMIT 1`)).rows[0];
    await db.query(`INSERT INTO users (username, password_hash, full_name, role_id) VALUES ($1,$2,$3,$4)`,
      ['admin', hashPassword('admin123'), 'Quản trị viên', role?.id || null]);
    console.log('✅ Đã tạo tài khoản mặc định: admin / admin123');
  } catch (e) { console.error('Seed admin lỗi:', e.message); }
};
