// [HR-G1] Module Chấm công — 2026-10-22, CHƯA PHÁT HÀNH (file mới)
// Phạm vi dữ liệu Chấm công & Nghỉ phép — NGUỒN DUY NHẤT quyết định ai thấy nhân viên nào.
// Không dùng core/dataScope.js (nối chuỗi SQL). Ở đây luôn trả { sql, params } có tham số.
//
// Quy tắc:
//  - Chưa đăng nhập → không thấy gì.
//  - Admin hoặc có quyền hr_all_units.view (nhân sự / kế toán lương) → thấy tất cả.
//  - Cài đặt hr_scope_by_unit = 0 (mặc định, chủ dự án chốt 2026-10-22) → mọi người có quyền HR thấy tất cả.
//  - hr_scope_by_unit = 1 → chỉ thấy đơn vị mình quản lý (org_unit_managers) VÀ mọi đơn vị con bên dưới.
// Quyền chức năng (xem/duyệt/sửa) kiểm riêng bằng requirePerm ở route; hàm này chỉ lọc DÒNG.
const db = require('../db');
const { hasAppPerm } = require('../requireAuth');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function scopeByUnitEnabled(conn) {
  const { rows } = await conn.query(`SELECT value FROM app_settings WHERE key = 'hr_scope_by_unit'`);
  return Number(rows[0]?.value) === 1;
}

/**
 * Điều kiện WHERE lọc theo đơn vị.
 * @param {object} req
 * @param {{ col: string, startIndex?: number, conn?: object }} opts
 *   col: biểu thức cột org_unit_id trong câu truy vấn (do code đặt, KHÔNG lấy từ người dùng)
 *   startIndex: số thứ tự placeholder đầu tiên ($n) dành cho params trả về
 * @returns {Promise<{ sql: string, params: any[] }>}
 */
async function hrScope(req, { col, startIndex = 1, conn = db } = {}) {
  if (!req?.user?.id && !req?.user?.is_admin) return { sql: 'FALSE', params: [] };
  if (req.user.is_admin || hasAppPerm(req, 'hr_all_units', 'view')) return { sql: 'TRUE', params: [] };
  if (!(await scopeByUnitEnabled(conn))) return { sql: 'TRUE', params: [] };
  return {
    sql: `${col} IN (
      WITH RECURSIVE sub AS (
        SELECT m.org_unit_id AS id FROM org_unit_managers m WHERE m.user_id = $${startIndex}
        UNION
        SELECT c.id FROM org_units c JOIN sub ON c.parent_id = sub.id
      ) SELECT id FROM sub)`,
    params: [req.user.id],
  };
}

/** Được thao tác trên MỌI đơn vị (sửa cơ cấu tổ, gán quản lý, duyệt tablet): admin hoặc hr_all_units.view. */
const canManageAllUnits = (req) => !!req?.user?.is_admin || hasAppPerm(req, 'hr_all_units', 'view');

/** Câu SQL con: id của đơn vị $n và mọi đơn vị con bên dưới. */
const subtreeSql = (n) => `(WITH RECURSIVE sub AS (SELECT $${n}::uuid AS id UNION SELECT c.id FROM org_units c JOIN sub ON c.parent_id = sub.id) SELECT id FROM sub)`;

/** Nhân viên có nằm trong phạm vi của req không. id sai định dạng / không tồn tại → false. */
async function isEmployeeInScope(conn, req, employeeId) {
  if (!UUID_RE.test(String(employeeId || ''))) return false;
  const sc = await hrScope(req, { col: 'e.org_unit_id', startIndex: 2, conn });
  const { rows } = await conn.query(
    `SELECT 1 FROM employees e WHERE e.id = $1 AND e.is_deleted = FALSE AND ${sc.sql}`, [employeeId, ...sc.params]);
  return rows.length > 0;
}

module.exports = { hrScope, isEmployeeInScope, canManageAllUnits, subtreeSql, UUID_RE }; // [HR-G2] + canManageAllUnits, subtreeSql
