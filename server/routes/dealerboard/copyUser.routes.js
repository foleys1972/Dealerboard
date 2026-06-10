const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { requireAdmin, handleServiceError } = require('./routeHelpers');
const { prepareUserCopy } = require('../../services/dealerboard/copyUserService');

router.post('/users/:userId/copy', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const result = await prepareUserCopy(req.params.userId, req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to copy user');
  }
});

module.exports = router;
