const express = require('express');
const router = express.Router();
const { groupService } = require('../../services/groupService');
const { audioRoutingService } = require('../../services/audioRoutingService');
const logger = require('../../utils/logger');
const { normalizeCallModeForDb } = require('../../utils/groupCallMode');
router.post('/', async (req, res) => {
  try {
    // Ensure group service is initialized
    await groupService.initialize();

    const {
      name,
      description,
      type = 'trading',
      callMode = 'REMAIN_GROUP',
      isPublic = false,
      maxParticipants = 200,
      allowRecording = true,
      pushToTalk = false,
      createdBy,
      hootConfig = {},
      sipEnabled = false,
      sipNumbers = [],
      retentionPolicy = {},
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const group = await groupService.createGroup({
      name,
      description,
      type,
      callMode: normalizeCallModeForDb(callMode),
      isPublic,
      maxParticipants,
      allowRecording,
      pushToTalk,
      createdBy: createdBy || req.user?.id || 'system',
      hootConfig,
      sipEnabled,
      sipNumbers,
      retentionDays: retentionPolicy.retentionDays,
      emailDelivery: retentionPolicy.emailDelivery,
      emailRecipients: retentionPolicy.emailRecipients,
      emailSchedule: retentionPolicy.emailSchedule,
    });

    // Initialize audio routing for the group
    try {
      await audioRoutingService.initializeGroupRouting(group.id);
    } catch (routingError) {
      logger.warn(`Audio routing initialization skipped for group ${group.id}:`, routingError.message);
    }

    res.status(201).json({
      success: true,
      group,
      message: 'Group created successfully'
    });
  } catch (error) {
    logger.error('Failed to create group:', error);
    res.status(500).json({ error: error.message || 'Failed to create group' });
  }
});

// Get all groups
router.get('/', async (req, res) => {
  try {
    // Ensure group service is initialized
    await groupService.initialize();
    
    const { userId, type, isPublic, callMode } = req.query;
    
    let groups;
    if (userId) {
      groups = groupService.getUserGroups(userId);
    } else {
      groups = groupService.getAllGroups();
    }

    // Filter by type if specified
    if (type) {
      groups = groups.filter(group => group.type === type);
    }

    // Filter by call mode (e.g., broadcast, hunt, conference)
    if (callMode) {
      groups = groups.filter(group => (group.callMode || 'REMAIN_GROUP') === callMode);
    }

    // Filter by public/private if specified
    if (isPublic !== undefined) {
      const isPublicFilter = isPublic === 'true';
      groups = groups.filter(group => group.isPublic === isPublicFilter);
    }

    res.json({
      success: true,
      groups: groups,
      count: groups.length
    });
  } catch (error) {
    logger.error('Failed to get groups:', error);
    res.status(500).json({ error: 'Failed to get groups' });
  }
});

// Get group by ID
router.get('/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = groupService.getGroup(groupId);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Get audio routing status
    const audioStatus = audioRoutingService.getAudioRoutingStatus(groupId);
    
    res.json({
      ...group,
      audioStatus,
    });
  } catch (error) {
    logger.error('Failed to get group:', error);
    res.status(500).json({ error: 'Failed to get group' });
  }
});

// Join a group
router.post('/:groupId/join', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, userData } = req.body;
    
    const result = await groupService.joinGroup(groupId, userId, userData);
    
    // Add participant to audio routing
    // await audioRoutingService.addParticipant(groupId, userId, null); // Audio stream will be added later
    
    res.json({
      success: true,
      ...result,
      message: 'Joined group successfully'
    });
  } catch (error) {
    logger.error('Failed to join group:', error);
    res.status(500).json({ error: error.message || 'Failed to join group' });
  }
});

// Leave a group
router.post('/:groupId/leave', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;
    
    const result = await groupService.leaveGroup(groupId, userId);
    
    // Remove participant from audio routing
    // await audioRoutingService.removeParticipant(groupId, userId);
    
    res.json({
      success: true,
      ...result,
      message: 'Left group successfully'
    });
  } catch (error) {
    logger.error('Failed to leave group:', error);
    res.status(500).json({ error: error.message || 'Failed to leave group' });
  }
});

// Deactivate (soft-delete) a group
router.delete('/:groupId', async (req, res) => {
  try {
    await groupService.initialize();
    const { groupId } = req.params;
    await groupService.removeGroup(groupId);
    res.json({
      success: true,
      message: 'Group deleted successfully',
    });
  } catch (error) {
    logger.error('Failed to delete group:', error);
    res.status(500).json({ error: error.message || 'Failed to delete group' });
  }
});

// Update group settings
router.put('/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const updates = { ...req.body };
    if (updates.callMode !== undefined) {
      updates.callMode = normalizeCallModeForDb(updates.callMode);
    }

    const group = await groupService.updateGroup(groupId, updates);
    
    res.json({
      success: true,
      group,
      message: 'Group updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update group:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
});


module.exports = router;
