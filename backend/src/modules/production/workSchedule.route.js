const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const workSchedule = require('./workScheduleController');

router.get('/work-schedules', workSchedule.list);
router.put('/work-schedules', requirePerm('workschedule:edit'), workSchedule.upsert);
router.put('/work-schedules/bulk', requirePerm('workschedule:edit'), workSchedule.bulkUpsert);

module.exports = router;
