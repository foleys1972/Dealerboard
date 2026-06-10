const express = require('express');
const router = express.Router();

router.use(require('./call.routes'));
router.use(require('./group.routes'));
router.use(require('./broadcast.routes'));

module.exports = router;
