// [HR-G1] Module Chấm công — 2026-10-22, CHƯA PHÁT HÀNH (file mới)
// Nhật ký thao tác nhạy cảm của Chấm công & Nghỉ phép (bảng hr_audit_logs).
// Gọi BÊN TRONG transaction của thao tác (cùng client) → thao tác rollback thì log cũng rollback.
// KHÔNG ghi giá trị bí mật (PIN, pin_hash) vào before/after.

const SECRET_KEYS = ['pin', 'pin_hash', 'password', 'password_hash'];

// Che bí mật ở MỌI cấp lồng nhau (before/after có thể chứa object con)
const scrub = (obj) => {
  if (obj instanceof Date) return obj;
  if (!obj || typeof obj !== 'object') return obj ?? null;
  if (Array.isArray(obj)) return obj.map(scrub);
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = SECRET_KEYS.includes(k) ? '***' : scrub(v);
  return out;
};

/**
 * @param {object} client  pg client đang trong transaction
 * @param {object} req     request (lấy người thực hiện + IP)
 * @param {{ action: string, entity: string, entityId?: string, before?: object, after?: object }} e
 */
async function logHr(client, req, { action, entity, entityId = null, before = null, after = null }) {
  await client.query(
    `INSERT INTO hr_audit_logs (actor_user_id, action, entity, entity_id, before, after, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [req.user?.id || null, action, entity, entityId == null ? null : String(entityId),
      before == null ? null : JSON.stringify(scrub(before)), after == null ? null : JSON.stringify(scrub(after)),
      req.ip || null]);
}

module.exports = { logHr };
