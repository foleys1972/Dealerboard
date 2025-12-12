const express = require('express');
const router = express.Router();
const {
  getRouter,
  getWorker,
  createGroupRouter,
  createWebRtcTransport,
  connectTransport,
  produceMedia,
  createConsumer,
  getProducersByGroup,
} = require('../services/mediaSoupService');
const { audioRecordingService } = require('../services/audioRecordingService');
const logger = require('../utils/logger');
const { authenticateToken } = require('./authRoutes');

router.use(authenticateToken);

// Get router RTP capabilities
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

// Create WebRTC transport
router.post('/transport', async (req, res) => {
  try {
    const { direction = 'sendrecv', groupId } = req.body;
    const targetGroupId = groupId || 'global';
    await createGroupRouter(targetGroupId);

    const transport = await createWebRtcTransport(
      targetGroupId,
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

// Create producer (produce audio/video)
router.post('/produce', async (req, res) => {
  try {
    const { transportId, kind, rtpParameters, appData = {}, groupId } = req.body;
    const targetGroupId = groupId || appData.groupId || 'global';

    const producer = await produceMedia(transportId, kind, rtpParameters, {
      ...appData,
      groupId: targetGroupId,
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

// Legacy producer endpoint (keep for compatibility)
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

// Consume audio/video
router.post('/consume', async (req, res) => {
  try {
    const { transportId, producerId, rtpCapabilities, groupId } = req.body;
    const targetGroupId = groupId || 'global';
    await createGroupRouter(targetGroupId);

    const consumer = await createConsumer(targetGroupId, transportId, producerId, rtpCapabilities);

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
    await createGroupRouter(groupId);
    const list = getProducersByGroup(groupId);
    res.json({ success: true, producers: list });
  } catch (error) {
    logger.error('Failed to list group producers:', error);
    res.status(500).json({ error: error.message || 'Failed to list producers' });
  }
});

// Legacy consumer endpoint (keep for compatibility)
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

// Get producer stats
router.get('/producer/:producerId/stats', async (req, res) => {
  try {
    const { producerId } = req.params;
    const { getProducerStats } = require('../services/mediaSoupService');
    
    const stats = await getProducerStats(producerId);
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get producer stats:', error);
    res.status(500).json({ error: 'Failed to get producer stats' });
  }
});

// Get consumer stats
router.get('/consumer/:consumerId/stats', async (req, res) => {
  try {
    const { consumerId } = req.params;
    const { getConsumerStats } = require('../services/mediaSoupService');
    
    const stats = await getConsumerStats(consumerId);
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get consumer stats:', error);
    res.status(500).json({ error: 'Failed to get consumer stats' });
  }
});

// Close transport
router.delete('/transport/:transportId', async (req, res) => {
  try {
    const { transportId } = req.params;
    const { closeTransport } = require('../services/mediaSoupService');
    
    closeTransport(transportId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to close transport:', error);
    res.status(500).json({ error: 'Failed to close transport' });
  }
});

// Close producer
router.delete('/producer/:producerId', async (req, res) => {
  try {
    const { producerId } = req.params;
    const { closeProducer } = require('../services/mediaSoupService');
    
    closeProducer(producerId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to close producer:', error);
    res.status(500).json({ error: 'Failed to close producer' });
  }
});

// Close consumer
router.delete('/consumer/:consumerId', async (req, res) => {
  try {
    const { consumerId } = req.params;
    const { closeConsumer } = require('../services/mediaSoupService');
    
    closeConsumer(consumerId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to close consumer:', error);
    res.status(500).json({ error: 'Failed to close consumer' });
  }
});

// Get router stats
router.get('/router/stats', async (req, res) => {
  try {
    const router = getRouter();
    if (!router) {
      return res.status(500).json({ error: 'MediaSoup router not initialized' });
    }

    const stats = await router.getStats();
    res.json(stats);
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

// Pause producer
router.post('/producer/:producerId/pause', async (req, res) => {
  try {
    const { producerId } = req.params;
    const router = getRouter();
    
    if (!router) {
      return res.status(500).json({ error: 'MediaSoup router not initialized' });
    }

    const producer = router.getProducerById(producerId);
    if (!producer) {
      return res.status(404).json({ error: 'Producer not found' });
    }

    await producer.pause();
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to pause producer:', error);
    res.status(500).json({ error: 'Failed to pause producer' });
  }
});

// Resume producer
router.post('/producer/:producerId/resume', async (req, res) => {
  try {
    const { producerId } = req.params;
    const router = getRouter();
    
    if (!router) {
      return res.status(500).json({ error: 'MediaSoup router not initialized' });
    }

    const producer = router.getProducerById(producerId);
    if (!producer) {
      return res.status(404).json({ error: 'Producer not found' });
    }

    await producer.resume();
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to resume producer:', error);
    res.status(500).json({ error: 'Failed to resume producer' });
  }
});

// Pause consumer
router.post('/consumer/:consumerId/pause', async (req, res) => {
  try {
    const { consumerId } = req.params;
    const router = getRouter();
    
    if (!router) {
      return res.status(500).json({ error: 'MediaSoup router not initialized' });
    }

    const consumer = router.getConsumerById(consumerId);
    if (!consumer) {
      return res.status(404).json({ error: 'Consumer not found' });
    }

    await consumer.pause();
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to pause consumer:', error);
    res.status(500).json({ error: 'Failed to pause consumer' });
  }
});

// Resume consumer
router.post('/consumer/:consumerId/resume', async (req, res) => {
  try {
    const { consumerId } = req.params;
    const router = getRouter();
    
    if (!router) {
      return res.status(500).json({ error: 'MediaSoup router not initialized' });
    }

    const consumer = router.getConsumerById(consumerId);
    if (!consumer) {
      return res.status(404).json({ error: 'Consumer not found' });
    }

    await consumer.resume();
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to resume consumer:', error);
    res.status(500).json({ error: 'Failed to resume consumer' });
  }
});

// Set producer priority
router.post('/producer/:producerId/priority', async (req, res) => {
  try {
    const { producerId } = req.params;
    const { priority } = req.body;
    const router = getRouter();
    
    if (!router) {
      return res.status(500).json({ error: 'MediaSoup router not initialized' });
    }

    const producer = router.getProducerById(producerId);
    if (!producer) {
      return res.status(404).json({ error: 'Producer not found' });
    }

    await producer.setPriority(priority);
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to set producer priority:', error);
    res.status(500).json({ error: 'Failed to set producer priority' });
  }
});

// Set consumer priority
router.post('/consumer/:consumerId/priority', async (req, res) => {
  try {
    const { consumerId } = req.params;
    const { priority } = req.body;
    const router = getRouter();
    
    if (!router) {
      return res.status(500).json({ error: 'MediaSoup router not initialized' });
    }

    const consumer = router.getConsumerById(consumerId);
    if (!consumer) {
      return res.status(404).json({ error: 'Consumer not found' });
    }

    await consumer.setPriority(priority);
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to set consumer priority:', error);
    res.status(500).json({ error: 'Failed to set consumer priority' });
  }
});

module.exports = router;
