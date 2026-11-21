// [HR-TEAM 11/2026] Chấm công trên tablet do TỔ TRƯỞNG đăng nhập (chủ dự án chốt 2026-11-21):
//  - Chỉ 2–3 người sản xuất có tài khoản; tổ trưởng = tài khoản, công nhân = nhân viên (không tài khoản).
//  - Tổ trưởng đăng nhập app trên tablet → tab Chấm công: công nhân chọn tên mình → PIN 6 số → chụp ảnh.
//  - KHÔNG cần duyệt máy (phương án 4b): chống gian lận bằng vị trí GPS ghi kèm mỗi lần chấm.
//  - Chỉ chấm cho HÔM NAY: giờ chấm = giờ máy chủ, không nhận chấm offline / bù ngày khác.
// Dùng lại nguyên logic kiosk (PIN + khóa sai, đồng ý NĐ13, ảnh, VÀO/RA, chống trùng) với req.kiosk
// "ảo" = { id: null, org_unit_id: tổ của tổ trưởng }. Mount SAU requireAuth.
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const db = require('../../core/db');
const { getAppSettings } = require('../../core/lib/settings');
const k = require('./kioskController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024, files: 1, fields: 20 } });
const perUser = (max) => rateLimit({
  windowMs: 60 * 1000, max, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `team:${req.user?.id || req.ip}`,
  message: { message: 'Thao tác quá nhanh, vui lòng thử lại sau ít giây.' },
});

/** Người đăng nhập phải là tổ trưởng của 1 tổ (org_unit_managers + kind TO, đang hoạt động). */
async function requireTeamLeader(req, res, next) {
  try {
    const { rows: [u] } = await db.query(
      `SELECT o.id, o.name FROM org_unit_managers m JOIN org_units o ON o.id = m.org_unit_id
        WHERE m.user_id = $1 AND o.kind = 'TO' AND o.is_deleted = FALSE AND o.status = 'Hoạt động'
        ORDER BY o.name LIMIT 1`, [req.user.id]);
    if (!u) return res.status(403).json({ message: 'Tài khoản này chưa được gán làm tổ trưởng của tổ nào' });
    req.kiosk = { id: null, org_unit_id: u.id, clock_skew_ms: null };
    req.teamLeader = { user_id: req.user.id, unit_id: u.id, unit_name: u.name };
    next();
  } catch (err) { next(err); }
}

/** Danh sách công nhân của tổ + lần chấm HÔM NAY (giờ VN) để hiện "đã vào / đã ra". */
router.get('/hr/team/roster', requireTeamLeader, async (req, res) => {
  const s = await getAppSettings(db);
  const { rows } = await db.query(`
    SELECT e.id, e.name, e.employee_code, (e.pin_hash IS NOT NULL) AS has_pin,
           (e.pin_locked_until IS NOT NULL AND e.pin_locked_until > now()) AS pin_locked,
           COALESCE((SELECT json_agg(json_build_object('direction', p.direction, 'at', p.punched_at) ORDER BY p.punched_at)
                       FROM attendance_punches p
                      WHERE p.employee_id = e.id
                        AND (p.punched_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date), '[]') AS today
      FROM employees e
     WHERE e.is_deleted = FALSE AND e.status = 'Hoạt động' AND e.org_unit_id = $1
     ORDER BY e.name`, [req.teamLeader.unit_id]);
  res.json({ unit_id: req.teamLeader.unit_id, unit_name: req.teamLeader.unit_name, now: new Date().toISOString(),
    consent_version: s.hr_consent_version, employees: rows });
});

// Chọn tên + PIN 6 số → phiên chấm ngắn hạn (chỉ nhận chọn theo tên trong tổ, không nhận nhập mã NV tự do)
router.post('/hr/team/identify', requireTeamLeader, perUser(30), (req, res, next) => {
  if (!req.body?.employee_id) return res.status(400).json({ message: 'Vui lòng chọn tên' });
  if (!/^\d{6}$/.test(String(req.body?.pin || ''))) return res.status(400).json({ message: 'PIN gồm 6 chữ số' });
  delete req.body.employee_code;
  return k.identify(req, res, next);
});
router.post('/hr/team/consent', requireTeamLeader, k.consent);
router.post('/hr/team/punch', requireTeamLeader, perUser(120), (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Ảnh quá lớn (tối đa 300 KB)' });
    return res.status(400).json({ message: 'Dữ liệu gửi lên không hợp lệ' });
  });
}, k.punch);

module.exports = router;
