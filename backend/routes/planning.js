const express = require('express');
const router = express.Router();
const planning = require('../controllers/planningController');

router.get('/planning/from-orders', planning.fromOrders);
router.post('/planning/generate', planning.generate);
router.get('/planning/groups', planning.groups);
router.get('/planning/material-requirements', planning.materialRequirements);

module.exports = router;
