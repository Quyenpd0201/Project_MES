const express = require('express');
const router = express.Router();
const bom = require('./bomController');

router.get('/boms', bom.list);
router.post('/boms', bom.create);
router.get('/boms/:id', bom.getById);
router.put('/boms/:id', bom.update);
router.delete('/boms/:id', bom.remove);

module.exports = router;
