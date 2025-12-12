const express = require('express');
const router = express.Router();
const { matrixService } = require('../services/matrixService');
const { groupService } = require('../services/groupService');
const logger = require('../utils/logger');

// Get Matrix service status
router.get('/status', async (req, res) => {
  try {
    const status = matrixService.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('Failed to get Matrix status:', error);
    res.status(500).json({ error: 'Failed to get Matrix status' });
  }
});

// Get server federation info
router.get('/federation', async (req, res) => {
  try {
    const info = await matrixService.getServerFederationInfo();
    res.json(info);
  } catch (error) {
    logger.error('Failed to get federation info:', error);
    res.status(500).json({ error: 'Failed to get federation info' });
  }
});

// Create Matrix room for group
router.post('/room', async (req, res) => {
  try {
    const { groupId, groupData } = req.body;
    
    const roomId = await matrixService.createGroupRoom(groupId, groupData);
    
    res.json({
      success: true,
      roomId,
      message: 'Matrix room created successfully'
    });
  } catch (error) {
    logger.error('Failed to create Matrix room:', error);
    res.status(500).json({ error: 'Failed to create Matrix room' });
  }
});

// Join Matrix room
router.post('/room/:roomId/join', async (req, res) => {
  try {
    const { roomId } = req.params;
    
    await matrixService.joinRoom(roomId);
    
    res.json({
      success: true,
      message: 'Joined Matrix room successfully'
    });
  } catch (error) {
    logger.error('Failed to join Matrix room:', error);
    res.status(500).json({ error: 'Failed to join Matrix room' });
  }
});

// Leave Matrix room
router.post('/room/:roomId/leave', async (req, res) => {
  try {
    const { roomId } = req.params;
    
    await matrixService.leaveRoom(roomId);
    
    res.json({
      success: true,
      message: 'Left Matrix room successfully'
    });
  } catch (error) {
    logger.error('Failed to leave Matrix room:', error);
    res.status(500).json({ error: 'Failed to leave Matrix room' });
  }
});

// Send message to Matrix room
router.post('/room/:roomId/message', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { message, messageType = 'm.text' } = req.body;
    
    await matrixService.sendMessage(roomId, message, messageType);
    
    res.json({
      success: true,
      message: 'Message sent successfully'
    });
  } catch (error) {
    logger.error('Failed to send Matrix message:', error);
    res.status(500).json({ error: 'Failed to send Matrix message' });
  }
});

// Send broadcast to group's Matrix room
router.post('/group/:groupId/broadcast', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { message, senderId } = req.body;
    
    await matrixService.sendGroupBroadcast(groupId, message, senderId);
    
    res.json({
      success: true,
      message: 'Broadcast sent successfully'
    });
  } catch (error) {
    logger.error('Failed to send group broadcast:', error);
    res.status(500).json({ error: 'Failed to send group broadcast' });
  }
});

// Invite user to Matrix room
router.post('/room/:roomId/invite', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.body;
    
    await matrixService.inviteUser(roomId, userId);
    
    res.json({
      success: true,
      message: 'User invited successfully'
    });
  } catch (error) {
    logger.error('Failed to invite user:', error);
    res.status(500).json({ error: 'Failed to invite user' });
  }
});

// Kick user from Matrix room
router.post('/room/:roomId/kick', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId, reason = '' } = req.body;
    
    await matrixService.kickUser(roomId, userId, reason);
    
    res.json({
      success: true,
      message: 'User kicked successfully'
    });
  } catch (error) {
    logger.error('Failed to kick user:', error);
    res.status(500).json({ error: 'Failed to kick user' });
  }
});

// Set user power level in Matrix room
router.post('/room/:roomId/power-level', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId, powerLevel } = req.body;
    
    await matrixService.setUserPowerLevel(roomId, userId, powerLevel);
    
    res.json({
      success: true,
      message: 'Power level set successfully'
    });
  } catch (error) {
    logger.error('Failed to set power level:', error);
    res.status(500).json({ error: 'Failed to set power level' });
  }
});

// Get room information
router.get('/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    
    const roomInfo = await matrixService.getRoomInfo(roomId);
    
    res.json(roomInfo);
  } catch (error) {
    logger.error('Failed to get room info:', error);
    res.status(500).json({ error: 'Failed to get room info' });
  }
});

// Get room members
router.get('/room/:roomId/members', async (req, res) => {
  try {
    const { roomId } = req.params;
    
    const members = await matrixService.getRoomMembers(roomId);
    
    res.json(members);
  } catch (error) {
    logger.error('Failed to get room members:', error);
    res.status(500).json({ error: 'Failed to get room members' });
  }
});

// Get group's Matrix room ID
router.get('/group/:groupId/room', async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const roomId = matrixService.getGroupRoomId(groupId);
    
    if (!roomId) {
      return res.status(404).json({ error: 'No Matrix room found for group' });
    }
    
    res.json({ roomId });
  } catch (error) {
    logger.error('Failed to get group room ID:', error);
    res.status(500).json({ error: 'Failed to get group room ID' });
  }
});

// Sync group with Matrix room
router.post('/group/:groupId/sync', async (req, res) => {
  try {
    const { groupId } = req.params;
    
    await matrixService.syncGroupWithMatrix(groupId);
    
    res.json({
      success: true,
      message: 'Group synced with Matrix room successfully'
    });
  } catch (error) {
    logger.error('Failed to sync group with Matrix:', error);
    res.status(500).json({ error: 'Failed to sync group with Matrix' });
  }
});

// Get all Matrix room mappings
router.get('/rooms', async (req, res) => {
  try {
    const status = matrixService.getStatus();
    
    res.json({
      roomCount: status.roomCount,
      rooms: Array.from(matrixService.roomMappings.entries()).map(([groupId, roomId]) => ({
        groupId,
        roomId,
      })),
    });
  } catch (error) {
    logger.error('Failed to get room mappings:', error);
    res.status(500).json({ error: 'Failed to get room mappings' });
  }
});

// Handle Matrix webhook events
router.post('/webhook', async (req, res) => {
  try {
    const { type, content, sender, room_id } = req.body;
    
    logger.info(`Matrix webhook received: ${type} from ${sender} in ${room_id}`);
    
    // Handle different webhook event types
    switch (type) {
      case 'm.room.message':
        // Handle message events
        break;
      case 'm.room.member':
        // Handle member events
        break;
      case 'm.room.power_levels':
        // Handle power level events
        break;
      default:
        logger.debug(`Unhandled Matrix webhook event type: ${type}`);
    }
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to handle Matrix webhook:', error);
    res.status(500).json({ error: 'Failed to handle Matrix webhook' });
  }
});

// Get Matrix client logs
router.get('/logs', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    
    // This would typically fetch logs from a logging service
    // For now, return a placeholder response
    res.json({
      logs: [],
      message: 'Logs endpoint not implemented yet'
    });
  } catch (error) {
    logger.error('Failed to get Matrix logs:', error);
    res.status(500).json({ error: 'Failed to get Matrix logs' });
  }
});

// Test Matrix connection
router.post('/test', async (req, res) => {
  try {
    const status = matrixService.getStatus();
    
    if (!status.isInitialized) {
      return res.status(400).json({ error: 'Matrix client not initialized' });
    }
    
    if (!status.isConnected) {
      return res.status(400).json({ error: 'Matrix client not connected' });
    }
    
    res.json({
      success: true,
      message: 'Matrix connection test successful',
      status,
    });
  } catch (error) {
    logger.error('Failed to test Matrix connection:', error);
    res.status(500).json({ error: 'Failed to test Matrix connection' });
  }
});

module.exports = router;
