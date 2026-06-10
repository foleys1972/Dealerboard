const express = require('express');
const router = express.Router();

router.use(require('./feed.routes'));

module.exports = router;
