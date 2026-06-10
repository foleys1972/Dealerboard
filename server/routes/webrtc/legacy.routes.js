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
router.post('/producer', async (req, res) => {
  try {
    const { transportId, kind, rtpParameters, appData } = req.body;
    const { createProducer } = require('../services/mediaSoupService');
    
    const router = getRouter();
    if (!router) {
      return res.status(500).json({ error: 'MediaSoup router not initialized' });
    }

    const transport = router.getTransportById(transportId);
    if (!transport) {
      return res.status(404).json({ error: 'Transport not found' });
    }

    const producer = await createProducer(transport, kind, rtpParameters);
    
    res.json({
      id: producer.id,
      kind: producer.kind,
      rtpParameters: producer.rtpParameters,
      appData: producer.appData,
    });
  } catch (error) {
    logger.error('Failed to create producer:', error);
    res.status(500).json({ error: 'Failed to create producer' });
  }
});

router.post('/consumer', async (req, res) => {
  try {
    const { transportId, producerId, rtpCapabilities } = req.body;
    const { createConsumer } = require('../services/mediaSoupService');
    
    const router = getRouter();
    if (!router) {
      return res.status(500).json({ error: 'MediaSoup router not initialized' });
    }

    const transport = router.getTransportById(transportId);
    if (!transport) {
      return res.status(404).json({ error: 'Transport not found' });
    }

    const consumer = await createConsumer(transport, producerId, rtpCapabilities);
    
    res.json({
      id: consumer.id,
      producerId: consumer.producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      appData: consumer.appData,
    });
  } catch (error) {
    logger.error('Failed to create consumer:', error);
    res.status(500).json({ error: 'Failed to create consumer' });
  }
});

module.exports = router;
