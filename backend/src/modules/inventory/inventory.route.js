const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const inventory = require('./inventoryController');

router.get('/inventory', inventory.list);
router.get('/inventory/tree', inventory.tree);
router.get('/inventory/detail', inventory.stockDetail);
router.get('/inventory/transactions', inventory.transactions);
router.post('/inventory/adjust', inventory.adjust);
router.post('/inventory/stock', requirePerm('inv_adjust:create'), inventory.addStockLine);
router.delete('/inventory/stock/:id', requirePerm('inv_adjust:create'), inventory.deleteStockLine);

// Phiếu xuất kho (Chờ xuất → Đã xuất)
router.get('/outbound-slips', inventory.listOutboundSlips);
router.get('/outbound-slips/:id', inventory.getOutboundSlip);
router.post('/outbound-slips/:id/confirm', requirePerm('inv_outbound:create'), inventory.confirmOutboundSlip);
router.post('/outbound-slips/:id/cancel', requirePerm('inv_outbound:create'), inventory.cancelOutboundSlip);

module.exports = router;
