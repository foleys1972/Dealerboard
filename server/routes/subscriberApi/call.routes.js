const express = require('express');
const router = express.Router();
const { authenticateSubscriber, handleServiceError } = require('./routeHelpers');
const callService = require('../../services/subscriberApi/callService');

router.post('/call/initiate', authenticateSubscriber, async (req, res) => {
  try {
    const result = await callService.initiateCall(req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to initiate call');
  }
});

router.post('/call/answer', authenticateSubscriber, async (req, res) => {
  try {
    const result = await callService.answerCall(req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to answer call');
  }
});

module.exports = router;
