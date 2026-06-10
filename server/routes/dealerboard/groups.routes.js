const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { requireAdmin, handleServiceError } = require('./routeHelpers');
const dealerboardGroupService = require('../../services/dealerboard/dealerboardGroupService');

router.get('/groups', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const result = await dealerboardGroupService.listGroups();
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get dealerboard groups');
  }
});

router.post('/groups', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const result = await dealerboardGroupService.createGroup(req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to create dealerboard group');
  }
});

router.put('/groups/:id', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const result = await dealerboardGroupService.updateGroupRecord(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to update dealerboard group');
  }
});

router.delete('/groups/:id', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const result = await dealerboardGroupService.deleteGroup(req.params.id);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to delete dealerboard group');
  }
});

router.get('/groups/:id/members', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const result = await dealerboardGroupService.listGroupMembers(req.params.id);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get group members');
  }
});

router.post('/groups/:id/members', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const result = await dealerboardGroupService.addMember(req.params.id, req.body?.userId);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to add user to group');
  }
});

router.delete('/groups/:id/members/:userId', authenticateToken, async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const result = await dealerboardGroupService.removeMember(req.params.id, req.params.userId);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to remove user from group');
  }
});

router.get('/users/:userId/groups', authenticateToken, async (req, res) => {
  try {
    const result = await dealerboardGroupService.getUserGroups({
      targetUserIdRaw: req.params.userId,
      requestingUserIdRaw: req.user.id || req.user.userId,
      requesterRole: req.user.role,
    });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get user groups');
  }
});

module.exports = router;
