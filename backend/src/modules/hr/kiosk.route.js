// [HR-G2] Kiosk chấm công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
// Route PUBLIC (không JWT người dùng) — mount TRƯỚC requireAuth trong src/routes.js.
// Tablet xác thực bằng X-Kiosk-Token (requireKiosk); ảnh xem qua chữ ký HMAC có hạn.
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { requireKiosk, sha256 } = require('./kioskAuth');
const k = require('./kioskController');
const att = require('./hrAttendanceController');

const MAX_PHOTO_BYTES = 300 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 20 } });

const perDevice = (max) => rateLimit({
  windowMs: 60 * 1000, max, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `kiosk:${sha256(req.get('X-Kiosk-Token') || '')}`,
  message: { message: 'Thao tác quá nhanh, vui lòng thử lại sau ít giây.' },
});
const perIp = (max) => rateLimit({
  windowMs: 60 * 1000, max, standardHeaders: true, legacyHeaders: false,
  message: { message: 'Quá nhiều yêu cầu, vui lòng thử lại sau.' },
});

// Đăng ký tablet
router.post('/kiosk/register', perIp(10), k.register);
router.post('/kiosk/register/claim', perIp(60), k.claim);

// Tablet đã duyệt
router.get('/kiosk/time', requireKiosk, k.time);
router.get('/kiosk/roster', requireKiosk, k.roster);
router.post('/kiosk/identify', requireKiosk, perDevice(Number(process.env.KIOSK_IDENTIFY_PER_MIN) || 30), k.identify);
router.post('/kiosk/consent', requireKiosk, k.consent);
router.post('/kiosk/punch', requireKiosk, perDevice(Number(process.env.KIOSK_PUNCH_PER_MIN) || 120), (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Ảnh quá lớn (tối đa 300 KB)' });
    return res.status(400).json({ message: 'Dữ liệu gửi lên không hợp lệ' });
  });
}, k.punch);

// Ảnh chấm công (link ký có hạn — dùng trong <img>)
router.get('/hr/photos/raw/:id', att.photoRaw);
// [HR-G4] đính kèm đơn nghỉ (link ký có hạn)
router.get('/hr/leave-attachments/raw/:id', require('./hrLeaveController').attachmentRaw);

module.exports = router;
