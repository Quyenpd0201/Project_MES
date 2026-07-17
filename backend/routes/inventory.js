const express = require('express');
const router = express.Router();
const inventory = require('../controllers/inventoryController');

router.get('/inventory', inventory.list);
router.get('/inventory/tree', inventory.tree);
router.get('/inventory/detail', inventory.stockDetail);
router.get('/inventory/transactions', inventory.transactions);
router.post('/inventory/adjust', inventory.adjust);
router.post('/inventory/stock', inventory.addStockLine);
router.delete('/inventory/stock/:id', inventory.deleteStockLine);

module.exports = router;
