const express = require('express');
const router = express.Router();
const auth = require('./authController');

router.post('/login', auth.login);
router.get('/me', auth.me);
router.post('/logout', auth.logout);

module.exports = router;
