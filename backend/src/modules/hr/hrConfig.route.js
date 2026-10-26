// [HR-G1] Module Chấm công — 2026-10-22, CHƯA PHÁT HÀNH (file mới)
const express = require('express');
const router = express.Router();
const { requirePerm, requireAnyPerm } = require('../../core/requireAuth');
const c = require('./hrConfigController');

const view = requirePerm('hr_config:view');
const edit = requirePerm('hr_config:edit');
// [HR-G3] danh mục cần cho màn Phân ca / Ngày công → người có hr_attendance.view cũng đọc được (vẫn lọc phạm vi)
const viewCatalog = requireAnyPerm(['hr_config', 'view'], ['hr_attendance', 'view'], ['hr_leave', 'view']); // [HR-G4] + hr_leave (form tạo đơn nghỉ)

// ---- Cấu hình chấm công (/api/hr/...) ----
router.get('/hr/org-units', viewCatalog, c.listOrgUnits);
router.post('/hr/org-units', edit, c.createOrgUnit);
router.put('/hr/org-units/:id', edit, c.updateOrgUnit);
router.put('/hr/org-units/:id/managers', edit, c.setOrgUnitManagers);
router.get('/hr/assignable-users', edit, c.listAssignableUsers);

router.get('/hr/shifts', viewCatalog, c.listShifts);
router.post('/hr/shifts', edit, c.createShift);
router.put('/hr/shifts/:id', edit, c.updateShift);

router.get('/hr/leave-types', viewCatalog, c.listLeaveTypes); // [HR-G4] form tạo đơn nghỉ cần danh sách loại nghỉ
router.post('/hr/leave-types', edit, c.createLeaveType);
router.put('/hr/leave-types/:id', edit, c.updateLeaveType);

router.get('/hr/holidays', view, c.listHolidays);
router.post('/hr/holidays', edit, c.createHoliday);
router.delete('/hr/holidays/:id', edit, c.deleteHoliday);

router.get('/hr/employees', viewCatalog, c.listEmployees);
router.post('/hr/employees/:id/pin', edit, c.resetPin);
router.post('/hr/employees/:id/pin/unlock', edit, c.unlockPin);
router.put('/hr/employees/:id/org-unit', edit, c.moveEmployeeUnit);

module.exports = router;
