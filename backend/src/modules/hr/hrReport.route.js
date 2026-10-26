// [HR-G5] Bảng công, bất thường, xuất Excel, chốt công — 2026-10-26, CHƯA PHÁT HÀNH (file mới)
const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const r = require('./hrReportController');
const p = require('./hrPeriodController');
const rateLimit = require('express-rate-limit');

// [Review G5] xuất Excel dựng file đồng bộ (tốn CPU) → tối đa 5 lần / phút / người
const exportLimit = rateLimit({
  windowMs: 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `hr-export:${req.user.id}`,
  message: { message: 'Xuất Excel quá nhiều lần — vui lòng thử lại sau 1 phút.' },
});

const view = requirePerm('hr_attendance:view');

router.get('/hr/reports/timesheet', view, r.timesheet);
router.get('/hr/reports/timesheet/export.xlsx', requirePerm('hr_attendance:export'), exportLimit, r.exportXlsx);
router.get('/hr/reports/anomalies', view, r.anomalies);

// Chốt / mở khóa: hr_period.approve + quyền xem mọi đơn vị (kiểm trong controller)
router.get('/hr/periods', requirePerm('hr_period:view'), p.list);
router.get('/hr/periods/:ym/precheck', requirePerm('hr_period:view'), p.precheck);
router.post('/hr/periods/:ym/close', requirePerm('hr_period:approve'), p.close);
router.post('/hr/periods/:ym/unlock', requirePerm('hr_period:approve'), p.unlock);

module.exports = router;
