// backend/controllers/roleController.js — lưu cây phân quyền của 1 vai trò
const db = require('../db');

exports.savePermissions = async (req, res) => {
  try {
    const perms = req.body.permissions || {};
    const { rows } = await db.query(
      `UPDATE roles SET permissions = $1::jsonb WHERE id = $2 AND is_deleted = FALSE RETURNING id`,
      [JSON.stringify(perms), req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy vai trò' });
    res.json({ message: 'Đã lưu phân quyền' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Lỗi khi lưu phân quyền' }); }
};
