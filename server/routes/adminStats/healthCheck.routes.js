const express = require('express');
const os = require('os');
const router = express.Router();
const logger = require('../../utils/logger');
const { groupService } = require('../../services/groupService');
const { findUsers } = require('../../services/databaseService');
const { authenticateToken } = require('../authRoutes');
const { adminOnly } = require('../../middleware/roleCheck');
const { audioRecordingService } = require('../../services/audioRecordingService');
const { getArchiveHealth } = require('../../services/recordingArchiveService');
const { getRecordingReconcileHealth } = require('../../services/recordingReconcileService');
router.get('/health-check', authenticateToken, async (req, res) => {
  try {

    const os = require('os');
    const { getSFUStats } = require('../../services/mediaSoupService');
    
    // Get Socket.IO stats (if available)
    let socketStats = {
      connected: 0,
      rooms: 0,
      activeCalls: 0,
    };
    
    try {
      // Get socket handler from app.locals
      const socketHandler = req.app?.locals?.socketHandler;
      if (socketHandler) {
        socketStats = {
          connected: socketHandler.io?.sockets?.sockets?.size || 0,
          rooms: socketHandler.activeRooms?.size || 0,
          activeCalls: Array.from(socketHandler.activeRooms?.values() || []).filter(
            room => room.status === 'connected' || room.status === 'ringing'
          ).length,
          activeBroadcasts: socketHandler.activeBroadcasts?.size || 0,
        };
      }
    } catch (err) {
      logger.debug('Could not get socket stats:', err.message);
    }

    // Get MediaSoup SFU stats
    let sfuStats = null;
    try {
      sfuStats = await getSFUStats();
    } catch (err) {
      logger.warn('Could not get SFU stats:', err.message);
    }

    // System information
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || 'Unknown',
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      usedMemory: os.totalmem() - os.freemem(),
      memoryUsagePercent: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2),
      loadAverage: os.loadavg(),
      uptime: process.uptime(),
      nodeVersion: process.version,
      pid: process.pid,
      processMemory: process.memoryUsage(),
    };

    // Port information - read from database system settings first, then fall back to env/defaults
    const { getGlobalRtcPorts } = require('../../services/adminStats/healthService');
    const { rtcMinPort, rtcMaxPort } = await getGlobalRtcPorts();
    
    const portInfo = {
      serverPort: process.env.PORT || process.env.SERVER_PORT || 5000,
      rtcMinPort: rtcMinPort,
      rtcMaxPort: rtcMaxPort,
      rtcPortRange: `${rtcMinPort}-${rtcMaxPort}`,
      socketIOPath: '/socket.io',
    };

    // Database status
    let dbStatus = { connected: false, error: null };
    try {
      const { pool } = require('../../services/databaseService');
      if (pool) {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        dbStatus = { connected: true };
      }
    } catch (err) {
      dbStatus = { connected: false, error: err.message };
    }

    // Redis status
    let redisStatus = { connected: false, error: null };
    try {
      const { redisClient } = require('../../services/redisService');
      if (redisClient && redisClient.isReady) {
        await redisClient.ping();
        redisStatus = { connected: true };
      } else if (redisClient) {
        redisStatus = { connected: false, error: 'Redis client exists but not ready' };
      } else {
        redisStatus = { connected: false, error: 'Redis not enabled' };
      }
    } catch (err) {
      redisStatus = { connected: false, error: err.message };
    }

    // Matrix status
    let matrixStatus = { connected: false, error: null };
    try {
      const { matrixClient } = require('../../services/matrixService');
      if (matrixClient && matrixClient.isLoggedIn()) {
        matrixStatus = { connected: true, userId: matrixClient.getUserId() };
      } else {
        matrixStatus = { connected: false, error: 'Not logged in' };
      }
    } catch (err) {
      matrixStatus = { connected: false, error: err.message };
    }

    // Get active groups and users
    await groupService.initialize();
    const [users] = await Promise.all([findUsers({})]);
    const groups = groupService.getAllGroups();

    let archiveHealth = null;
    try {
      archiveHealth = await getArchiveHealth({ recordingDir: audioRecordingService.recordingDir });
    } catch (e) {
      archiveHealth = { error: e?.message || String(e) };
    }

    let recordingReconcile = null;
    try {
      recordingReconcile = getRecordingReconcileHealth();
    } catch (e) {
      recordingReconcile = { error: e?.message || String(e) };
    }

    const healthCheck = {
      timestamp: new Date().toISOString(),
      status: 'healthy', // Overall status
      system: systemInfo,
      ports: portInfo,
      connections: {
        socketIO: socketStats,
        database: dbStatus,
        redis: redisStatus,
        matrix: matrixStatus,
      },
      mediaSoup: sfuStats,
      application: {
        totalUsers: users.length,
        activeUsers: users.filter(u => u.isActive).length,
        totalGroups: groups.length,
        activeGroups: groups.filter(g => g.isActive).length,
      },
      recordings: {
        archive: archiveHealth,
        reconcile: recordingReconcile,
      },
    };

    // Determine overall health status
    if (!dbStatus.connected || (sfuStats && sfuStats.error)) {
      healthCheck.status = 'degraded';
    }
    if (systemInfo.memoryUsagePercent > 90 || systemInfo.loadAverage[0] > os.cpus().length * 2) {
      healthCheck.status = 'warning';
    }

    res.json({
      success: true,
      health: healthCheck,
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to perform health check' 
    });
  }
});

module.exports = router;
