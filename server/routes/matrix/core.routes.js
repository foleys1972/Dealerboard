const express = require('express');
const router = express.Router();
const multer = require('multer');
const { matrixService } = require('../../services/matrixService');
const { authenticateToken } = require('../authRoutes');
const { requireAdmin, handleServiceError, logger } = require('./routeHelpers');
const { lookupAssignmentForRoom, listRoomMappings } = require('../../services/matrix/roomAssignmentService');
const { isAdminRole } = require('../../services/dealerboard/validators');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

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

// Create Matrix room for group (with orchestrator integration)
router.post('/room', async (req, res) => {
  try {
    const { groupId, groupData, homeserverId } = req.body;
    
    // Use orchestrator if available, otherwise use default
    const roomId = await matrixService.createGroupRoom(groupId, groupData, { homeserverId });
    const assignmentInfo = await lookupAssignmentForRoom(roomId);
    
    res.json({
      success: true,
      roomId,
      assignment: assignmentInfo,
      message: 'Matrix room created successfully'
    });
  } catch (error) {
    logger.error('Failed to create Matrix room:', error);
    res.status(500).json({ error: 'Failed to create Matrix room', details: error.message });
  }
});

// Join Matrix room
router.post('/room/:roomId/join', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id || req.user.userId;
    
    await matrixService.joinRoom(roomId, userId);
    
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
router.post('/room/:roomId/leave', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id || req.user.userId;
    
    await matrixService.leaveRoom(roomId, userId);
    
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

// Upload file and send as message
router.post('/room/:roomId/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { roomId } = req.params;
    const { messageText } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const result = await matrixService.uploadFile(
      roomId,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      messageText || ''
    );
    
    res.json({
      success: true,
      ...result,
      message: 'File uploaded and sent successfully'
    });
  } catch (error) {
    logger.error('Failed to upload file:', error);
    res.status(500).json({ error: 'Failed to upload file', details: error.message });
  }
});

// Send typing indicator
router.post('/room/:roomId/typing', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { isTyping = true, timeout = 30000 } = req.body;
    const userId = req.user.id || req.user.userId;
    
    await matrixService.sendTyping(roomId, userId, isTyping, timeout);
    
    res.json({
      success: true,
      message: 'Typing indicator sent'
    });
  } catch (error) {
    logger.error('Failed to send typing indicator:', error);
    res.status(500).json({ error: 'Failed to send typing indicator' });
  }
});

// Edit message
router.put('/room/:roomId/message/:eventId', authenticateToken, async (req, res) => {
  try {
    const { roomId, eventId } = req.params;
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const newEventId = await matrixService.editMessage(roomId, eventId, content);
    
    res.json({
      success: true,
      eventId: newEventId,
      message: 'Message edited successfully'
    });
  } catch (error) {
    logger.error('Failed to edit message:', error);
    res.status(500).json({ error: 'Failed to edit message', details: error.message });
  }
});

// Delete message
router.delete('/room/:roomId/message/:eventId', authenticateToken, async (req, res) => {
  try {
    const { roomId, eventId } = req.params;
    const { reason } = req.body;
    
    await matrixService.deleteMessage(roomId, eventId, reason || '');
    
    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete message:', error);
    res.status(500).json({ error: 'Failed to delete message', details: error.message });
  }
});

// Add reaction to message
router.post('/room/:roomId/message/:eventId/reaction', authenticateToken, async (req, res) => {
  try {
    const { roomId, eventId } = req.params;
    const { key } = req.body;
    
    if (!key) {
      return res.status(400).json({ error: 'Reaction key (emoji) is required' });
    }

    const reactionEventId = await matrixService.addReaction(roomId, eventId, key);
    
    res.json({
      success: true,
      eventId: reactionEventId,
      message: 'Reaction added successfully'
    });
  } catch (error) {
    logger.error('Failed to add reaction:', error);
    res.status(500).json({ error: 'Failed to add reaction', details: error.message });
  }
});

// Remove reaction from message
router.delete('/room/:roomId/reaction/:reactionEventId', authenticateToken, async (req, res) => {
  try {
    const { roomId, reactionEventId } = req.params;
    const { eventId } = req.query; // Original message event ID
    
    await matrixService.removeReaction(roomId, eventId, reactionEventId);
    
    res.json({
      success: true,
      message: 'Reaction removed successfully'
    });
  } catch (error) {
    logger.error('Failed to remove reaction:', error);
    res.status(500).json({ error: 'Failed to remove reaction', details: error.message });
  }
});

