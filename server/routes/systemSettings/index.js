const express = require('express');
const router = express.Router();

router.use(require('./settings.routes'));
router.use(require('./countries.routes'));
router.use(require('./dialPlans.routes'));
router.use(require('./sipTrunks.routes'));

module.exports = router;
