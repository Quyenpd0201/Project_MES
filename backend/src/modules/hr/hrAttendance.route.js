// [HR-G2] Kiosk chấm công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const c = require('./hrAttendanceController');

// Tablet kiosk (xem: hr_config.view; duyệt / sửa / thu hồi: hr_config.edit + hr_all_units — kiểm trong controller)
router.get('/hr/kiosk-devices', requirePerm('hr_config:view'), c.listDevices);
router.post('/hr/kiosk-devices/approve', requirePerm('hr_config:edit'), c.approveDevice);
router.put('/hr/kiosk-devices/:id', requirePerm('hr_config:edit'), c.updateDevice);
router.post('/hr/kiosk-devices/:id/revoke', requirePerm('hr_config:edit'), c.revokeDevice);

// Lần chấm + ảnh
router.get('/hr/punches', requirePerm('hr_attendance:view'), c.listPunches);
router.get('/hr/photos/:id/url', requirePerm('hr_photo:view'), c.photoUrl);

module.exports = router;
