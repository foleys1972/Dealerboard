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
      },
      zoom: {
        enabled: process.env.ZOOM_ENABLED === 'true',
        clientId: process.env.ZOOM_CLIENT_ID || '',
        clientSecret: '', // Never return secrets in GET
        redirectUri: process.env.ZOOM_REDIRECT_URI || '',
        accountId: process.env.ZOOM_ACCOUNT_ID || '',
        allowDirectAuth: process.env.ZOOM_ALLOW_DIRECT_AUTH === 'true'
      },
      teams: {
        enabled: process.env.TEAMS_ENABLED === 'true',
        clientId: process.env.TEAMS_CLIENT_ID || '',
        clientSecret: '', // Never return secrets in GET
        tenantId: process.env.TEAMS_TENANT_ID || '',
        redirectUri: process.env.TEAMS_REDIRECT_URI || ''
      },
      sip: {
        enabled: process.env.SIP_ENABLED === 'true',
        host: process.env.SIP_HOST || 'localhost',
        port: parseInt(process.env.SIP_PORT) || 5060,
        domain: process.env.SIP_DOMAIN || '',
        password: '' // Never return passwords in GET
      },
      matrix: {
        serverUrl: process.env.MATRIX_SERVER_URL || 'https://matrix.org',
        accessToken: '', // Never return tokens in GET
        userId: process.env.MATRIX_USER_ID || '',
        deviceId: process.env.MATRIX_DEVICE_ID || ''
      },
      mediasoup: {
        numWorkers: parseInt(process.env.MEDIASOUP_NUM_WORKERS) || 4,
        listenIp: process.env.LISTEN_IP || '0.0.0.0',
        announcedIp: process.env.ANNOUNCED_IP || '',
        logLevel: process.env.MEDIASOUP_LOG_LEVEL || 'warn',
        maxConcurrentGroups: parseInt(process.env.MAX_CONCURRENT_GROUPS) || 50,
        maxParticipantsPerGroup: parseInt(process.env.MAX_PARTICIPANTS_PER_GROUP) || 300
      },
      federation: {
        enabled: process.env.FEDERATION_ENABLED === 'true',
        serverId: process.env.SERVER_ID || 'intercom-server-01',
        serverName: process.env.SERVER_NAME || 'Trading Intercom Server',
        serverUrl: process.env.SERVER_URL || 'ws://localhost:3001',
        federationSecret: '', // Never return secrets in GET
        maxConnections: parseInt(process.env.FEDERATION_MAX_CONNECTIONS) || 10,
        heartbeatInterval: parseInt(process.env.FEDERATION_HEARTBEAT_INTERVAL) || 30000,
        reconnectInterval: parseInt(process.env.FEDERATION_RECONNECT_INTERVAL) || 5000,
        maxReconnectAttempts: parseInt(process.env.FEDERATION_MAX_RECONNECT_ATTEMPTS) || 5,
        encryptionEnabled: process.env.FEDERATION_ENCRYPTION_ENABLED === 'true',
        compressionEnabled: process.env.FEDERATION_COMPRESSION_ENABLED === 'true'
      },
      activeDirectory: {
        enabled: process.env.AD_ENABLED === 'true',
        url: process.env.AD_URL || 'ldap://localhost:389',
        baseDN: process.env.AD_BASE_DN || '',
        bindDN: process.env.AD_BIND_DN || '',
        bindPassword: '', // Never return passwords in GET
        userSearchBase: process.env.AD_USER_SEARCH_BASE || '',
        groupSearchBase: process.env.AD_GROUP_SEARCH_BASE || '',
        syncInterval: parseInt(process.env.AD_SYNC_INTERVAL) || 300000
      },
      compliance: {
        enabled: process.env.COMPLIANCE_ENABLED === 'true',
        regulations: process.env.COMPLIANCE_REGULATIONS?.split(',') || ['mifid2', 'dodd-frank', 'sox'],
        retentionPeriod: parseInt(process.env.COMPLIANCE_RETENTION_PERIOD) || 2555,
        auditLogging: process.env.COMPLIANCE_AUDIT_LOGGING === 'true',
        dataClassification: process.env.COMPLIANCE_DATA_CLASSIFICATION === 'true',
        accessControl: process.env.COMPLIANCE_ACCESS_CONTROL === 'true',
        encryptionRequired: process.env.COMPLIANCE_ENCRYPTION_REQUIRED === 'true',
        reportingInterval: parseInt(process.env.COMPLIANCE_REPORTING_INTERVAL) || 86400000,
        complianceOfficer: process.env.COMPLIANCE_OFFICER_EMAIL || '',
        legalHold: process.env.COMPLIANCE_LEGAL_HOLD === 'true'
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
    
    // Deep merge settings, preserving secrets if not provided
    const mergedSettings = { ...existingSettings };
    
    for (const [key, value] of Object.entries(settings)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        mergedSettings[key] = { ...(mergedSettings[key] || {}), ...value };
        
        // For sensitive fields, only update if a new value is provided (not empty string)
        const sensitiveFields = {
          zoom: ['clientSecret'],
          sip: ['password'],
          matrix: ['accessToken'],
          federation: ['federationSecret'],
          activeDirectory: ['bindPassword']
        };
        
        if (sensitiveFields[key]) {
          for (const field of sensitiveFields[key]) {
            // Only update secret if a new value is provided
            if (value[field] && value[field].trim() !== '') {
              mergedSettings[key][field] = value[field];
            }
            // If not provided, keep existing value (already merged above)
          }
        }
      } else {
        mergedSettings[key] = value;
      }
    }

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

