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
