const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { requirePlatformAdmin, handleServiceError } = require('./routeHelpers');
const dialPlanService = require('../../services/systemSettings/dialPlanService');

router.get('/dial-plans', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await dialPlanService.listDialPlanRecords(req.query);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to list dial plans');
  }
});

router.post('/dial-plans', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await dialPlanService.upsertDialPlanRecord(req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to upsert dial plan');
  }
});

router.delete('/dial-plans/:id', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await dialPlanService.deleteDialPlan(req.params.id);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to delete dial plan');
  }
});

router.get('/dial-plans/:id/rules', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await dialPlanService.listDialPlanRuleRecords(req.params.id);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to list dial plan rules');
  }
});

router.post('/dial-plans/:id/rules', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await dialPlanService.upsertDialPlanRuleRecord(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to upsert dial plan rule');
  }
});

router.delete('/dial-plans/:id/rules/:ruleId', authenticateToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await dialPlanService.deleteDialPlanRuleRecord(req.params.id, req.params.ruleId);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to delete dial plan rule');
  }
});

module.exports = router;
