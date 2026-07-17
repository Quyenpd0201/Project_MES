// backend/lib/deleteGuard.js
// Quy tắc chung: KHÔNG xóa cứng — chỉ soft delete (is_deleted), và KHÔNG cho xóa
// khi bản ghi đang ở trạng thái Hoạt động / đang tiến hành. Phải đổi sang trạng thái
// kết thúc (Không hoạt động / Đã hủy / Đã nghỉ / Ngừng…) rồi mới xóa được.
const db = require('../db');

/**
 * guardDelete(table, id, opts)
 *   blocked : mảng trạng thái KHÔNG cho xóa (chặn nếu status nằm trong đây)
 *   allow   : (tùy chọn) chỉ cho xóa khi status nằm trong đây (ngược lại đều chặn)
 *   message : thông báo lỗi tùy biến
 * Trả về: { notFound } | { blocked, status, message } | { ok }
 */
async function guardDelete(table, id, opts = {}) {
  const { blocked = [], allow = null, message, statusCol = 'status' } = opts;
  const r = await db.query(`SELECT ${statusCol} AS st FROM ${table} WHERE id = $1 AND is_deleted = FALSE`, [id]);
  if (!r.rows.length) return { notFound: true };
  const st = r.rows[0].st;
  const isBlocked = allow ? !allow.includes(st) : blocked.includes(st);
  if (isBlocked) {
    return {
      blocked: true, status: st,
      message: message || `Không thể xóa khi đang "${st}". Chỉ xóa được khi đã chuyển sang trạng thái kết thúc (Không hoạt động / Đã hủy / Ngừng). Vui lòng đổi trạng thái trước.`,
    };
  }
  return { ok: true };
}

module.exports = { guardDelete };
