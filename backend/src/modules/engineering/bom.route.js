const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const bom = require('./bomController');

router.get('/boms', bom.list);
router.post('/boms', requirePerm('engineering:edit'), bom.create);
router.get('/boms/:id', bom.getById);
router.put('/boms/:id', requirePerm('engineering:edit'), bom.update);
router.delete('/boms/:id', requirePerm('engineering:edit'), bom.remove);

module.exports = router;
