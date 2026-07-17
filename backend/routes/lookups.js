const express = require('express');
const router = express.Router();
const lookups = require('../controllers/lookupController');

router.get('/lookups', lookups.all);
router.get('/next-code/:entity', lookups.nextCode);

module.exports = router;
