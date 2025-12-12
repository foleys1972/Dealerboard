const express = require('express');
const router = express.Router();
const { pool } = require('../services/databaseService');
const { authenticateToken } = require('./authRoutes');
const logger = require('../utils/logger');

// Get grid configuration for user intercom
router.get('/grid-config', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT settings FROM system_settings WHERE id = 'user-intercom-config'`
    );

    const defaultConfig = {
      columns: 3,
      gap: '1rem',
      mobileColumns: 1,
      mobileGap: '0.75rem',
      tabletColumns: 2,
      contactColumns: 2,
      contactGap: '0.75rem',
      contactMobileColumns: 1
    };

    if (result.rows.length > 0 && result.rows[0].settings) {
      const settings = result.rows[0].settings;
      const config = settings.gridConfig || defaultConfig;
      return res.json({ config });
    }

    res.json({ config: defaultConfig });
  } catch (error) {
    logger.error('Failed to get grid config:', error);
    // Return defaults on error
    res.json({
      config: {
        columns: 3,
        gap: '1rem',
        mobileColumns: 1,
        mobileGap: '0.75rem',
        tabletColumns: 2,
        contactColumns: 2,
        contactGap: '0.75rem',
        contactMobileColumns: 1
      }
    });
  }
});

// Update grid configuration (admin only)
router.put('/grid-config', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { gridConfig } = req.body;
    const currentUserId = req.user.id || req.user.userId;

    if (!gridConfig) {
      return res.status(400).json({ error: 'gridConfig is required' });
    }

    // Validate grid config structure
    const validConfig = {
      columns: Math.max(1, Math.min(6, parseInt(gridConfig.columns) || 3)),
      gap: gridConfig.gap || '1rem',
      mobileColumns: Math.max(1, Math.min(3, parseInt(gridConfig.mobileColumns) || 1)),
      mobileGap: gridConfig.mobileGap || '0.75rem',
      tabletColumns: Math.max(1, Math.min(4, parseInt(gridConfig.tabletColumns) || 2)),
      contactColumns: Math.max(1, Math.min(6, parseInt(gridConfig.contactColumns) || 2)),
      contactGap: gridConfig.contactGap || '0.75rem',
      contactMobileColumns: Math.max(1, Math.min(2, parseInt(gridConfig.contactMobileColumns) || 1))
    };

    // Get existing settings
    const existingResult = await pool.query(
      `SELECT settings FROM system_settings WHERE id = 'user-intercom-config'`
    );

    const existingSettings = existingResult.rows.length > 0 
      ? (existingResult.rows[0].settings || {}) 
      : {};

    const mergedSettings = {
      ...existingSettings,
      gridConfig: validConfig,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUserId
    };

    await pool.query(
      `INSERT INTO system_settings (id, settings, updated_by, updated_at)
       VALUES ('user-intercom-config', $1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET
         settings = EXCLUDED.settings,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
      [JSON.stringify(mergedSettings), currentUserId]
    );

    res.json({
      success: true,
      config: validConfig,
      message: 'Grid configuration updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update grid config:', error);
    res.status(500).json({ error: 'Failed to update grid configuration', details: error.message });
  }
});

module.exports = router;

