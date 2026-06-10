const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { requirePlatformAdmin, handleServiceError, actorId } = require('./routeHelpers');
const subscriberService = require('../../services/subscribers/subscriberService');
const portAllocationService = require('../../services/subscribers/portAllocationService');

router.get('/allocations', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await portAllocationService.listAllocationRecords();
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to list allocations');
  }
});

router.get('/', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await subscriberService.listSubscriberRecords();
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get subscribers');
  }
});

router.get('/:subscriberId', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await subscriberService.getSubscriberRecord(req.params.subscriberId);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get subscriber');
  }
});

router.post('/', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await subscriberService.createSubscriberRecord(req.body);
    res.status(result.status).json(result.body);
  } catch (error) {
    handleServiceError(res, error, 'Failed to create subscriber');
  }
});

router.put('/:subscriberId', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await subscriberService.updateSubscriberRecord(req.params.subscriberId, req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to update subscriber');
  }
});

router.delete('/:subscriberId', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await subscriberService.deleteSubscriberRecord(req.params.subscriberId);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to delete subscriber');
  }
});

router.post('/:subscriberId/test', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await subscriberService.testSubscriberConnection(
      req.params.subscriberId,
      req.app.locals.publisherSubscriberService
    );
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to test connection');
  }
});

router.put('/:subscriberId/port', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await portAllocationService.assignPort(
      req.params.subscriberId,
      req.body,
      actorId(req)
    );
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to set port allocation');
  }
});

router.delete('/:subscriberId/port', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await portAllocationService.removePortAllocation(req.params.subscriberId);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to delete port allocation');
  }
});

module.exports = router;
