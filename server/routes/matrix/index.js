const express = require('express');
const router = express.Router();

router.use(require('./chat.routes'));
router.use(require('./homeservers.routes'));
router.use(require('./orchestrator.routes'));
router.use(require('./federation.routes'));
router.use(require('./core.routes'));

module.exports = router;