// Search messages in room
router.get('/room/:roomId/search', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { q, limit = 50 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }

    const results = await matrixService.searchMessages(roomId, q, parseInt(limit));
    
    res.json({
      success: true,
      results,
      count: results.length
    });
  } catch (error) {
    logger.error('Failed to search messages:', error);
    res.status(500).json({ error: 'Failed to search messages', details: error.message });
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

// Get messages from Matrix room (fetches all messages, no limit)
router.get('/room/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const fromToken = req.query.from || null;
    
    // Fetch all messages (no limit, uses pagination internally)
    const result = await matrixService.getRoomMessages(roomId, null, fromToken);
    
    res.json(result);
  } catch (error) {
    logger.error('Failed to get Matrix room messages:', error);
    res.status(500).json({ error: error.message || 'Failed to get room messages' });
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

// Get participants for a Matrix room (cross-region)
router.get('/rooms/:roomId/participants', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const orchestratorService = getOrchestratorService();
    
    // Get all participants for the room (aggregated across homeservers)
    const participants = await orchestratorService.getRoomParticipants(roomId);
    
    res.json({
      success: true,
      roomId,
      participants,
      count: participants.length
    });
  } catch (error) {
    logger.error('Failed to get room participants:', error);
    res.status(500).json({ error: 'Failed to get room participants', details: error.message });
  }
});

// Get all Matrix room mappings with assignments
router.get('/rooms', authenticateToken, async (req, res) => {
  try {
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const result = await listRoomMappings(matrixService);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get room mappings');
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

// Export all Matrix messages for compliance (admin only)
router.get('/compliance/export', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { startDate, endDate, roomIds, format = 'json' } = req.query;
    
    // Parse roomIds if provided (comma-separated)
    const roomIdsArray = roomIds ? roomIds.split(',').map(id => id.trim()) : null;

    // Export messages
    const exportResult = await matrixService.exportMessagesForCompliance({
      startDate: startDate || null,
      endDate: endDate || null,
      roomIds: roomIdsArray,
      format: format.toLowerCase()
    });

    // Log compliance export
    const { complianceService } = require('../services/complianceService');
    if (complianceService) {
      complianceService.logComplianceEvent('matrix_messages_exported', {
        exportedBy: req.user.id,
        exportedByUsername: req.user.username,
        messageCount: exportResult.messageCount,
        roomCount: exportResult.roomCount,
        format: exportResult.format,
        startDate: startDate || 'all',
        endDate: endDate || 'all'
      });
    }

    // Set appropriate headers based on format
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="matrix-messages-export-${Date.now()}.csv"`);
      res.send(exportResult.data);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="matrix-messages-export-${Date.now()}.json"`);
      res.json(exportResult.data);
    }
  } catch (error) {
    logger.error('Failed to export Matrix messages for compliance:', error);
    res.status(500).json({ error: 'Failed to export messages', details: error.message });
  }
});

// Mark a message as read (send read receipt)
router.post('/room/:roomId/read/:eventId', authenticateToken, async (req, res) => {
  try {
    const { roomId, eventId } = req.params;
    
    await matrixService.markMessageAsRead(roomId, eventId);
    
    res.json({
      success: true,
      message: 'Message marked as read'
    });
  } catch (error) {
    logger.error('Failed to mark message as read:', error);
    res.status(500).json({ error: 'Failed to mark message as read', details: error.message });
  }
});

// Mark all messages in a room as read
router.post('/room/:roomId/read', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { eventId } = req.body; // Optional: mark up to specific event
    
    await matrixService.markRoomAsRead(roomId, eventId);
    
    res.json({
      success: true,
      message: 'Room marked as read'
    });
  } catch (error) {
    logger.error('Failed to mark room as read:', error);
    res.status(500).json({ error: 'Failed to mark room as read', details: error.message });
  }
});

// Get read receipts for a message
router.get('/room/:roomId/receipts/:eventId', authenticateToken, async (req, res) => {
  try {
    const { roomId, eventId } = req.params;
    
    const receipts = await matrixService.getReadReceipts(roomId, eventId);
    
    res.json({
      success: true,
      ...receipts
    });
  } catch (error) {
    logger.error('Failed to get read receipts:', error);
    res.status(500).json({ error: 'Failed to get read receipts', details: error.message });
  }
});

// Get compliance export status/info (admin only)
router.get('/compliance/status', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const rooms = matrixService.client?.getRooms() || [];
    const roomStats = rooms.map(room => {
      const timeline = room.timeline || [];
      const messageCount = timeline.filter(e => e.getType() === 'm.room.message').length;
      
      return {
        roomId: room.roomId,
        roomName: room.name || 'Unnamed Room',
        roomType: matrixService.getGroupIdFromRoomId(room.roomId) ? 'group' : 'direct',
        memberCount: room.getJoinedMemberCount(),
        messageCount: messageCount,
        lastActivity: timeline.length > 0 ? timeline[timeline.length - 1]?.getTs() : null
      };
    });

    res.json({
      success: true,
      totalRooms: rooms.length,
      totalMessages: roomStats.reduce((sum, stat) => sum + stat.messageCount, 0),
      rooms: roomStats
    });
  } catch (error) {
    logger.error('Failed to get Matrix compliance status:', error);
    res.status(500).json({ error: 'Failed to get compliance status', details: error.message });
  }
});

module.exports = router;
