const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { requirePlatformAdmin, handleServiceError } = require('./routeHelpers');
const tenantService = require('../../services/platformAdmin/tenantService');

router.post('/tenants', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await tenantService.createTenantRecord(req.body);
    res.status(result.status).json(result.body);
  } catch (error) {
    handleServiceError(res, error, 'Failed to create tenant');
  }
});

router.get('/tenants', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await tenantService.listTenantRecords();
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to list tenants');
  }
});

router.put('/tenants/:tenantId', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await tenantService.updateTenantRecord(req.params.tenantId, req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to update tenant');
  }
});

router.delete('/tenants/:tenantId', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await tenantService.deactivateTenant(req.params.tenantId);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to delete tenant');
  }
});

router.post('/tenants/:tenantId/tenant-admin', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await tenantService.createTenantAdmin(req.params.tenantId, req.body);
    res.status(result.status).json(result.body);
  } catch (error) {
    handleServiceError(res, error, 'Failed to create tenant admin');
  }
});

module.exports = router;
