const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const inventory = require('./inventoryController');

router.get('/inventory', inventory.list);
router.get('/inventory/tree', inventory.tree);
router.get('/inventory/detail', inventory.stockDetail);
router.get('/inventory/transactions', inventory.transactions);
router.post('/inventory/adjust', requirePerm('inv_adjust:create'), inventory.adjust);
router.post('/inventory/stock', requirePerm('inv_adjust:create'), inventory.addStockLine);
router.delete('/inventory/stock/:id', requirePerm('inv_adjust:create'), inventory.deleteStockLine);

module.exports = router;
