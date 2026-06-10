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
router.get('/router/stats', async (req, res) => {
  try {
    const router = getRouter();
    if (!router) {
      return res.status(500).json({ error: 'MediaSoup router not initialized' });
    }

    // mediasoup Router does not implement getStats(); use dump() for diagnostics.
    const dump = await router.dump();
    res.json({
      id: router.id,
      rtpCapabilities: router.rtpCapabilities,
      dump,
    });
  } catch (error) {
    logger.error('Failed to get router stats:', error);
    res.status(500).json({ error: 'Failed to get router stats' });
  }
});

// Get active producers
router.get('/producers', async (req, res) => {
  try {
    const router = getRouter();
    if (!router) {
      return res.status(500).json({ error: 'MediaSoup router not initialized' });
    }

    const producers = router.getProducers();
    const producerList = producers.map(producer => ({
      id: producer.id,
      kind: producer.kind,
      appData: producer.appData,
      score: producer.score,
    }));

    res.json(producerList);
  } catch (error) {
    logger.error('Failed to get producers:', error);
    res.status(500).json({ error: 'Failed to get producers' });
  }
});

// Get active consumers
router.get('/consumers', async (req, res) => {
  try {
    const router = getRouter();
    if (!router) {
      return res.status(500).json({ error: 'MediaSoup router not initialized' });
    }

    const consumers = router.getConsumers();
    const consumerList = consumers.map(consumer => ({
      id: consumer.id,
      producerId: consumer.producerId,
      kind: consumer.kind,
      appData: consumer.appData,
      score: consumer.score,
    }));

    res.json(consumerList);
  } catch (error) {
    logger.error('Failed to get consumers:', error);
    res.status(500).json({ error: 'Failed to get consumers' });
  }
});

module.exports = router;
