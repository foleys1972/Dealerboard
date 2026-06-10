const express = require('express');
const router = express.Router();
const { authenticateSubscriber, getSocketHandler, handleServiceError } = require('./routeHelpers');
const broadcastService = require('../../services/subscriberApi/broadcastService');

router.post('/broadcast/activate', authenticateSubscriber, async (req, res) => {
  try {
    const result = await broadcastService.activateBroadcast(req.body, getSocketHandler(req));
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to activate broadcast');
  }
});

router.post('/broadcast/join', authenticateSubscriber, async (req, res) => {
  try {
    const result = await broadcastService.joinBroadcast(req.body, getSocketHandler(req));
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to join broadcast');
  }
});

router.post('/broadcast/leave', authenticateSubscriber, async (req, res) => {
  try {
    const result = await broadcastService.leaveBroadcast(req.body, getSocketHandler(req));
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to leave broadcast');
  }
});

router.post('/broadcast/close', authenticateSubscriber, async (req, res) => {
  try {
    const result = await broadcastService.closeBroadcast(req.body, getSocketHandler(req));
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to close broadcast');
  }
});

module.exports = router;
