const express = require('express');
const router = express.Router();

router.use(require('./auth.routes'));
router.use(require('./meetings.routes'));
router.use(require('./bridge.routes'));

module.exports = router;
