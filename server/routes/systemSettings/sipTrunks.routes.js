const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { requirePlatformAdmin, handleServiceError } = require('./routeHelpers');
const sipTrunkService = require('../../services/systemSettings/sipTrunkService');
const sipRouteService = require('../../services/systemSettings/sipRouteService');

router.get('/sip-trunks', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await sipTrunkService.listSipTrunkRecords(req.query);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to list SIP trunks');
  }
});

router.post('/sip-trunks', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await sipTrunkService.upsertSipTrunkRecord(req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to save SIP trunk');
  }
});

router.delete('/sip-trunks/:id', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await sipTrunkService.deleteSipTrunk(req.params.id);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to delete SIP trunk');
  }
});

router.get('/sip-routes', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await sipRouteService.listSipRouteRecords(req.query);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to list SIP routes');
  }
});

router.get('/sip-routes/:id', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await sipRouteService.getSipRouteRecord(req.params.id);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get SIP route');
  }
});

router.post('/sip-routes', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await sipRouteService.upsertSipRouteRecord(req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to save SIP route');
  }
});

router.delete('/sip-routes/:id', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await sipRouteService.deleteSipRoute(req.params.id);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to delete SIP route');
  }
});

module.exports = router;
