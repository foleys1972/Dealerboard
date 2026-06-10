const express = require('express');
const router = express.Router();

router.use(require('./privateWires.routes'));
router.use(require('./ddiLines.routes'));
router.use(require('./lines.routes'));
router.use(require('./speedDials.routes'));
router.use(require('./assignments.routes'));
router.use(require('./preferences.routes'));
router.use(require('./groups.routes'));
router.use(require('./copyUser.routes'));
router.use(require('./lineOperations.routes'));

module.exports = router;
