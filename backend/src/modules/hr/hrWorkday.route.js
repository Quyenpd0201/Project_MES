// [HR-G3] Tính công — 2026-10-23, CHƯA PHÁT HÀNH (file mới)
const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const c = require('./hrWorkdayController');

const view = requirePerm('hr_attendance:view');
const create = requirePerm('hr_attendance:create');
const approve = requirePerm('hr_attendance:approve');
// [Review G3] Q5: duyệt sửa công là quyền RIÊNG (trưởng xưởng / nhân sự), trưởng tổ chỉ có approve thì không duyệt được
const approveCorrection = requirePerm('hr_attendance:approve_correction');

// Phân ca (trưởng tổ — quyền duyệt)
router.get('/hr/shift-assignments', view, c.listAssignments);
router.put('/hr/shift-assignments', approve, c.saveAssignments);

// Duyệt lần chấm cần xác nhận
router.get('/hr/punch-reviews/pending', view, c.pendingReviews);
router.post('/hr/punches/:id/review', approve, c.reviewPunch);

// Sửa công: tạo hộ (create) → người KHÁC duyệt (approve)
router.get('/hr/corrections', view, c.listCorrections);
router.post('/hr/corrections', create, c.createCorrection);
router.post('/hr/corrections/:id/approve', approveCorrection, c.approveCorrection);
router.post('/hr/corrections/:id/reject', approveCorrection, c.rejectCorrection);
router.post('/hr/corrections/:id/cancel', create, c.cancelCorrection);

// Tăng ca
router.post('/hr/overtime/:employeeId/:date/approve', approve, c.approveOvertime);

// Ngày công
router.get('/hr/attendance-days', view, c.listDays);
router.get('/hr/attendance-days/:employeeId/:date', view, c.dayDetail);
router.post('/hr/attendance-days/recalculate', view, c.recalculate); // + kiểm hr_all_units trong controller

module.exports = router;
