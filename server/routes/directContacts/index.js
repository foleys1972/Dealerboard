const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');

router.use(authenticateToken);
router.use(require('./contacts.routes'));

module.exports = router;
