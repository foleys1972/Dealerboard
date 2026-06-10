const express = require('express');
const router = express.Router();

router.use(require('./locations.routes'));

module.exports = router;
