const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { handleServiceError } = require('./routeHelpers');
const {
  getDealerboardConfig,
  setButtonAssignment,
  removeButtonAssignment,
} = require('../../services/dealerboard/assignmentService');

router.get('/config/:userId', authenticateToken, async (req, res) => {
  try {
    const result = await getDealerboardConfig({
      userIdRaw: req.params.userId,
      requestingUserIdRaw: req.user.id || req.user.userId,
      requesterRole: req.user.role,
    });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get dealerboard config');
  }
});

router.post('/assignments', authenticateToken, async (req, res) => {
  try {
    const result = await setButtonAssignment(req.body, {
      id: req.user.id,
      userId: req.user.userId,
      role: req.user.role,
    });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to set button assignment');
  }
});

router.delete('/assignments/:userId/:pageNumber/:buttonNumber', authenticateToken, async (req, res) => {
  try {
    const result = await removeButtonAssignment({
      targetUserIdRaw: req.params.userId,
      requestingUserIdRaw: req.user.id || req.user.userId,
      requesterRole: req.user.role,
      pageNumber: parseInt(req.params.pageNumber, 10),
      buttonNumber: parseInt(req.params.buttonNumber, 10),
      applyToGroup: req.query.applyToGroup,
    });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to remove button assignment');
  }
});

module.exports = router;
