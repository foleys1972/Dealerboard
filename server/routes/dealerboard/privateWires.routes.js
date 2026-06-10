const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { requireAdmin, handleServiceError } = require('./routeHelpers');
const privateWireService = require('../../services/dealerboard/privateWireService');

router.get('/private-wires', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const result = await privateWireService.listPrivateWires();
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get private wires');
  }
});

router.post('/private-wires', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const result = await privateWireService.createPrivateWire(req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to create private wire');
  }
});

router.put('/private-wires/:id', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const result = await privateWireService.updatePrivateWireRecord(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to update private wire');
  }
});

router.put('/private-wires/pair/:pairId', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const result = await privateWireService.updateInternalWirePair(req.params.pairId, req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to update internal wire pair');
  }
});

router.post('/private-wires/migrate-legacy', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : (req.body?.id ? [req.body.id] : []);
    const result = await privateWireService.migrateLegacyPrivateWires(
      ids,
      req.user.id || req.user.userId
    );
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to migrate legacy rows');
  }
});

router.post('/private-wires/delete-legacy', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : (req.body?.id ? [req.body.id] : []);
    const force = req.body?.force === true || req.body?.force === 'true';
    const result = await privateWireService.deleteLegacyPrivateWires(ids, force);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to delete legacy rows');
  }
});

router.delete('/private-wires/:id', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const result = await privateWireService.deletePrivateWire(req.params.id);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to delete private wire');
  }
});

module.exports = router;
