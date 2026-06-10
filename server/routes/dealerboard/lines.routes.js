const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { handleServiceError } = require('./routeHelpers');
const {
  getAvailableLines,
  resolveAor,
  getBusyStatus,
  updateCallForward,
} = require('../../services/dealerboard/linesService');

router.get('/lines', authenticateToken, async (req, res) => {
  try {
    const result = await getAvailableLines();
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get available lines');
  }
});

router.get('/lines/resolve', authenticateToken, async (req, res) => {
  try {
    const result = await resolveAor(req.query?.aor);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to resolve AOR');
  }
});

router.get('/lines/busy-status', authenticateToken, async (req, res) => {
  try {
    const result = await getBusyStatus({
      requestingUserIdRaw: req.user.id || req.user.userId,
      targetUserIdRaw: req.query.userId,
      requesterRole: req.user.role,
    });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get busy status');
  }
});

router.put('/lines/call-forward', authenticateToken, async (req, res) => {
  try {
    const result = await updateCallForward(req.body, req.user.role);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to update line call forward');
  }
});

module.exports = router;
