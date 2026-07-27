const express = require('express');
const router = express.Router();
const deliveries = require('./deliveryController');

router.get('/deliveries', deliveries.list);
router.post('/deliveries', deliveries.create);
router.get('/deliveries/from-order/:orderId', deliveries.fromOrder);
router.get('/deliveries/:id', deliveries.getById);
router.put('/deliveries/:id', deliveries.update);
router.delete('/deliveries/:id', deliveries.remove);

module.exports = router;
