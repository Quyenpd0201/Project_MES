const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const deliveries = require('./deliveryController');

router.get('/deliveries', deliveries.list);
router.post('/deliveries', requirePerm('sales:edit'), deliveries.create);
router.get('/deliveries/from-order/:orderId', deliveries.fromOrder);
router.get('/deliveries/:id', deliveries.getById);
router.put('/deliveries/:id', requirePerm('sales:edit'), deliveries.update);
router.delete('/deliveries/:id', requirePerm('sales:edit'), deliveries.remove);

module.exports = router;
