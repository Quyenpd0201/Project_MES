// backend/controllers/userController.js — quản lý tài khoản (không trả mật khẩu)
const db = require('../db');
const { hashPassword } = require('./authController');

exports.list = async (req, res) => {
  try {
    const where = ['u.is_deleted = FALSE']; const params = []; let i = 1;
    if (req.query.q) { where.push(`(u.username ILIKE $${i} OR u.full_name ILIKE $${i})`); params.push(`%${req.query.q}%`); i++; }
    const { rows } = await db.query(`
      SELECT u.id, u.username, u.full_name, u.status, u.role_id, u.team, r.name AS role_name
      FROM users u LEFT JOIN roles r ON r.id = u.role_id
      WHERE ${where.join(' AND ')} ORDER BY u.username`, params);
    res.json({ data: rows });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lấy danh sách tài khoản' }); }
};

exports.getById = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, username, full_name, status, role_id, team FROM users WHERE id = $1 AND is_deleted = FALSE`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi' }); }
};

const VALID_STATUSES = ['Hoạt động', 'Không hoạt động'];

exports.create = async (req, res) => {
  try {
    const { username, password, full_name, role_id, status, team } = req.body;
    if (!username || typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 50)
      return res.status(400).json({ message: 'Tài khoản phải từ 3–50 ký tự' });
    if (!password || typeof password !== 'string' || password.length < 6 || password.length > 100)
      return res.status(400).json({ message: 'Mật khẩu phải từ 6–100 ký tự' });
    const resolvedStatus = status || 'Hoạt động';
    if (!VALID_STATUSES.includes(resolvedStatus))
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    const { rows } = await db.query(
      `INSERT INTO users (username, password_hash, full_name, role_id, status, team) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [username.trim(), hashPassword(password), full_name ? String(full_name).slice(0, 100) : null,
       role_id || null, resolvedStatus, team ? String(team).slice(0, 100) : null]);
    res.status(201).json({ id: rows[0].id });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ message: 'Tài khoản đã tồn tại' });
    res.status(500).json({ message: e.detail || 'Lỗi tạo tài khoản' });
  }
};

exports.update = async (req, res) => {
  try {
    const { username, password, full_name, role_id, status, team } = req.body;
    const cols = [], vals = []; let i = 1;
    const add = (c, v) => { cols.push(`${c} = $${i++}`); vals.push(v); };
    if (username !== undefined) {
      if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 50)
        return res.status(400).json({ message: 'Tài khoản phải từ 3–50 ký tự' });
      add('username', username.trim());
    }
    if (full_name !== undefined) add('full_name', full_name ? String(full_name).slice(0, 100) : null);
    if (role_id !== undefined) add('role_id', role_id || null);
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
      add('status', status);
    }
    if (team !== undefined) add('team', team ? String(team).slice(0, 100) : null);
    if (password) {
      if (typeof password !== 'string' || password.length < 6 || password.length > 100)
        return res.status(400).json({ message: 'Mật khẩu phải từ 6–100 ký tự' });
      add('password_hash', hashPassword(password));
    }
    if (!cols.length) return res.status(400).json({ message: 'Không có trường để cập nhật' });
    const { rows } = await db.query(`UPDATE users SET ${cols.join(', ')} WHERE id = $${i} AND is_deleted = FALSE RETURNING id`, [...vals, req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    res.json({ message: 'Đã cập nhật tài khoản' });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ message: 'Tài khoản đã tồn tại' });
    res.status(500).json({ message: e.detail || 'Lỗi cập nhật' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { rowCount } = await db.query(`UPDATE users SET is_deleted = TRUE WHERE id = $1 AND is_deleted = FALSE`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    res.json({ message: 'Đã xóa tài khoản' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi xóa' }); }
};
