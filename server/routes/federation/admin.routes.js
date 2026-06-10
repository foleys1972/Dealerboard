const express = require('express');
const router = express.Router();
const { federationService } = require('../../services/federationService');
const logger = require('../../utils/logger');
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
