const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { handleServiceError } = require('./routeHelpers');
const speedDialService = require('../../services/dealerboard/speedDialService');

router.get('/speed-dials', authenticateToken, async (req, res) => {
  try {
    const result = await speedDialService.listSpeedDials({
      requesterId: req.user.id || req.user.userId,
      requesterRole: req.user.role,
      queryUserIdRaw: req.query.userId,
    });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get speed dials');
  }
});

router.post('/speed-dials', authenticateToken, async (req, res) => {
  try {
    const result = await speedDialService.createSpeedDial(req.body, {
      requesterId: req.user.id || req.user.userId,
      requesterRole: req.user.role,
    });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to create speed dial');
  }
});

router.put('/speed-dials/:id', authenticateToken, async (req, res) => {
  try {
    const result = await speedDialService.updateSpeedDialRecord(
      req.params.id,
      req.body,
      req.user.id || req.user.userId
    );
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to update speed dial');
  }
});

router.delete('/speed-dials/:id', authenticateToken, async (req, res) => {
  try {
    const result = await speedDialService.deleteSpeedDial(
      req.params.id,
      req.user.id || req.user.userId
    );
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to delete speed dial');
  }
});

module.exports = router;
