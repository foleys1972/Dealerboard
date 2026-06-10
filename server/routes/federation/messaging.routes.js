const express = require('express');
const router = express.Router();
const { federationService } = require('../../services/federationService');
const logger = require('../../utils/logger');
router.post('/send/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const success = await federationService.sendToPeer(serverId, message);
    
    if (success) {
      res.json({
        success: true,
        message: 'Message sent successfully'
      });
    } else {
      res.status(500).json({ error: 'Failed to send message' });
    }
  } catch (error) {
    logger.error('Failed to send message to peer:', error);
    res.status(500).json({ error: 'Failed to send message to peer' });
  }
});

// Broadcast message to all peers
router.post('/broadcast', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const results = await federationService.broadcastToPeers(message);
    
    res.json({
      success: true,
      message: 'Message broadcasted successfully',
      results
    });
  } catch (error) {
    logger.error('Failed to broadcast message:', error);
    res.status(500).json({ error: 'Failed to broadcast message' });
  }
});

module.exports = router;
