const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const techProcess = require('./processController');

router.get('/processes', techProcess.list);
router.post('/processes', requirePerm('process:create'), techProcess.create);
router.get('/processes/:id', techProcess.getById);
router.put('/processes/:id', requirePerm('process:edit'), techProcess.update);
router.delete('/processes/:id', requirePerm('process:delete'), techProcess.remove);

module.exports = router;
