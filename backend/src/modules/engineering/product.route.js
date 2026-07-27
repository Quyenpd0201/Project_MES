// backend/routes/products.js
const express = require('express');
const router = express.Router();
const ctrl = require('./productController');

router.get('/', ctrl.getProducts);
router.post('/', ctrl.createProduct);
router.post('/import', ctrl.bulkImport);
router.get('/:id/related', ctrl.related);
router.get('/:id/attachments', ctrl.listAttachments);
router.post('/:id/attachments', ctrl.addAttachment);
router.get('/:id/attachments/:attId/file', ctrl.getAttachmentFile);
router.delete('/:id/attachments/:attId', ctrl.deleteAttachment);
router.get('/:id', ctrl.getProductById);
router.put('/:id', ctrl.updateProduct);
router.delete('/:id', ctrl.softDeleteProduct);

module.exports = router;
