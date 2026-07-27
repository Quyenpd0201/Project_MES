const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const techProcess = require('./processController');

router.get('/processes', techProcess.list);
router.post('/processes', requirePerm('engineering:edit'), techProcess.create);
router.get('/processes/:id', techProcess.getById);
router.put('/processes/:id', requirePerm('engineering:edit'), techProcess.update);
router.delete('/processes/:id', requirePerm('engineering:edit'), techProcess.remove);

module.exports = router;
