const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { requirePlatformAdmin, handleServiceError } = require('./routeHelpers');
const settingsService = require('../../services/systemSettings/settingsService');
const { requestServerRestart } = require('../../services/platformAdmin/serverControlService');
const logger = require('../../utils/logger');

router.post('/server/restart', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tradingIntercomServer = req.app?.locals?.tradingIntercomServer;
    const result = await requestServerRestart(tradingIntercomServer);
    logger.warn('Server restart requested via admin UI', {
      actor: req.user?.username || req.user?.id || 'system',
      spawnChild: result.spawnChild,
    });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to restart server');
  }
});

router.get('/settings', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await settingsService.getSettings(req.user);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get system settings');
  }
});

router.put('/settings', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await settingsService.updateSettings(req.user, req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to update system settings');
  }
});

router.post('/archive-rooms', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await settingsService.archiveRooms(req.user);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to archive rooms');
  }
});

module.exports = router;
