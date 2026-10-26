// [HR-G4] Đơn nghỉ phép — 2026-10-26, CHƯA PHÁT HÀNH (file mới)
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const c = require('./hrLeaveController');

const view = requirePerm('hr_leave:view');
const create = requirePerm('hr_leave:create');
const approve = requirePerm('hr_leave:approve');
const MAX_MB = 5; // khớp app_settings.hr_leave_attachment_max_mb (Q6)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 } });
const uploadOne = (req, res, next) => upload.single('file')(req, res, (err) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: `Tệp quá lớn (tối đa ${MAX_MB} MB)` });
  return res.status(400).json({ message: 'Tệp gửi lên không hợp lệ' });
});

router.get('/hr/leave-requests', view, c.list);
router.get('/hr/leave-requests/:id', view, c.detail);
router.post('/hr/leave-requests', create, c.create);
router.post('/hr/leave-requests/:id/attachments', create, uploadOne, c.uploadAttachment);
router.post('/hr/leave-requests/:id/approve', approve, c.approve);
router.post('/hr/leave-requests/:id/hr-approve', approve, c.hrApprove); // + hr_all_units (controller)
router.post('/hr/leave-requests/:id/reject', approve, c.reject);
router.post('/hr/leave-requests/:id/cancel', create, c.cancel);
router.get('/hr/leave-attachments/:id/url', view, c.attachmentUrl);

router.get('/hr/leave-balances', view, c.balances);
router.put('/hr/leave-balances/:employeeId/:year/:leaveTypeId', approve, c.adjustBalance); // + hr_all_units (controller)

// Thông báo: mọi tài khoản đã đăng nhập, chỉ của chính mình
router.get('/notifications', c.notifications);
router.post('/notifications/read-all', c.readAllNotifications);
router.post('/notifications/:id/read', c.readNotification);

module.exports = router;
