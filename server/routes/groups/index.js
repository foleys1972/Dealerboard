const express = require('express');
const router = express.Router();

router.use(require('./stats.routes'));
router.use(require('./core.routes'));
router.use(require('./audio.routes'));
router.use(require('./broadcast.routes'));
router.use(require('./participants.routes'));
router.use(require('./hoot.routes'));

module.exports = router;
