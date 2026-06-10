const express = require('express');
const router = express.Router();

router.use(require('./settings.routes'));
router.use(require('./subTenants.routes'));
router.use(require('./users.routes'));
router.use(require('./relationships.routes'));

module.exports = router;
