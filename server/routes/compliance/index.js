const express = require('express');
const router = express.Router();
const { authenticateToken, requirePlatformAdmin } = require('../../middleware/auth');
router.use(authenticateToken, requirePlatformAdmin);

router.use(require('./status.routes'));
router.use(require('./actions.routes'));
router.use(require('./encryption.routes'));
router.use(require('./export.routes'));

module.exports = router;
