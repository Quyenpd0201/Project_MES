const express = require('express');
const router = express.Router();
const techProcess = require('../controllers/processController');

router.get('/processes', techProcess.list);
router.post('/processes', techProcess.create);
router.get('/processes/:id', techProcess.getById);
router.put('/processes/:id', techProcess.update);
router.delete('/processes/:id', techProcess.remove);

module.exports = router;
