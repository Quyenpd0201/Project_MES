const express = require('express');
const router = express.Router();
const { requirePerm } = require('../../core/requireAuth');
const lookups = require('./lookupController');

router.get('/lookups', lookups.all);
router.get('/next-code/:entity', lookups.nextCode);

module.exports = router;
