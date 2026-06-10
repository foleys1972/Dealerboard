const express = require('express');
const router = express.Router();

router.use(require('./grid.routes'));
router.use(require('./broadcast.routes'));
router.use(require('./config.routes'));

module.exports = router;
