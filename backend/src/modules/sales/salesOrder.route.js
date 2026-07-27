const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const salesOrders = require('./salesOrderController');

router.get('/customers/:id/orders', salesOrders.byCustomer);
router.get('/sales-orders', salesOrders.list);
router.post('/sales-orders', requirePerm('sales:edit'), salesOrders.create);
router.get('/sales-orders/:id', salesOrders.getById);
router.put('/sales-orders/:id', requirePerm('sales:edit'), salesOrders.update);
router.delete('/sales-orders/:id', requirePerm('sales:edit'), salesOrders.remove);

module.exports = router;
