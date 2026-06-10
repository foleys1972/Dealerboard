const express = require('express');
const router = express.Router();
const {
  getRouter,
  getWorker,
  createGroupRouter,
  getOrCreateRouter,
  createWebRtcTransport,
  createPlainTransport,
  getTransportById,
  connectTransport,
  produceMedia,
  createConsumer,
  getRouterRtpCapabilities,
  getProducersByGroup,
  getGroupRouter,
  listGroupRouterIds,
  getSFUStats,
} = require('../../services/mediaSoupService');
const { audioRecordingService } = require('../../services/audioRecordingService');
const logger = require('../../utils/logger');
const { getScopedGroupId } = require('./routeHelpers');
router.get('/routers', async (req, res) => {
  try {
    const ids = listGroupRouterIds ? listGroupRouterIds() : [];
    res.json({
      count: ids.length,
      groupRouterIds: ids,
    });
  } catch (error) {
    logger.error('Failed to list routers:', error);
    res.status(500).json({ error: 'Failed to list routers' });
  }
});

// Debug: show which Node/mediasoup instance this request is hitting.
router.get('/sfu/stats', async (req, res) => {
  try {
    const stats = getSFUStats ? await getSFUStats() : { error: 'getSFUStats not available' };
    res.json({
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      now: new Date().toISOString(),
      stats,
    });
  } catch (error) {
    logger.error('Failed to get SFU stats:', error);
    res.status(500).json({ error: 'Failed to get SFU stats' });
  }
});

// Debug: dump the group-scoped router (active call router lives here).
// NOTE: when auth is bypassed, groupId must be passed as the already-scoped id (tenant:subtenant:callId)
// because req.user is not available.
router.get('/groups/:groupId/router/dump', async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!groupId) {
      return res.status(400).json({ error: 'groupId is required' });
    }

    const scopedGroupId = req.user ? getScopedGroupId(req, groupId) : groupId;
    const routerForGroup = getGroupRouter(scopedGroupId);
    if (!routerForGroup) {
      return res.status(404).json({ error: `Router not found for group ${scopedGroupId}` });
    }

    const dump = await routerForGroup.dump();
    res.json({
      groupId: scopedGroupId,
      id: routerForGroup.id,
      rtpCapabilities: routerForGroup.rtpCapabilities,
      dump,
    });
  } catch (error) {
    logger.error('Failed to dump group router:', error);
    res.status(500).json({ error: 'Failed to dump group router' });
  }
});

module.exports = router;
