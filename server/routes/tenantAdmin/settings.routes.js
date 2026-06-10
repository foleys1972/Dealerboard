const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { getTenantSettings, updateTenantSettings } = require('../../services/databaseService');
const logger = require('../../utils/logger');
const { requireTenantAdmin, requireTenantContext, deepMerge } = require('./routeHelpers');

router.get('/settings', authenticateToken, requireTenantAdmin, requireTenantContext, async (req, res) => {
  try {
    const tenantId = req.user.tid;
    const settings = await getTenantSettings(tenantId);
    return res.json({ success: true, settings });
  } catch (error) {
    logger.error('Failed to get tenant settings:', error);
    return res.status(500).json({ error: 'Failed to get tenant settings' });
  }
});

router.put('/settings', authenticateToken, requireTenantAdmin, requireTenantContext, async (req, res) => {
  try {
    const tenantId = req.user.tid;
    const updatedBy = req.user.id || req.user.userId || req.user.username;
    const settings = req.body?.settings ?? req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings payload' });
    }

    const existing = await getTenantSettings(tenantId);
    const merged = deepMerge(existing, settings);
    const saved = await updateTenantSettings(tenantId, merged, updatedBy);

    return res.json({ success: true, settings: saved });
  } catch (error) {
    logger.error('Failed to update tenant settings:', error);
    return res.status(500).json({ error: 'Failed to update tenant settings' });
  }
});

module.exports = router;
