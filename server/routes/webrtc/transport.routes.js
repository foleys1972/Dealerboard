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
router.post('/transport', async (req, res) => {
  try {
    const { direction = 'sendrecv', groupId } = req.body;
    const targetGroupId = groupId || 'global';
    const scopedGroupId = getScopedGroupId(req, targetGroupId);
    await getOrCreateRouter(scopedGroupId);

    const transport = await createWebRtcTransport(
      scopedGroupId,
      req.user?.id || req.user?.socketId || 'system',
      direction
    );

    res.json({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters,
    });
  } catch (error) {
    logger.error('Failed to create WebRTC transport:', error);
    res.status(500).json({ error: error.message || 'Failed to create transport' });
  }
});

// Connect transport
router.post('/transport/connect', async (req, res) => {
  try {
    const { transportId, dtlsParameters } = req.body;

    await connectTransport(transportId, dtlsParameters);

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to connect transport:', error);
    res.status(500).json({ error: error.message || 'Failed to connect transport' });
  }
});

module.exports = router;
