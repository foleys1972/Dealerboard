const express = require('express');
const router = express.Router();

router.use(require('./ha.routes'));
router.use(require('./travel.routes'));
router.use(require('./subscribers.routes'));
router.use(require('./tenants.routes'));
router.use(require('./server.routes'));

module.exports = router;
