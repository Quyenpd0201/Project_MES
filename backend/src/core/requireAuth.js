// backend/middleware/requireAuth.js — xác thực Bearer token cho mọi request
const { getUserIdFromToken } = require('../modules/auth/authController');
const db = require('./db');

/**
 * Middleware xác thực phiên đăng nhập.
 * Gắn req.userId và req.user vào request nếu token hợp lệ.
 * Trả 401 nếu thiếu/sai/hết hạn token.
 */
module.exports = async function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Cần đăng nhập để thực hiện thao tác này' });

  const userId = getUserIdFromToken(token);
  if (!userId) return res.status(401).json({ message: 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại' });

  try {
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.full_name, u.status, u.team,
              r.id AS role_id, r.name AS role_name,
              COALESCE(r.is_admin, FALSE) AS is_admin,
              COALESCE(r.permissions, '{}'::jsonb) AS permissions
       FROM users u LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1 AND u.is_deleted = FALSE AND u.status = 'Hoạt động'`,
      [userId]
    );
    if (!rows[0]) return res.status(401).json({ message: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa' });

    req.userId = userId;
    req.user   = rows[0];
    next();
  } catch (err) {
    console.error('[requireAuth]', err);
    res.status(500).json({ message: 'Lỗi xác thực, vui lòng thử lại' });
  }
};
