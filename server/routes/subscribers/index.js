const express = require('express');
const router = express.Router();

router.use(require('./subscribers.routes'));

module.exports = router;
