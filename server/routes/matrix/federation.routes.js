const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { getMatrixFederationService } = require('../../services/matrixFederationService');
const { requireAdmin, handleServiceError } = require('./routeHelpers');
const { MatrixRouteError } = require('../../services/matrix/errors');

router.get('/federation/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const federationService = getMatrixFederationService();
    if (!federationService.isInitialized) {
      throw new MatrixRouteError(503, 'Federation service not initialized');
    }
    res.json({ success: true, ...federationService.getFederationStatus() });
  } catch (error) {
    handleServiceError(res, error, 'Failed to get federation status');
  }
});

router.get('/federation/homeservers/:homeserverId/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const federationService = getMatrixFederationService();
    if (!federationService.isInitialized) {
      throw new MatrixRouteError(503, 'Federation service not initialized');
    }
    const status = federationService.getHomeserverFederationStatus(req.params.homeserverId);
    if (!status) throw new MatrixRouteError(404, 'Homeserver not found');
    res.json({ success: true, ...status });
  } catch (error) {
    handleServiceError(res, error, 'Failed to get homeserver federation status');
  }
});

router.post('/federation/reload', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const federationService = getMatrixFederationService();
    if (!federationService.isInitialized) {
      throw new MatrixRouteError(503, 'Federation service not initialized');
    }
    await federationService.reloadFederationConfig();
    res.json({ success: true, message: 'Federation configuration reloaded successfully' });
  } catch (error) {
    handleServiceError(res, error, 'Failed to reload federation configuration');
  }
});

router.post('/federation/rooms/:roomId/verify', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { homeserverId } = req.body;
    if (!homeserverId) throw new MatrixRouteError(400, 'Homeserver ID is required');

    const federationService = getMatrixFederationService();
    if (!federationService.isInitialized) {
      throw new MatrixRouteError(503, 'Federation service not initialized');
    }

    const verification = await federationService.verifyRoomAccess(req.params.roomId, homeserverId);
    res.json({ success: true, ...verification });
  } catch (error) {
    handleServiceError(res, error, 'Failed to verify room access');
  }
});

router.get('/federation/homeservers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const federationService = getMatrixFederationService();
    if (!federationService.isInitialized) {
      throw new MatrixRouteError(503, 'Federation service not initialized');
    }
    const homeservers = federationService.getFederatedHomeservers();
    res.json({ success: true, homeservers, count: homeservers.length });
  } catch (error) {
    handleServiceError(res, error, 'Failed to get federated homeservers');
  }
});

module.exports = router;
