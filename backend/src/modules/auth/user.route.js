const express = require('express');
const router = express.Router();
const user = require('./userController');

router.get('/users', user.list);
router.post('/users', user.create);
router.get('/users/:id', user.getById);
router.put('/users/:id', user.update);
router.delete('/users/:id', user.remove);

module.exports = router;
