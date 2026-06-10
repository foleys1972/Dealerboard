const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { requirePlatformAdmin, handleServiceError, actorId } = require('./routeHelpers');
const travelOverrideService = require('../../services/platformAdmin/travelOverrideService');

router.get('/travel-overrides', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await travelOverrideService.listOverrides(req.query);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to list travel overrides');
  }
});

router.post('/travel-overrides', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await travelOverrideService.createOverride(req.body, actorId(req));
    res.status(result.status).json(result.body);
  } catch (error) {
    handleServiceError(res, error, 'Failed to create travel override');
  }
});

router.post('/travel-overrides/:id/revoke', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await travelOverrideService.revokeOverride(req.params.id, actorId(req));
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to revoke travel override');
  }
});

module.exports = router;
