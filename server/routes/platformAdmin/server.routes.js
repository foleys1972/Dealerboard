const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { requirePlatformAdmin, handleServiceError, actorId } = require('./routeHelpers');
const { requestServerRestart } = require('../../services/platformAdmin/serverControlService');
const logger = require('../../utils/logger');

router.post('/server/restart', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tradingIntercomServer = req.app?.locals?.tradingIntercomServer;
    const result = await requestServerRestart(tradingIntercomServer);
    logger.warn('Server restart requested via admin UI', { actor: actorId(req), spawnChild: result.spawnChild });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to restart server');
  }
});

module.exports = router;
