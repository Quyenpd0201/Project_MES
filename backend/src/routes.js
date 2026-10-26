const express = require('express');
const router = express.Router();
const requireAuth = require('./core/requireAuth');

// ---- Public Routes ----
router.use('/auth', require('./modules/auth/auth.route'));
router.use('/', require('./modules/hr/kiosk.route')); // [HR-G2] kiosk + ảnh ký có hạn (public) — 2026-10-23, CHƯA PHÁT HÀNH

// ========================================================
// Toàn bộ route bên dưới yêu cầu xác thực hợp lệ
// ========================================================
router.use(requireAuth);

router.use('/', require('./modules/masterData/masterData.route'));
router.use('/', require('./modules/auth/role.route'));
router.use('/', require('./modules/auth/user.route'));
router.use('/', require('./modules/production/workSchedule.route'));
router.use('/', require('./modules/sales/salesOrder.route'));
router.use('/', require('./modules/sales/delivery.route'));
router.use('/', require('./modules/sales/payment.route'));
router.use('/', require('./modules/production/production.route'));
router.use('/', require('./modules/engineering/process.route'));
router.use('/', require('./modules/engineering/bom.route'));
router.use('/', require('./modules/production/planning.route'));
router.use('/', require('./modules/inventory/inventory.route'));
router.use('/', require('./modules/production/dashboard.route'));
router.use('/', require('./modules/production/report.route'));
router.use('/', require('./modules/recycling/recycling.route'));
router.use('/', require('./modules/masterData/lookup.route'));
router.use('/', require('./modules/hr/hrConfig.route')); // [HR-G1] Chấm công — 2026-10-22, CHƯA PHÁT HÀNH
router.use('/', require('./modules/hr/hrAttendance.route')); // [HR-G2] tablet, lần chấm, ảnh — 2026-10-23, CHƯA PHÁT HÀNH
router.use('/', require('./modules/hr/hrLeave.route')); // [HR-G4] đơn nghỉ, số dư, thông báo — 2026-10-26, CHƯA PHÁT HÀNH
router.use('/', require('./modules/hr/hrWorkday.route')); // [HR-G3] phân ca, duyệt, sửa công, ngày công — 2026-10-23, CHƯA PHÁT HÀNH
router.use('/', require('./modules/hr/hrReport.route')); // [HR-G5] bảng công, bất thường, Excel, chốt công — 2026-10-26, CHƯA PHÁT HÀNH

module.exports = router;

