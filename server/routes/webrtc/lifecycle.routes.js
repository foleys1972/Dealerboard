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
router.get('/producer/:producerId/stats', async (req, res) => {
  try {
    const { producerId } = req.params;
    const { getProducerStats } = require('../services/mediaSoupService');
    
    const stats = await getProducerStats(producerId);
    if (!stats) {
      return res.status(404).json({ error: 'Producer not found' });
    }
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
    if (!stats) {
      return res.status(404).json({ error: 'Consumer not found' });
    }
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

module.exports = router;
