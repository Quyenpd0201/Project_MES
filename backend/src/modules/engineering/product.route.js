// backend/routes/products.js
const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const ctrl = require('./productController');

router.get('/', ctrl.getProducts);
router.post('/', requirePerm('engineering:edit'), ctrl.createProduct);
router.post('/import', requirePerm('engineering:edit'), ctrl.bulkImport);
router.get('/:id/related', ctrl.related);
router.get('/:id/attachments', ctrl.listAttachments);
router.post('/:id/attachments', requirePerm('engineering:edit'), ctrl.addAttachment);
router.get('/:id/attachments/:attId/file', ctrl.getAttachmentFile);
router.delete('/:id/attachments/:attId', requirePerm('engineering:edit'), ctrl.deleteAttachment);
router.get('/:id', ctrl.getProductById);
router.put('/:id', requirePerm('engineering:edit'), ctrl.updateProduct);
router.delete('/:id', requirePerm('engineering:edit'), ctrl.softDeleteProduct);

module.exports = router;
