const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { requirePlatformAdmin, handleServiceError } = require('./routeHelpers');
const countryService = require('../../services/systemSettings/countryService');

router.get('/countries', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await countryService.listCountryRecords();
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to list countries');
  }
});

router.post('/countries', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await countryService.upsertCountryRecord(req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to upsert country');
  }
});

router.delete('/countries/:code', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await countryService.deleteCountry(req.params.code);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to delete country');
  }
});

module.exports = router;
