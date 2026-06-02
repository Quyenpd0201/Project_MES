// backend/routes/products.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/productController');

router.get('/', ctrl.getProducts);
router.post('/', ctrl.createProduct);
router.get('/:id', ctrl.getProductById);
router.put('/:id', ctrl.updateProduct);
router.delete('/:id', ctrl.softDeleteProduct);

module.exports = router;
