const express = require('express');
const router = express.Router();

router.use(require('./service.routes'));

module.exports = router;
