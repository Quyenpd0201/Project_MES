const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const planning = require('./planningController');

router.get('/planning/from-orders', planning.fromOrders);
router.post('/planning/generate', requirePerm('production:edit'), planning.generate);
router.get('/planning/groups', planning.groups);
router.get('/planning/material-requirements', planning.materialRequirements);

module.exports = router;
