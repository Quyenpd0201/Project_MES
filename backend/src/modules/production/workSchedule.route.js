const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const workSchedule = require('./workScheduleController');

router.get('/work-schedules', workSchedule.list);
router.put('/work-schedules', requirePerm('production:edit'), workSchedule.upsert);
router.put('/work-schedules/bulk', requirePerm('production:edit'), workSchedule.bulkUpsert);

module.exports = router;
