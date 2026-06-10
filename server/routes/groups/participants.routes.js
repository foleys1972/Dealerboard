const express = require('express');
const router = express.Router();
const { groupService } = require('../../services/groupService');
const { audioRoutingService } = require('../../services/audioRoutingService');
const { getUserByIdOrUsername } = require('../../services/databaseService');
const logger = require('../../utils/logger');
const { hydrateParticipants } = require('./shared');
router.get('/:groupId/participant/:userId/audio', async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const status = audioRoutingService.getParticipantAudioStatus(groupId, userId);
    
    if (!status) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    
    res.json(status);
  } catch (error) {
    logger.error('Failed to get participant audio status:', error);
    res.status(500).json({ error: 'Failed to get participant audio status' });
  }
});

// Update participant audio level
router.post('/:groupId/participant/:userId/audio-level', async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const { level } = req.body;
    
    audioRoutingService.updateParticipantAudioLevel(groupId, userId, level);
    
    res.json({
      success: true,
      message: 'Audio level updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update audio level:', error);
    res.status(500).json({ error: 'Failed to update audio level' });
  }
});

// Check group permissions
router.get('/:groupId/permissions/:userId', async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const { permission } = req.query;
    
    if (permission) {
      const hasPermission = groupService.hasPermission(groupId, userId, permission);
      res.json({ hasPermission });
    } else {
      const permissions = groupService.getGroupPermissions(groupId);
      res.json(permissions);
    }
  } catch (error) {
    logger.error('Failed to check permissions:', error);
    res.status(500).json({ error: 'Failed to check permissions' });
  }
});

// Set group permissions
router.put('/:groupId/permissions', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { permissions } = req.body;
    
    groupService.setGroupPermissions(groupId, permissions);
    
    res.json({
      success: true,
      message: 'Permissions updated successfully'
    });
  } catch (error) {
    logger.error('Failed to set permissions:', error);
    res.status(500).json({ error: 'Failed to set permissions' });
  }
});

// Group participant management
router.get('/:groupId/participants', async (req, res) => {
  try {
    await groupService.initialize();
    const { groupId } = req.params;
    const group = groupService.getGroup(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const participants = await hydrateParticipants(Array.from(group.participants || []));
    res.json({
      success: true,
      participants,
      count: participants.length,
    });
  } catch (error) {
    logger.error('Failed to get group participants:', error);
    res.status(500).json({ error: error.message || 'Failed to get group participants' });
  }
});

router.post('/:groupId/participants', async (req, res) => {
  try {
    await groupService.initialize();
    const { groupId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const user = await getUserByIdOrUsername(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const resolvedUserId = user.id;
    await groupService.joinGroup(groupId, resolvedUserId, user);
    const group = groupService.getGroup(groupId);
    const participants = await hydrateParticipants(Array.from(group?.participants || []));

    res.json({
      success: true,
      participants,
      count: participants.length,
      message: 'Participant added successfully',
    });
  } catch (error) {
    logger.error('Failed to add participant to group:', error);
    res.status(500).json({ error: error.message || 'Failed to add participant' });
  }
});

router.delete('/:groupId/participants/:userId', async (req, res) => {
  try {
    await groupService.initialize();
    const { groupId, userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    await groupService.leaveGroup(groupId, userId);
    const group = groupService.getGroup(groupId);
    const participants = await hydrateParticipants(Array.from(group?.participants || []));

    res.json({
      success: true,
      participants,
      count: participants.length,
      message: 'Participant removed successfully',
    });
  } catch (error) {
    logger.error('Failed to remove participant from group:', error);
    res.status(500).json({ error: error.message || 'Failed to remove participant' });
  }
});

module.exports = router;
