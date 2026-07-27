const express = require('express');
const router = express.Router();
const salesOrders = require('./salesOrderController');

router.get('/customers/:id/orders', salesOrders.byCustomer);
router.get('/sales-orders', salesOrders.list);
router.post('/sales-orders', salesOrders.create);
router.get('/sales-orders/:id', salesOrders.getById);
router.put('/sales-orders/:id', salesOrders.update);
router.delete('/sales-orders/:id', salesOrders.remove);

module.exports = router;
