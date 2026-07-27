const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const inventory = require('./inventoryController');

router.get('/inventory', inventory.list);
router.get('/inventory/tree', inventory.tree);
router.get('/inventory/detail', inventory.stockDetail);
router.get('/inventory/transactions', inventory.transactions);
router.post('/inventory/adjust', requirePerm('inventory:edit'), inventory.adjust);
router.post('/inventory/stock', requirePerm('inventory:edit'), inventory.addStockLine);
router.delete('/inventory/stock/:id', requirePerm('inventory:edit'), inventory.deleteStockLine);

module.exports = router;
