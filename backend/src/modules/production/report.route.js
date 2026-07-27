const express = require('express');
const router = express.Router();
const reportController = require('./reportController');

router.get('/reports/kpi', reportController.kpi);
router.get('/reports/detailed', reportController.detailed);
router.get('/reports/machines', reportController.machines);

module.exports = router;
