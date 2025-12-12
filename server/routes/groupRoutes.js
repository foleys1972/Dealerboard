const express = require('express');
const router = express.Router();
const { groupService } = require('../services/groupService');
const { audioRoutingService } = require('../services/audioRoutingService');
const { audioRecordingService } = require('../services/audioRecordingService');
const { getUserById } = require('../services/databaseService');
const logger = require('../utils/logger');

async function hydrateParticipants(participantIds = []) {
  const uniqueIds = Array.from(new Set(participantIds));
  const participants = await Promise.all(
    uniqueIds.map(async (participantId) => {
      try {
        const user = await getUserById(participantId);
        if (user) {
          return {
            id: user.id,
            username: user.username,
            name: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
            role: user.role,
            status: user.status || 'offline',
            extension: user.extension || null,
          };
        }
      } catch (error) {
        logger.warn(`Failed to hydrate participant ${participantId}: ${error.message}`);
      }
      return {
        id: participantId,
        username: participantId,
        name: 'Unknown User',
        role: 'unknown',
        status: 'offline',
      };
    })
  );
  return participants;
}

// Create a new group (supports standard and broadcast hoots)
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
      callMode,
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

// Update group settings
router.put('/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const updates = req.body;
    
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

// Mute user in group
router.post('/:groupId/mute', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, mutedBy } = req.body;
    
    await groupService.muteUser(groupId, userId, mutedBy);
    await audioRoutingService.muteParticipant(groupId, userId, mutedBy);
    
    res.json({
      success: true,
      message: 'User muted successfully'
    });
  } catch (error) {
    logger.error('Failed to mute user:', error);
    res.status(500).json({ error: error.message || 'Failed to mute user' });
  }
});

// Unmute user in group
router.post('/:groupId/unmute', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, unmutedBy } = req.body;
    
    await groupService.unmuteUser(groupId, userId, unmutedBy);
    await audioRoutingService.unmuteParticipant(groupId, userId, unmutedBy);
    
    res.json({
      success: true,
      message: 'User unmuted successfully'
    });
  } catch (error) {
    logger.error('Failed to unmute user:', error);
    res.status(500).json({ error: error.message || 'Failed to unmute user' });
  }
});

// Set participant volume
router.post('/:groupId/volume', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, volume } = req.body;
    
    audioRoutingService.setParticipantVolume(groupId, userId, volume);
    
    res.json({
      success: true,
      message: 'Volume set successfully'
    });
  } catch (error) {
    logger.error('Failed to set volume:', error);
    res.status(500).json({ error: 'Failed to set volume' });
  }
});

// Set priority speaker
router.post('/:groupId/priority', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, isPriority } = req.body;
    
    audioRoutingService.setPrioritySpeaker(groupId, userId, isPriority);
    
    res.json({
      success: true,
      message: 'Priority speaker set successfully'
    });
  } catch (error) {
    logger.error('Failed to set priority speaker:', error);
    res.status(500).json({ error: 'Failed to set priority speaker' });
  }
});

// Start group recording
router.post('/:groupId/recording/start', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { startedBy } = req.body;
    
    const recording = await groupService.startGroupRecording(groupId, startedBy);
    
    res.json({
      success: true,
      recording,
      message: 'Recording started successfully'
    });
  } catch (error) {
    logger.error('Failed to start recording:', error);
    res.status(500).json({ error: error.message || 'Failed to start recording' });
  }
});

// Stop group recording
router.post('/:groupId/recording/stop', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { stoppedBy } = req.body;
    
    const result = await groupService.stopGroupRecording(groupId, stoppedBy);
    
    res.json({
      success: true,
      result,
      message: 'Recording stopped successfully'
    });
  } catch (error) {
    logger.error('Failed to stop recording:', error);
    res.status(500).json({ error: error.message || 'Failed to stop recording' });
  }
});

// Send broadcast message
router.post('/:groupId/broadcast', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { message, senderId } = req.body;
    
    const broadcast = await groupService.sendBroadcast(groupId, message, senderId);
    
    res.json({
      success: true,
      broadcast,
      message: 'Broadcast sent successfully'
    });
  } catch (error) {
    logger.error('Failed to send broadcast:', error);
    res.status(500).json({ error: 'Failed to send broadcast' });
  }
});

// Get group broadcasts
router.get('/:groupId/broadcasts', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { limit = 50 } = req.query;
    
    const broadcasts = groupService.getGroupBroadcasts(groupId, parseInt(limit));
    
    res.json(broadcasts);
  } catch (error) {
    logger.error('Failed to get broadcasts:', error);
    res.status(500).json({ error: 'Failed to get broadcasts' });
  }
});

// Get group statistics
router.get('/:groupId/stats', async (req, res) => {
  try {
    const { groupId } = req.params;
    const stats = groupService.getGroupStats(groupId);
    
    if (!stats) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get group stats:', error);
    res.status(500).json({ error: 'Failed to get group stats' });
  }
});

// Get all group statistics
router.get('/stats/all', async (req, res) => {
  try {
    const stats = groupService.getAllGroupStats();
    const audioStats = audioRoutingService.getAllAudioRoutingStats();
    
    res.json({
      groups: stats,
      audioRouting: audioStats,
    });
  } catch (error) {
    logger.error('Failed to get all group stats:', error);
    res.status(500).json({ error: 'Failed to get group stats' });
  }
});

// Get participant audio status
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

    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await groupService.joinGroup(groupId, userId, user);
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

// Hoot/broadcast endpoints
router.get('/:groupId/hoot/status', async (req, res) => {
  try {
    const status = groupService.getHootStatus(req.params.groupId);
    if (!status) {
      return res.status(404).json({ error: 'Hoot channel not found' });
    }

    res.json({
      success: true,
      hoot: status,
    });
  } catch (error) {
    logger.error('Failed to get hoot status:', error);
    res.status(500).json({ error: error.message || 'Failed to get hoot status' });
  }
});

router.post('/:groupId/hoot/start', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, options = {} } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required to start hoot' });
    }

    const status = await groupService.startHoot(groupId, userId, options);
    res.json({
      success: true,
      hoot: status,
    });
  } catch (error) {
    logger.error('Failed to start hoot:', error);
    res.status(500).json({ error: error.message || 'Failed to start hoot' });
  }
});

router.post('/:groupId/hoot/stop', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, reason } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required to stop hoot' });
    }

    const status = await groupService.stopHoot(groupId, userId, reason);
    res.json({
      success: true,
      hoot: status,
    });
  } catch (error) {
    logger.error('Failed to stop hoot:', error);
    res.status(500).json({ error: error.message || 'Failed to stop hoot' });
  }
});

router.post('/:groupId/hoot/listen', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, persistent = false } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required to join hoot' });
    }

    const status = groupService.addHootListener(groupId, userId, { persistent });
    res.json({
      success: true,
      hoot: status,
    });
  } catch (error) {
    logger.error('Failed to join hoot:', error);
    res.status(500).json({ error: error.message || 'Failed to join hoot' });
  }
});

router.delete('/:groupId/hoot/listen/:userId', async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const { keepPersistent = false } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required to leave hoot' });
    }

    const status = groupService.removeHootListener(groupId, userId, { keepPersistent: keepPersistent === 'true' });
    res.json({
      success: true,
      hoot: status,
    });
  } catch (error) {
    logger.error('Failed to leave hoot:', error);
    res.status(500).json({ error: error.message || 'Failed to leave hoot' });
  }
});

module.exports = router;
