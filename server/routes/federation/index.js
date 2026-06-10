const express = require('express');
const router = express.Router();
const { requireFederationOrPlatformAdmin } = require('../../middleware/auth');
router.use(requireFederationOrPlatformAdmin);

router.use(require('./peers.routes'));
router.use(require('./sync.routes'));
router.use(require('./messaging.routes'));
router.use(require('./admin.routes'));

module.exports = router;
