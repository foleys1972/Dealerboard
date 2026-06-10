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
router.get('/rtp-capabilities', async (req, res) => {
  try {
    const router = getRouter();
    if (!router) {
      // Return a basic RTP capabilities response for fallback mode
      return res.json({
        codecs: [],
        headerExtensions: [],
        fecMechanisms: []
      });
    }

    const rtpCapabilities = router.rtpCapabilities;
    res.json(rtpCapabilities);
  } catch (error) {
    logger.error('Failed to get RTP capabilities:', error);
    // Return fallback response instead of error
    res.json({
      codecs: [],
      headerExtensions: [],
      fecMechanisms: []
    });
  }
});

// Get scoped group router RTP capabilities
router.get('/groups/:groupId/rtp-capabilities', async (req, res) => {
  try {
    const { groupId } = req.params;
    const targetGroupId = groupId || 'global';
    const scopedGroupId = getScopedGroupId(req, targetGroupId);

    await getOrCreateRouter(scopedGroupId);
    const rtpCapabilities = getRouterRtpCapabilities(scopedGroupId);

    res.json(rtpCapabilities || { codecs: [], headerExtensions: [], fecMechanisms: [] });
  } catch (error) {
    logger.error('Failed to get group RTP capabilities:', error);
    res.json({ codecs: [], headerExtensions: [], fecMechanisms: [] });
  }
});

// Create a producer from a PlainTransport RTP stream (WPF uplink).

module.exports = router;
