const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { requireAdmin, handleServiceError } = require('./routeHelpers');
const ddiLineService = require('../../services/dealerboard/ddiLineService');

router.get('/ddi-lines', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const result = await ddiLineService.listDdiLines();
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get DDI lines');
  }
});

router.post('/ddi-lines', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const result = await ddiLineService.createDdiLine(req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to create DDI line');
  }
});

router.put('/ddi-lines/:id', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const result = await ddiLineService.updateDdiLineRecord(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to update DDI line');
  }
});

router.delete('/ddi-lines/:id', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const result = await ddiLineService.deleteDdiLine(req.params.id);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to delete DDI line');
  }
});

module.exports = router;
