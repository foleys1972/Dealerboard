const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { createSubTenant, listSubTenants } = require('../../services/databaseService');
const logger = require('../../utils/logger');
const { requireTenantAdmin, requireTenantContext } = require('./routeHelpers');

router.post('/sub-tenants', authenticateToken, requireTenantAdmin, requireTenantContext, async (req, res) => {
  try {
    const tenantId = req.user.tid;
    const { name, dataRegion, id } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }

    const subTenantId = id || `subtenant_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

    const created = await createSubTenant({
      id: subTenantId,
      tenantId,
      name,
      dataRegion: dataRegion || null,
      isActive: true,
    });

    return res.status(201).json({ success: true, subTenant: created });
  } catch (error) {
    logger.error('Failed to create sub-tenant:', error);
    if (error && (error.code === '23505' || error.code === 23505)) {
      return res.status(409).json({ error: 'Sub-tenant id already exists' });
    }
    return res.status(500).json({ error: 'Failed to create sub-tenant' });
  }
});

router.get('/sub-tenants', authenticateToken, requireTenantAdmin, requireTenantContext, async (req, res) => {
  try {
    const tenantId = req.user.tid;
    const subTenants = await listSubTenants(tenantId);
    return res.json({ success: true, subTenants });
  } catch (error) {
    logger.error('Failed to list sub-tenants:', error);
    return res.status(500).json({ error: 'Failed to list sub-tenants' });
  }
});

module.exports = router;
