const express = require('express');
const router = express.Router();
const { federationService } = require('../../services/federationService');
const logger = require('../../utils/logger');
router.get('/status', async (req, res) => {
  try {
    const status = federationService.getStatus();
    res.json({
      success: true,
      status
    });
  } catch (error) {
    logger.error('Failed to get federation status:', error);
    res.status(500).json({ error: 'Failed to get federation status' });
  }
});

// Get federation peers
router.get('/peers', async (req, res) => {
  try {
    const status = federationService.getStatus();
    res.json({
      success: true,
      peers: status.peers,
      totalPeers: status.totalPeers,
      connectedPeers: status.connectedPeers
    });
  } catch (error) {
    logger.error('Failed to get federation peers:', error);
    res.status(500).json({ error: 'Failed to get federation peers' });
  }
});

// Get specific peer information
router.get('/peers/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    const peerInfo = federationService.getPeerInfo(serverId);
    
    if (!peerInfo) {
      return res.status(404).json({ error: 'Peer not found' });
    }
    
    res.json({
      success: true,
      peer: peerInfo
    });
  } catch (error) {
    logger.error('Failed to get peer info:', error);
    res.status(500).json({ error: 'Failed to get peer info' });
  }
});

// Add new federation peer
router.post('/peers', async (req, res) => {
  try {
    const { serverId, serverName, serverUrl, publicKey, isActive = true } = req.body;
    
    if (!serverId || !serverName || !serverUrl) {
      return res.status(400).json({ error: 'Server ID, name, and URL are required' });
    }
    
    const peerInfo = {
      serverId,
      serverName,
      serverUrl,
      publicKey,
      isActive
    };
    
    const success = await federationService.addPeer(peerInfo);
    
    if (success) {
      res.json({
        success: true,
        message: 'Federation peer added successfully',
        peer: peerInfo
      });
    } else {
      res.status(500).json({ error: 'Failed to add federation peer' });
    }
  } catch (error) {
    logger.error('Failed to add federation peer:', error);
    res.status(500).json({ error: 'Failed to add federation peer' });
  }
});

// Remove federation peer
router.delete('/peers/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    
    const success = await federationService.removePeer(serverId);
    
    if (success) {
      res.json({
        success: true,
        message: 'Federation peer removed successfully'
      });
    } else {
      res.status(500).json({ error: 'Failed to remove federation peer' });
    }
  } catch (error) {
    logger.error('Failed to remove federation peer:', error);
    res.status(500).json({ error: 'Failed to remove federation peer' });
  }
});

module.exports = router;
