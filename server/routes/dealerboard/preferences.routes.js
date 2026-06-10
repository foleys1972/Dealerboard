const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { handleServiceError } = require('./routeHelpers');
const { updatePreferences, getPreferences } = require('../../services/dealerboard/preferencesService');

function preferenceContext(req, paramUserId = null) {
  return {
    paramUserId,
    requestingUserId: req.user.id || req.user.userId,
    requesterRole: req.user.role,
  };
}

router.put('/preferences/:userId', authenticateToken, async (req, res) => {
  try {
    const result = await updatePreferences(req.body, preferenceContext(req, req.params.userId));
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to update preferences');
  }
});

router.put('/preferences', authenticateToken, async (req, res) => {
  try {
    const result = await updatePreferences(req.body, preferenceContext(req));
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to update preferences');
  }
});

router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    const result = await getPreferences(req.user.id || req.user.userId);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get preferences');
  }
});

module.exports = router;
