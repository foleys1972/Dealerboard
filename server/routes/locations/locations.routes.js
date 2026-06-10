const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { requirePlatformAdmin, handleServiceError, actorId } = require('./routeHelpers');
const locationService = require('../../services/locations/locationService');

router.get('/', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await locationService.listLocationRecords();
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to list locations');
  }
});

router.get('/:id/subscriber-assignment', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await locationService.getSubscriberAssignment(req.params.id);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get subscriber assignment');
  }
});

router.put('/:id/subscriber-assignment', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await locationService.setSubscriberAssignment(
      req.params.id,
      req.body,
      actorId(req)
    );
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to set subscriber assignment');
  }
});

router.post('/', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await locationService.createLocation(req.body);
    res.status(result.status).json(result.body);
  } catch (error) {
    handleServiceError(res, error, 'Failed to create location');
  }
});

router.put('/:id', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await locationService.updateLocationRecord(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to update location');
  }
});

router.post('/:id/test-archive', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await locationService.testArchiveDestination(req.params.id);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to test archive destination');
  }
});

router.delete('/:id', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await locationService.deleteLocation(req.params.id);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to delete location');
  }
});

router.get('/:id/users', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await locationService.listLocationUsers(req.params.id);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to list location users');
  }
});

router.post('/:id/assign-users', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await locationService.assignUsers(req.params.id, req.body?.userIds);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to assign users to location');
  }
});

module.exports = router;
