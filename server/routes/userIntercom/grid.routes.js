const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const logger = require('../../utils/logger');
const {
  gridConfigService,
  DEFAULT_GRID_CONFIG,
} = require('./routeHelpers');
router.get('/grid-config', authenticateToken, async (req, res) => {
  try {
    const result = await gridConfigService.getGridConfig();
    return res.json(result);
  } catch (error) {
    logger.error('Failed to get grid config:', error);
    res.json({ config: DEFAULT_GRID_CONFIG });
  }
});

// Update grid configuration (admin only)
router.put('/grid-config', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'platform_admin') {
      return res.status(403).json({ error: 'Platform admin access required' });
    }

    const { gridConfig } = req.body;
    const currentUserId = req.user.id || req.user.userId;

    if (!gridConfig) {
      return res.status(400).json({ error: 'gridConfig is required' });
    }

    const result = await gridConfigService.updateGridConfig(gridConfig, currentUserId);
    res.json(result);
  } catch (error) {
    logger.error('Failed to update grid config:', error);
    res.status(500).json({ error: 'Failed to update grid configuration', details: error.message });
  }
});

module.exports = router;
