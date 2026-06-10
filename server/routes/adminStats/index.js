const express = require('express');
const router = express.Router();

router.use(require('./health.routes'));
router.use(require('./stats.routes'));
router.use(require('./healthCheck.routes'));
router.use(require('./sipHa.routes'));

module.exports = router;
