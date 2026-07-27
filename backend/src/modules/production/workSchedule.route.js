const express = require('express');
const router = express.Router();
const workSchedule = require('./workScheduleController');

router.get('/work-schedules', workSchedule.list);
router.put('/work-schedules', workSchedule.upsert);

module.exports = router;
