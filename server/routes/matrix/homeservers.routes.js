const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { getOrchestratorService } = require('../../services/orchestratorService');
const { requireAdmin, handleServiceError } = require('./routeHelpers');
const homeserverRegistryService = require('../../services/matrix/homeserverRegistryService');

router.get('/homeservers', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'platform_admin'
      || req.user?.role === 'tenant_admin'
      || req.user?.role === 'admin';
    const result = await homeserverRegistryService.listHomeserverRecords({
      isAdmin,
      userId: req.user.id || req.user.userId,
      region: req.query.region,
      isActive: req.query.isActive,
    });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get homeservers');
  }
});

router.get('/homeservers/old', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await homeserverRegistryService.listHomeserversOld(req.query);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get homeservers');
  }
});

router.get('/homeservers/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await homeserverRegistryService.getHomeserverRecord(req.params.id);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get homeserver');
  }
});

router.post('/homeservers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await homeserverRegistryService.createHomeserver(req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to create homeserver');
  }
});

router.put('/homeservers/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await homeserverRegistryService.updateHomeserverRecord(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to update homeserver');
  }
});

router.delete('/homeservers/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await homeserverRegistryService.deleteHomeserverRecord(req.params.id);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to delete homeserver');
  }
});

router.get('/homeservers/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = homeserverRegistryService.getHomeserverOrchestratorStatus(req.params.id);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get homeserver status');
  }
});

module.exports = router;
