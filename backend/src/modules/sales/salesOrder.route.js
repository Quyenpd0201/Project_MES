const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const salesOrders = require('./salesOrderController');

const importCtrl = require('./importController');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/customers/:id/orders', salesOrders.byCustomer);
router.get('/sales-orders', salesOrders.list);
router.post('/sales-orders', requirePerm('sales:edit'), salesOrders.create);
router.get('/sales-orders/:id', salesOrders.getById);
router.put('/sales-orders/:id', requirePerm('sales:edit'), salesOrders.update);
router.delete('/sales-orders/:id', requirePerm('sales:edit'), salesOrders.remove);

// Upload Excel
router.post('/import/orders', requirePerm('sales:edit'), upload.single('file'), importCtrl.importOrders);

module.exports = router;
