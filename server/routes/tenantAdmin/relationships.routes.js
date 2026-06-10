const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const {
  requestTenantRelationship,
  listTenantRelationships,
  approveTenantRelationship,
  rejectTenantRelationship,
} = require('../../services/databaseService');
const logger = require('../../utils/logger');
const { requireTenantAdmin, requireTenantContext } = require('./routeHelpers');

router.get('/relationships', authenticateToken, requireTenantAdmin, requireTenantContext, async (req, res) => {
  try {
    const tenantId = req.user.tid;
    const relationships = await listTenantRelationships(tenantId);
    return res.json({ success: true, relationships });
  } catch (error) {
    logger.error('Failed to list tenant relationships:', error);
    return res.status(500).json({ error: 'Failed to list tenant relationships' });
  }
});

router.post('/relationships/request', authenticateToken, requireTenantAdmin, requireTenantContext, async (req, res) => {
  try {
    const requestingTenantId = req.user.tid;
    const { targetTenantId = null, capabilities = {} } = req.body || {};

    const rel = await requestTenantRelationship({
      requestingTenantId,
      targetTenantId,
      capabilities,
    });

    return res.status(201).json({ success: true, relationship: rel });
  } catch (error) {
    logger.error('Failed to request tenant relationship:', error);
    return res.status(500).json({ error: 'Failed to request tenant relationship' });
  }
});

router.post('/relationships/:id/approve', authenticateToken, requireTenantAdmin, requireTenantContext, async (req, res) => {
  try {
    const approverTenantId = req.user.tid;
    const relationshipId = req.params.id;

    const rel = await approveTenantRelationship({ relationshipId, approverTenantId });
    return res.json({ success: true, relationship: rel });
  } catch (error) {
    logger.error('Failed to approve tenant relationship:', error);
    return res.status(400).json({ error: error.message || 'Failed to approve relationship' });
  }
});

router.post('/relationships/:id/reject', authenticateToken, requireTenantAdmin, requireTenantContext, async (req, res) => {
  try {
    const approverTenantId = req.user.tid;
    const relationshipId = req.params.id;

    const rel = await rejectTenantRelationship({ relationshipId, approverTenantId });
    return res.json({ success: true, relationship: rel });
  } catch (error) {
    logger.error('Failed to reject tenant relationship:', error);
    return res.status(400).json({ error: error.message || 'Failed to reject relationship' });
  }
});

module.exports = router;
