const express = require('express');
const router = express.Router();
const { attachAuthMiddleware } = require('./routeHelpers');

attachAuthMiddleware(router);

router.use(require('./debug.routes'));
router.use(require('./rtp.routes'));
router.use(require('./plain.routes'));
router.use(require('./transport.routes'));
router.use(require('./media.routes'));
router.use(require('./legacy.routes'));
router.use(require('./lifecycle.routes'));
router.use(require('./inventory.routes'));
router.use(require('./control.routes'));

module.exports = router;
