const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { requirePlatformAdmin, handleServiceError } = require('./routeHelpers');
const subscriberAgentService = require('../../services/platformAdmin/subscriberAgentService');

router.post('/subscribers/:subscriberId/agent/service', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await subscriberAgentService.forwardAgentServiceControl(
      req.params.subscriberId,
      req.body
    );
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Agent request failed');
  }
});

module.exports = router;
