const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const user = require('./userController');

router.get('/users', user.list);
router.post('/users', requirePerm('sys:users:manage'), user.create);
router.get('/users/:id', user.getById);
router.put('/users/:id', requirePerm('sys:users:manage'), user.update);
router.delete('/users/:id', requirePerm('sys:users:manage'), user.remove);

module.exports = router;
