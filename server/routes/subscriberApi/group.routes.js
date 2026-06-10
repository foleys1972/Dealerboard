const express = require('express');
const router = express.Router();
const { authenticateSubscriber, getSocketHandler, handleServiceError } = require('./routeHelpers');
const groupCallService = require('../../services/subscriberApi/groupCallService');

router.post('/group/initiate', authenticateSubscriber, async (req, res) => {
  try {
    const result = await groupCallService.initiateGroupCall(req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to initiate group call');
  }
});

router.post('/group/answer', authenticateSubscriber, async (req, res) => {
  try {
    const result = await groupCallService.answerGroupCall(req.body, getSocketHandler(req));
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to answer group call');
  }
});

router.post('/group/cancel', authenticateSubscriber, async (req, res) => {
  try {
    const result = await groupCallService.cancelGroupCall(req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to cancel group call');
  }
});

router.get('/group/status/:sessionId', authenticateSubscriber, async (req, res) => {
  try {
    const result = await groupCallService.getGroupCallStatus(req.params.sessionId);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get group call status');
  }
});

module.exports = router;
