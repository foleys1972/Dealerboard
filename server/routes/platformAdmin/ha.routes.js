const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { requirePlatformAdmin, handleServiceError, actorId } = require('./routeHelpers');
const haSiteService = require('../../services/platformAdmin/haSiteService');

router.get('/ha/sites', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await haSiteService.listSites();
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to list HA sites');
  }
});

router.get('/ha/status', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = haSiteService.getHaStatus(req.app?.locals?.subscriberHaService);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to read subscriber HA status');
  }
});

router.delete('/ha/sites/:siteId', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const force = String(req.query?.force || '').toLowerCase() === 'true';
    const result = await haSiteService.deleteSite(req.params.siteId, {
      force,
      updatedBy: actorId(req),
    });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to delete HA site');
  }
});

router.post('/ha/sites', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await haSiteService.upsertSite(req.body, actorId(req));
    res.status(result.status).json(result.body);
  } catch (error) {
    handleServiceError(res, error, 'Failed to upsert HA site');
  }
});

router.get('/ha/sites/:siteId/subscriber-endpoints', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await haSiteService.listSiteSubscriberEndpoints(req.params.siteId);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to list subscriber endpoints');
  }
});

router.post('/ha/sites/:siteId/subscriber-endpoints', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await haSiteService.createSubscriberEndpoint(
      req.params.siteId,
      req.body,
      actorId(req)
    );
    res.status(result.status).json(result.body);
  } catch (error) {
    handleServiceError(res, error, 'Failed to create subscriber endpoint');
  }
});

router.put('/ha/sites/:siteId/subscriber-endpoints/:endpointId', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await haSiteService.updateSubscriberEndpointRecord(
      req.params.siteId,
      req.params.endpointId,
      req.body,
      actorId(req)
    );
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to update subscriber endpoint');
  }
});

router.delete('/ha/sites/:siteId/subscriber-endpoints/:endpointId', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await haSiteService.deleteSubscriberEndpointRecord(
      req.params.siteId,
      req.params.endpointId
    );
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to delete subscriber endpoint');
  }
});

router.get('/ha/failover/sites', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await haSiteService.listFailoverMappings();
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to list site failover mappings');
  }
});

router.post('/ha/failover/sites', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await haSiteService.setFailoverMapping(req.body, actorId(req));
    res.status(result.status).json(result.body);
  } catch (error) {
    handleServiceError(res, error, 'Failed to set site failover mapping');
  }
});

router.post('/ha/failover/sites/revoke', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await haSiteService.revokeFailoverMappingBySource(
      req.body?.sourceSiteId,
      actorId(req)
    );
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to revoke site failover mapping');
  }
});

module.exports = router;
