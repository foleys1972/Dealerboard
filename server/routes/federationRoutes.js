const express = require('express');
const router = express.Router();
const { federationService } = require('../services/federationService');
const logger = require('../utils/logger');

// Get federation status
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

// Sync group with federation peers
router.post('/sync/group', async (req, res) => {
  try {
    const { groupId, action, groupData } = req.body;
    
    if (!groupId || !action) {
      return res.status(400).json({ error: 'Group ID and action are required' });
    }
    
    const results = await federationService.syncGroup(groupId, action, groupData);
    
    res.json({
      success: true,
      message: 'Group sync initiated',
      results
    });
  } catch (error) {
    logger.error('Failed to sync group:', error);
    res.status(500).json({ error: 'Failed to sync group' });
  }
});

// Sync user with federation peers
router.post('/sync/user', async (req, res) => {
  try {
    const { userId, action, userData } = req.body;
    
    if (!userId || !action) {
      return res.status(400).json({ error: 'User ID and action are required' });
    }
    
    const results = await federationService.syncUser(userId, action, userData);
    
    res.json({
      success: true,
      message: 'User sync initiated',
      results
    });
  } catch (error) {
    logger.error('Failed to sync user:', error);
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

// Sync audio route with federation peers
router.post('/sync/audio-route', async (req, res) => {
  try {
    const { routeId, action, routeData } = req.body;
    
    if (!routeId || !action) {
      return res.status(400).json({ error: 'Route ID and action are required' });
    }
    
    const results = await federationService.syncAudioRoute(routeId, action, routeData);
    
    res.json({
      success: true,
      message: 'Audio route sync initiated',
      results
    });
  } catch (error) {
    logger.error('Failed to sync audio route:', error);
    res.status(500).json({ error: 'Failed to sync audio route' });
  }
});

// Sync recording with federation peers
router.post('/sync/recording', async (req, res) => {
  try {
    const { recordingId, action, recordingData } = req.body;
    
    if (!recordingId || !action) {
      return res.status(400).json({ error: 'Recording ID and action are required' });
    }
    
    const results = await federationService.syncRecording(recordingId, action, recordingData);
    
    res.json({
      success: true,
      message: 'Recording sync initiated',
      results
    });
  } catch (error) {
    logger.error('Failed to sync recording:', error);
    res.status(500).json({ error: 'Failed to sync recording' });
  }
});

// Sync Matrix room with federation peers
router.post('/sync/matrix-room', async (req, res) => {
  try {
    const { roomId, action, roomData } = req.body;
    
    if (!roomId || !action) {
      return res.status(400).json({ error: 'Room ID and action are required' });
    }
    
    const results = await federationService.syncMatrixRoom(roomId, action, roomData);
    
    res.json({
      success: true,
      message: 'Matrix room sync initiated',
      results
    });
  } catch (error) {
    logger.error('Failed to sync Matrix room:', error);
    res.status(500).json({ error: 'Failed to sync Matrix room' });
  }
});

// Send message to specific peer
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

// Get federation statistics
router.get('/stats', async (req, res) => {
  try {
    const status = federationService.getStatus();
    
    const stats = {
      totalPeers: status.totalPeers,
      connectedPeers: status.connectedPeers,
      disconnectedPeers: status.totalPeers - status.connectedPeers,
      queuedMessages: status.queuedMessages,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Failed to get federation statistics:', error);
    res.status(500).json({ error: 'Failed to get federation statistics' });
  }
});

// Test federation connection
router.post('/test/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    
    const testMessage = {
      type: 'test',
      timestamp: Date.now(),
      serverId: process.env.SERVER_ID || 'intercom-server-01',
      message: 'Federation connection test'
    };
    
    const success = await federationService.sendToPeer(serverId, testMessage);
    
    if (success) {
      res.json({
        success: true,
        message: 'Test message sent successfully'
      });
    } else {
      res.status(500).json({ error: 'Failed to send test message' });
    }
  } catch (error) {
    logger.error('Failed to test federation connection:', error);
    res.status(500).json({ error: 'Failed to test federation connection' });
  }
});

// Get federation logs
router.get('/logs', async (req, res) => {
  try {
    const { limit = 100, level = 'all' } = req.query;
    
    // This would typically fetch logs from a logging service
    // For now, return a placeholder response
    res.json({
      success: true,
      logs: [],
      message: 'Logs endpoint not implemented yet'
    });
  } catch (error) {
    logger.error('Failed to get federation logs:', error);
    res.status(500).json({ error: 'Failed to get federation logs' });
  }
});

// Export federation configuration
router.get('/export', async (req, res) => {
  try {
    const status = federationService.getStatus();
    
    const config = {
      serverId: status.serverId,
      serverName: status.serverName,
      peers: status.peers,
      exportedAt: new Date().toISOString(),
      version: '1.0.0'
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="federation-config.json"');
    res.json(config);
  } catch (error) {
    logger.error('Failed to export federation configuration:', error);
    res.status(500).json({ error: 'Failed to export federation configuration' });
  }
});

// Import federation configuration
router.post('/import', async (req, res) => {
  try {
    const { peers } = req.body;
    
    if (!peers || !Array.isArray(peers)) {
      return res.status(400).json({ error: 'Peers array is required' });
    }
    
    let importedCount = 0;
    let failedCount = 0;
    
    for (const peer of peers) {
      try {
        const success = await federationService.addPeer(peer);
        if (success) {
          importedCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        logger.error(`Failed to import peer ${peer.serverId}:`, error);
        failedCount++;
      }
    }
    
    res.json({
      success: true,
      message: `Federation configuration imported: ${importedCount} successful, ${failedCount} failed`,
      importedCount,
      failedCount
    });
  } catch (error) {
    logger.error('Failed to import federation configuration:', error);
    res.status(500).json({ error: 'Failed to import federation configuration' });
  }
});

module.exports = router;
