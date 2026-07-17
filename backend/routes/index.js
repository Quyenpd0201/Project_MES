const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');

// ---- Public Routes ----
router.use('/auth', require('./auth'));

// ========================================================
// Toàn bộ route bên dưới yêu cầu xác thực hợp lệ
// ========================================================
router.use(requireAuth);

router.use('/', require('./masterData'));
router.use('/', require('./roles'));
router.use('/', require('./users'));
router.use('/', require('./workSchedules'));
router.use('/', require('./salesOrders'));
router.use('/', require('./deliveries'));
router.use('/', require('./production'));
router.use('/', require('./processes'));
router.use('/', require('./boms'));
router.use('/', require('./planning'));
router.use('/', require('./inventory'));
router.use('/', require('./dashboard'));
router.use('/', require('./lookups'));

module.exports = router;
