const express = require('express');
const router = express.Router();

router.use(require('./initiate.routes'));
router.use(require('./answer.routes'));
router.use(require('./lifecycle.routes'));

module.exports = router;
