const express = require('express');
const router = express.Router();
const sessionStore = require('../../services/auth/sessionStore');
const { authenticateToken, generateToken, verifyToken } = require('../../middleware/auth');

router.use(require('./login.routes'));
router.use(require('./session.routes'));
router.use(require('./directory.routes'));
router.use(require('./users.routes'));
router.use(require('./ad.routes'));
router.use(require('./sessions.routes'));

module.exports = {
  router,
  authenticateToken,
  generateToken,
  verifyToken,
  setSocketIO: sessionStore.setSocketIO,
};
