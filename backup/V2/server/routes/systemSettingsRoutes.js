const express = require('express');
const router = express.Router();
const { pool } = require('../services/databaseService');
const { matrixService } = require('../services/matrixService');
const { authenticateToken } = require('./authRoutes');
const { clearCache: clearServerRoleCache } = require('../utils/serverRole');
const logger = require('../utils/logger');

// Get system settings (for admin)
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(
      `SELECT settings FROM system_settings WHERE id = 'global'`
    );

    const settings = result.rows.length > 0 ? result.rows[0].settings : {
      roomArchive: {
        enabled: false,
        inactiveDays: 90
      },
      serverRole: {
        role: process.env.SERVER_ROLE || 'publisher', // 'publisher' or 'subscriber'
        publisherUrl: process.env.PUBLISHER_URL || '',
        serverId: process.env.SERVER_ID || 'intercom-server-01',
        serverName: process.env.SERVER_NAME || 'Trading Intercom Server'
      },
      ports: {
        conferencingPort: parseInt(process.env.CONFERENCING_PORT) || 3002,
        federationPort: parseInt(process.env.FEDERATION_PORT) || 3002,
        rtcMinPort: parseInt(process.env.RTC_MIN_PORT) || 10000,
        rtcMaxPort: parseInt(process.env.RTC_MAX_PORT) || 10200
      }
    };

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    logger.error('Failed to get system settings:', error);
    res.status(500).json({ error: 'Failed to get system settings', details: error.message });
  }
});

// Update system settings (admin only)
router.put('/settings', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { settings } = req.body;
    const currentUserId = req.user.id || req.user.userId;

    // Validate port configuration if provided
    if (settings.ports) {
      const { rtcMinPort, rtcMaxPort } = settings.ports;
      
      if (rtcMinPort !== undefined && rtcMaxPort !== undefined) {
        const portRange = rtcMaxPort - rtcMinPort + 1;
        
        if (portRange !== 200) {
          return res.status(400).json({ 
            error: `Port range must be exactly 200 ports. Provided range: ${portRange} ports` 
          });
        }

        if (rtcMinPort >= rtcMaxPort) {
          return res.status(400).json({ 
            error: 'First port must be less than last port' 
          });
        }

        if (rtcMinPort < 1024 || rtcMaxPort > 65535) {
          return res.status(400).json({ 
            error: 'Ports must be between 1024 and 65535' 
          });
        }
      }
    }

    // Validate server role configuration if provided
    if (settings.serverRole) {
      const { role, publisherUrl, serverId } = settings.serverRole;
      
      if (!role || !['publisher', 'subscriber'].includes(role)) {
        return res.status(400).json({ 
          error: 'Server role must be either "publisher" or "subscriber"' 
        });
      }

      if (!serverId || !serverId.trim()) {
        return res.status(400).json({ 
          error: 'Server ID is required' 
        });
      }

      if (role === 'subscriber' && (!publisherUrl || !publisherUrl.trim())) {
        return res.status(400).json({ 
          error: 'Publisher Server URL is required when server role is Subscriber' 
        });
      }
    }

    // Merge with existing settings
    const existingResult = await pool.query(
      `SELECT settings FROM system_settings WHERE id = 'global'`
    );

    const existingSettings = existingResult.rows.length > 0 ? existingResult.rows[0].settings : {};
    const mergedSettings = { ...existingSettings, ...settings };

    await pool.query(
      `INSERT INTO system_settings (id, settings, updated_by, updated_at)
       VALUES ('global', $1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET
         settings = EXCLUDED.settings,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
      [JSON.stringify(mergedSettings), currentUserId]
    );

    // If room archiving is enabled, trigger immediate archive check
    if (mergedSettings.roomArchive?.enabled && mergedSettings.roomArchive?.inactiveDays) {
      try {
        await matrixService.archiveInactiveRooms(mergedSettings.roomArchive.inactiveDays);
      } catch (error) {
        logger.error('Failed to run initial archive:', error);
        // Don't fail the request if archive fails
      }
    }

    // If server role was updated, clear the cache
    if (settings.serverRole) {
      clearServerRoleCache();
      logger.info('Server role cache cleared after update');
    }

    res.json({
      success: true,
      settings: mergedSettings,
      message: 'System settings updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update system settings:', error);
    res.status(500).json({ error: 'Failed to update system settings', details: error.message });
  }
});

// Trigger manual room archive (admin only)
router.post('/archive-rooms', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get archive settings
    const settingsResult = await pool.query(
      `SELECT settings FROM system_settings WHERE id = 'global'`
    );

    const settings = settingsResult.rows.length > 0 ? settingsResult.rows[0].settings : {};
    const archiveConfig = settings.roomArchive || { enabled: false, inactiveDays: 90 };

    if (!archiveConfig.enabled) {
      return res.status(400).json({ error: 'Room archiving is not enabled' });
    }

    const result = await matrixService.archiveInactiveRooms(archiveConfig.inactiveDays);

    res.json({
      success: true,
      ...result,
      message: `Archived ${result.archived} inactive rooms`
    });
  } catch (error) {
    logger.error('Failed to archive rooms:', error);
    res.status(500).json({ error: 'Failed to archive rooms', details: error.message });
  }
});

module.exports = router;

