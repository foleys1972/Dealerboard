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
router.post('/produce', async (req, res) => {
  try {
    const { transportId, kind, rtpParameters, appData = {}, groupId } = req.body;
    const targetGroupId = groupId || appData.groupId || 'global';
    const scopedGroupId = getScopedGroupId(req, targetGroupId);

    const producer = await produceMedia(transportId, kind, rtpParameters, {
      ...appData,
      groupId: scopedGroupId,
      userId: req.user?.id,
    });

    res.json({
      id: producer.id,
    });
  } catch (error) {
    logger.error('Failed to produce:', error);
    res.status(500).json({ error: error.message || 'Failed to produce media' });
  }
});


router.post('/consume', async (req, res) => {
  try {
    const { transportId, producerId, rtpCapabilities, groupId } = req.body;
    const targetGroupId = groupId || 'global';
    const scopedGroupId = getScopedGroupId(req, targetGroupId);
    await getOrCreateRouter(scopedGroupId);

    const consumer = await createConsumer(scopedGroupId, transportId, producerId, rtpCapabilities);

    res.json({
      id: consumer.id,
      producerId: consumer.producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    });
  } catch (error) {
    logger.error('Failed to consume:', error);
    res.status(500).json({ error: error.message || 'Failed to consume media' });
  }
});

router.get('/groups/:groupId/producers', async (req, res) => {
  try {
    const { groupId } = req.params;
    const scopedGroupId = getScopedGroupId(req, groupId);
    await getOrCreateRouter(scopedGroupId);
    const list = getProducersByGroup(scopedGroupId);
    res.json({ success: true, producers: list });
  } catch (error) {
    logger.error('Failed to list group producers:', error);
    res.status(500).json({ error: error.message || 'Failed to list producers' });
  }
});

module.exports = router;
