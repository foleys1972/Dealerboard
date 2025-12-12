const express = require('express');
const router = express.Router();
const { matrixService } = require('../services/matrixService');
const { groupService } = require('../services/groupService');
const { pool } = require('../services/databaseService');
const { authenticateToken } = require('./authRoutes');
const { getOrchestratorService } = require('../services/orchestratorService');
const { getMatrixFederationService } = require('../services/matrixFederationService');
const { getServerRole } = require('../utils/serverRole');
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

// Create Matrix room for group (with orchestrator integration)
router.post('/room', async (req, res) => {
  try {
    const { groupId, groupData, homeserverId } = req.body;
    
    // Use orchestrator if available, otherwise use default
    const roomId = await matrixService.createGroupRoom(groupId, groupData, { homeserverId });
    
    // Get room assignment info if available
    let assignmentInfo = null;
    try {
      const result = await pool.query(
        `SELECT mra.*, mh.server_name, mh.region, mh.base_url
         FROM matrix_room_assignments mra
         LEFT JOIN matrix_homeservers mh ON mra.homeserver_id = mh.id
         WHERE mra.room_id = $1`,
        [roomId]
      );
      if (result.rows.length > 0) {
        assignmentInfo = {
          homeserverId: result.rows[0].homeserver_id,
          homeserverName: result.rows[0].server_name,
          region: result.rows[0].region,
          baseUrl: result.rows[0].base_url
        };
      }
    } catch (error) {
      logger.warn('Failed to get room assignment info:', error.message);
    }
    
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

// Create a new chat room (1:1 or group chat)
router.post('/chat/create', authenticateToken, async (req, res) => {
  try {
    const { name, type, members } = req.body;
    const currentUserId = req.user.id || req.user.userId;
    
    if (!name || !type || !['direct', 'group'].includes(type)) {
      return res.status(400).json({ error: 'Invalid room data. Name and type (direct/group) are required.' });
    }

    // For direct chats, ensure exactly 2 members (current user + one other)
    if (type === 'direct') {
      if (!members || members.length !== 1) {
        return res.status(400).json({ error: 'Direct chat requires exactly one other member' });
      }
    }

    // Get Matrix user IDs for all members
    const memberMatrixIds = [];
    for (const userId of members || []) {
      const matrixId = await matrixService.getMatrixUserId(userId);
      if (matrixId) {
        memberMatrixIds.push(matrixId);
      }
    }

    // Create the chat room
    const roomData = {
      name,
      type,
      members: memberMatrixIds,
      createdBy: currentUserId
    };

    const result = await matrixService.createChatRoom(roomData);
    
    res.json({
      success: true,
      ...result,
      message: 'Chat room created successfully'
    });
  } catch (error) {
    logger.error('Failed to create chat room:', error);
    res.status(500).json({ error: 'Failed to create chat room', details: error.message });
  }
});

// Get all chat rooms for current user (including archived)
router.get('/chat/rooms', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.id || req.user.userId;
    const { includeArchived = false } = req.query;
    
    const query = includeArchived === 'true'
      ? `SELECT * FROM matrix_chat_rooms WHERE created_by = $1 OR $2 = ANY(members) ORDER BY last_activity DESC NULLS LAST`
      : `SELECT * FROM matrix_chat_rooms WHERE (created_by = $1 OR $2 = ANY(members)) AND is_archived = false ORDER BY last_activity DESC NULLS LAST`;
    
    const result = await pool.query(query, [currentUserId, currentUserId]);
    
    const rooms = result.rows.map(row => ({
      id: row.id,
      roomId: row.room_id,
      name: row.name,
      type: row.type,
      createdBy: row.created_by,
      members: row.members || [],
      lastActivity: row.last_activity,
      isArchived: row.is_archived,
      archivedAt: row.archived_at,
      createdAt: row.created_at
    }));

    res.json({
      success: true,
      rooms
    });
  } catch (error) {
    logger.error('Failed to get chat rooms:', error);
    res.status(500).json({ error: 'Failed to get chat rooms', details: error.message });
  }
});

// Archive a room
router.post('/chat/:roomId/archive', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const currentUserId = req.user.id || req.user.userId;
    
    // Verify user has access to this room
    const roomResult = await pool.query(
      `SELECT * FROM matrix_chat_rooms WHERE room_id = $1 AND (created_by = $2 OR $2 = ANY(members))`,
      [roomId, currentUserId]
    );
    
    if (roomResult.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query(
      `UPDATE matrix_chat_rooms SET is_archived = true, archived_at = NOW() WHERE room_id = $1`,
      [roomId]
    );

    res.json({
      success: true,
      message: 'Room archived successfully'
    });
  } catch (error) {
    logger.error('Failed to archive room:', error);
    res.status(500).json({ error: 'Failed to archive room', details: error.message });
  }
});

// Unarchive a room
router.post('/chat/:roomId/unarchive', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    
    await matrixService.unarchiveRoom(roomId);

    res.json({
      success: true,
      message: 'Room unarchived successfully'
    });
  } catch (error) {
    logger.error('Failed to unarchive room:', error);
    res.status(500).json({ error: 'Failed to unarchive room', details: error.message });
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
const multer = require('multer');
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

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

// Get or create direct message room between two users
router.get('/direct/:contactId/room', authenticateToken, async (req, res) => {
  try {
    const { contactId } = req.params;
    const currentUserId = req.user.id;
    
    // Get contact details
    const { getDirectContactById, getUserById } = require('../services/databaseService');
    const contact = await getDirectContactById(contactId);
    
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    // Verify ownership
    if (contact.ownerId !== currentUserId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to access this contact' });
    }
    
    // Get Matrix user IDs
    const currentUserMatrixId = await matrixService.getMatrixUserId(currentUserId);
    let contactUserMatrixId = null;
    
    if (contact.contactUserId) {
      // Contact is a registered user
      contactUserMatrixId = await matrixService.getMatrixUserId(contact.contactUserId);
    } else if (contact.uri) {
      // Contact is external - try to extract Matrix user ID from URI
      // For now, we'll need the contact to have a Matrix user ID in metadata
      contactUserMatrixId = contact.metadata?.matrixUserId || null;
    }
    
    if (!currentUserMatrixId) {
      return res.status(400).json({ error: 'Current user does not have a Matrix account' });
    }
    
    if (!contactUserMatrixId) {
      return res.status(400).json({ 
        error: 'Contact does not have a Matrix account. External contacts need Matrix user ID in metadata.' 
      });
    }
    
    // Get or create direct room
    const roomId = await matrixService.getOrCreateDirectRoom(
      currentUserId,
      contact.contactUserId || contact.id,
      currentUserMatrixId,
      contactUserMatrixId
    );
    
    res.json({
      success: true,
      roomId,
      contactId,
      currentUserId,
      contactUserId: contact.contactUserId
    });
  } catch (error) {
    logger.error('Failed to get/create direct room:', error);
    res.status(500).json({ error: error.message || 'Failed to get/create direct room' });
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
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const status = matrixService.getStatus();
    
    // Get room assignments from database
    const assignmentsResult = await pool.query(
      `SELECT mra.*, mh.server_name, mh.region, mh.base_url
       FROM matrix_room_assignments mra
       LEFT JOIN matrix_homeservers mh ON mra.homeserver_id = mh.id
       ORDER BY mra.created_at DESC`
    );

    const assignmentsMap = new Map();
    assignmentsResult.rows.forEach(row => {
      assignmentsMap.set(row.room_id, {
        homeserverId: row.homeserver_id,
        homeserverName: row.server_name,
        region: row.region,
        baseUrl: row.base_url
      });
    });
    
    const rooms = Array.from(matrixService.roomMappings.entries()).map(([groupId, roomId]) => ({
      groupId,
      roomId,
      assignment: assignmentsMap.get(roomId) || null
    }));
    
    res.json({
      roomCount: rooms.length,
      rooms
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

// Export all Matrix messages for compliance (admin only)
router.get('/compliance/export', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
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
    if (req.user.role !== 'admin') {
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

// ============================================
// Matrix Homeserver Registry Routes (Admin Only)
// ============================================

// Get all Matrix homeservers
// Admin: can see all homeservers with full details
// Non-admin: can only see active homeservers in their region (for client routing)
router.get('/homeservers', authenticateToken, async (req, res) => {
  try {
    const { region, isActive } = req.query;
    const isAdmin = req.user.role === 'admin';
    
    let query = `
      SELECT 
        id, subscriber_id, region, server_name, base_url, federation_url,
        is_self_hosted, external_provider, location_id, is_active,
        capacity, current_load, metadata, created_at, updated_at
      FROM matrix_homeservers
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    // Non-admin users can only see active homeservers
    if (!isAdmin) {
      query += ` AND is_active = true`;
    }
    
    // Non-admin users can only query their own region
    if (!isAdmin) {
      // Get user's region
      const userResult = await pool.query(
        `SELECT region FROM users WHERE id = $1`,
        [req.user.id || req.user.userId]
      );
      const userRegion = userResult.rows[0]?.region;
      if (userRegion) {
        query += ` AND region = $${paramIndex}`;
        params.push(userRegion);
        paramIndex++;
      }
    } else if (region) {
      // Admin can filter by region
      query += ` AND region = $${paramIndex}`;
      params.push(region);
      paramIndex++;
    }
    
    if (isAdmin && isActive !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      params.push(isActive === 'true');
      paramIndex++;
    }
    
    query += ` ORDER BY region, server_name`;
    
    const result = await pool.query(query, params);
    
    const homeservers = result.rows.map(row => ({
      id: row.id,
      subscriberId: row.subscriber_id,
      region: row.region,
      serverName: row.server_name,
      baseUrl: row.base_url,
      federationUrl: row.federation_url,
      isSelfHosted: row.is_self_hosted,
      externalProvider: row.external_provider,
      locationId: row.location_id,
      isActive: row.is_active,
      capacity: row.capacity,
      currentLoad: row.current_load,
      metadata: isAdmin ? row.metadata : undefined, // Hide metadata for non-admins
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    
    res.json({ homeservers });
  } catch (error) {
    logger.error('Failed to get homeservers:', error);
    res.status(500).json({ error: 'Failed to get homeservers', details: error.message });
  }
});

// Old endpoint - keeping for backward compatibility but redirecting to new one
router.get('/homeservers/old', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { region, subscriberId } = req.query;
    let query = `SELECT mh.*, s.name as subscriber_name, l.name as location_name
                 FROM matrix_homeservers mh
                 LEFT JOIN subscribers s ON mh.subscriber_id = s.id
                 LEFT JOIN locations l ON mh.location_id = l.id
                 WHERE 1=1`;
    const params = [];
    let paramCount = 1;

    if (region) {
      query += ` AND mh.region = $${paramCount++}`;
      params.push(region);
    }

    if (subscriberId) {
      query += ` AND mh.subscriber_id = $${paramCount++}`;
      params.push(subscriberId);
    }

    query += ` ORDER BY mh.region, mh.server_name`;

    const result = await pool.query(query, params);

    const homeservers = result.rows.map(row => ({
      id: row.id,
      subscriberId: row.subscriber_id,
      subscriberName: row.subscriber_name,
      region: row.region,
      serverName: row.server_name,
      baseUrl: row.base_url,
      federationUrl: row.federation_url,
      isSelfHosted: row.is_self_hosted,
      externalProvider: row.external_provider,
      locationId: row.location_id,
      locationName: row.location_name,
      isActive: row.is_active,
      capacity: row.capacity,
      currentLoad: row.current_load,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    res.json({
      success: true,
      homeservers,
      count: homeservers.length
    });
  } catch (error) {
    logger.error('Failed to get Matrix homeservers:', error);
    res.status(500).json({ error: 'Failed to get homeservers', details: error.message });
  }
});

// Get a specific Matrix homeserver
router.get('/homeservers/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const result = await pool.query(
      `SELECT mh.*, s.name as subscriber_name, l.name as location_name
       FROM matrix_homeservers mh
       LEFT JOIN subscribers s ON mh.subscriber_id = s.id
       LEFT JOIN locations l ON mh.location_id = l.id
       WHERE mh.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Homeserver not found' });
    }

    const row = result.rows[0];
    const homeserver = {
      id: row.id,
      subscriberId: row.subscriber_id,
      subscriberName: row.subscriber_name,
      region: row.region,
      serverName: row.server_name,
      baseUrl: row.base_url,
      federationUrl: row.federation_url,
      isSelfHosted: row.is_self_hosted,
      externalProvider: row.external_provider,
      locationId: row.location_id,
      locationName: row.location_name,
      isActive: row.is_active,
      capacity: row.capacity,
      currentLoad: row.current_load,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    res.json({
      success: true,
      homeserver
    });
  } catch (error) {
    logger.error('Failed to get Matrix homeserver:', error);
    res.status(500).json({ error: 'Failed to get homeserver', details: error.message });
  }
});

// Create a new Matrix homeserver
router.post('/homeservers', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const {
      subscriberId,
      region,
      serverName,
      baseUrl,
      federationUrl,
      isSelfHosted = true,
      externalProvider,
      locationId,
      capacity = 1000,
      metadata = {}
    } = req.body;

    // Validation
    if (!region || !['US', 'UK', 'APAC'].includes(region)) {
      return res.status(400).json({ error: 'Valid region (US, UK, APAC) is required' });
    }
    if (!serverName) {
      return res.status(400).json({ error: 'Server name is required' });
    }
    if (!baseUrl) {
      return res.status(400).json({ error: 'Base URL is required' });
    }

    // Get server role to determine subscriber_id if not provided
    let finalSubscriberId = subscriberId;
    if (!finalSubscriberId) {
      const serverRole = await getServerRole();
      if (serverRole.role === 'subscriber' && serverRole.serverId) {
        // Get subscriber ID from server_id
        const subResult = await pool.query(
          `SELECT id FROM subscribers WHERE server_id = $1`,
          [serverRole.serverId]
        );
        if (subResult.rows.length > 0) {
          finalSubscriberId = subResult.rows[0].id;
        }
      }
    }

    const id = `homeserver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const result = await pool.query(
      `INSERT INTO matrix_homeservers 
       (id, subscriber_id, region, server_name, base_url, federation_url, is_self_hosted, 
        external_provider, location_id, capacity, metadata, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
       RETURNING *`,
      [id, finalSubscriberId, region, serverName, baseUrl, federationUrl || null, 
       isSelfHosted, externalProvider || null, locationId || null, capacity, JSON.stringify(metadata)]
    );

    // Reload orchestrator service if it exists
    try {
      const orchestratorService = getOrchestratorService();
      if (orchestratorService.isInitialized) {
        await orchestratorService.loadManagedHomeservers();
      }
    } catch (error) {
      logger.warn('Failed to reload orchestrator homeservers:', error);
    }

    // Reload federation service if it exists
    try {
      const federationService = getMatrixFederationService();
      if (federationService.isInitialized) {
        await federationService.reloadFederationConfig();
      }
    } catch (error) {
      logger.warn('Failed to reload federation config:', error);
    }

    res.json({
      success: true,
      homeserver: {
        id: result.rows[0].id,
        subscriberId: result.rows[0].subscriber_id,
        region: result.rows[0].region,
        serverName: result.rows[0].server_name,
        baseUrl: result.rows[0].base_url,
        federationUrl: result.rows[0].federation_url,
        isSelfHosted: result.rows[0].is_self_hosted,
        externalProvider: result.rows[0].external_provider,
        locationId: result.rows[0].location_id,
        isActive: result.rows[0].is_active,
        capacity: result.rows[0].capacity,
        currentLoad: result.rows[0].current_load,
        metadata: result.rows[0].metadata || {},
        createdAt: result.rows[0].created_at,
        updatedAt: result.rows[0].updated_at
      },
      message: 'Homeserver created successfully'
    });
  } catch (error) {
    logger.error('Failed to create Matrix homeserver:', error);
    res.status(500).json({ error: 'Failed to create homeserver', details: error.message });
  }
});

// Update a Matrix homeserver
router.put('/homeservers/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const {
      region,
      serverName,
      baseUrl,
      federationUrl,
      isSelfHosted,
      externalProvider,
      locationId,
      isActive,
      capacity,
      metadata
    } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (region !== undefined) {
      if (!['US', 'UK', 'APAC'].includes(region)) {
        return res.status(400).json({ error: 'Invalid region. Must be US, UK, or APAC' });
      }
      updates.push(`region = $${paramCount++}`);
      values.push(region);
    }

    if (serverName !== undefined) {
      updates.push(`server_name = $${paramCount++}`);
      values.push(serverName);
    }

    if (baseUrl !== undefined) {
      updates.push(`base_url = $${paramCount++}`);
      values.push(baseUrl);
    }

    if (federationUrl !== undefined) {
      updates.push(`federation_url = $${paramCount++}`);
      values.push(federationUrl);
    }

    if (isSelfHosted !== undefined) {
      updates.push(`is_self_hosted = $${paramCount++}`);
      values.push(isSelfHosted);
    }

    if (externalProvider !== undefined) {
      updates.push(`external_provider = $${paramCount++}`);
      values.push(externalProvider);
    }

    if (locationId !== undefined) {
      updates.push(`location_id = $${paramCount++}`);
      values.push(locationId);
    }

    if (isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(isActive);
    }

    if (capacity !== undefined) {
      updates.push(`capacity = $${paramCount++}`);
      values.push(capacity);
    }

    if (metadata !== undefined) {
      updates.push(`metadata = $${paramCount++}`);
      values.push(JSON.stringify(metadata));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE matrix_homeservers 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Homeserver not found' });
    }

    // Reload orchestrator service if it exists
    try {
      const orchestratorService = getOrchestratorService();
      if (orchestratorService.isInitialized) {
        await orchestratorService.loadManagedHomeservers();
      }
    } catch (error) {
      logger.warn('Failed to reload orchestrator homeservers:', error);
    }

    // Reload federation service if it exists
    try {
      const federationService = getMatrixFederationService();
      if (federationService.isInitialized) {
        await federationService.reloadFederationConfig();
      }
    } catch (error) {
      logger.warn('Failed to reload federation config:', error);
    }

    res.json({
      success: true,
      homeserver: {
        id: result.rows[0].id,
        subscriberId: result.rows[0].subscriber_id,
        region: result.rows[0].region,
        serverName: result.rows[0].server_name,
        baseUrl: result.rows[0].base_url,
        federationUrl: result.rows[0].federation_url,
        isSelfHosted: result.rows[0].is_self_hosted,
        externalProvider: result.rows[0].external_provider,
        locationId: result.rows[0].location_id,
        isActive: result.rows[0].is_active,
        capacity: result.rows[0].capacity,
        currentLoad: result.rows[0].current_load,
        metadata: result.rows[0].metadata || {},
        createdAt: result.rows[0].created_at,
        updatedAt: result.rows[0].updated_at
      },
      message: 'Homeserver updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update Matrix homeserver:', error);
    res.status(500).json({ error: 'Failed to update homeserver', details: error.message });
  }
});

// Delete a Matrix homeserver
router.delete('/homeservers/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;

    // Check if homeserver has any room assignments
    const roomCheck = await pool.query(
      `SELECT COUNT(*) as count FROM matrix_room_assignments WHERE homeserver_id = $1`,
      [id]
    );

    if (parseInt(roomCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete homeserver with active room assignments. Deactivate it instead.' 
      });
    }

    const result = await pool.query(
      `DELETE FROM matrix_homeservers WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Homeserver not found' });
    }

    // Reload orchestrator service if it exists
    try {
      const orchestratorService = getOrchestratorService();
      if (orchestratorService.isInitialized) {
        await orchestratorService.loadManagedHomeservers();
      }
    } catch (error) {
      logger.warn('Failed to reload orchestrator homeservers:', error);
    }

    // Reload federation service if it exists
    try {
      const federationService = getMatrixFederationService();
      if (federationService.isInitialized) {
        await federationService.reloadFederationConfig();
      }
    } catch (error) {
      logger.warn('Failed to reload federation config:', error);
    }

    res.json({
      success: true,
      message: 'Homeserver deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete Matrix homeserver:', error);
    res.status(500).json({ error: 'Failed to delete homeserver', details: error.message });
  }
});

// Get homeserver status/health
router.get('/homeservers/:id/status', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const orchestratorService = getOrchestratorService();

    if (!orchestratorService.isInitialized) {
      return res.status(503).json({ error: 'Orchestrator service not initialized' });
    }

    const homeserver = orchestratorService.managedHomeservers.get(id);
    if (!homeserver) {
      return res.status(404).json({ error: 'Homeserver not found in orchestrator' });
    }

    const health = orchestratorService.homeserverHealth.get(id);

    res.json({
      success: true,
      homeserver: {
        id: homeserver.id,
        serverName: homeserver.serverName,
        region: homeserver.region,
        baseUrl: homeserver.baseUrl,
        isActive: homeserver.isActive,
        capacity: homeserver.capacity,
        currentLoad: homeserver.currentLoad
      },
      health: health || {
        status: 'unknown',
        lastCheck: null,
        responseTime: null,
        errorCount: 0
      }
    });
  } catch (error) {
    logger.error('Failed to get homeserver status:', error);
    res.status(500).json({ error: 'Failed to get homeserver status', details: error.message });
  }
});

// ============================================
// Orchestrator Routes
// ============================================

// Get orchestrator status
router.get('/orchestrator/status', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const orchestratorService = getOrchestratorService();
    const status = orchestratorService.getStatus();

    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    logger.error('Failed to get orchestrator status:', error);
    res.status(500).json({ error: 'Failed to get orchestrator status', details: error.message });
  }
});

// Create room via orchestrator (with geographic routing)
router.post('/orchestrator/rooms/create', authenticateToken, async (req, res) => {
  try {
    const { groupId, groupData, participantIds } = req.body;

    if (!groupId) {
      return res.status(400).json({ error: 'Group ID is required' });
    }

    const orchestratorService = getOrchestratorService();
    if (!orchestratorService.isInitialized) {
      return res.status(503).json({ error: 'Orchestrator service not initialized' });
    }

    // Coordinate room creation (selects homeserver based on majority region)
    const decision = await orchestratorService.coordinateRoomCreation(
      { groupId, ...groupData },
      participantIds || []
    );

    // Create room on selected homeserver using MatrixService
    const roomId = await matrixService.createGroupRoom(groupId, groupData, {
      homeserverId: decision.homeserverId
    });

    // Get room assignment info
    let assignmentInfo = null;
    try {
      const result = await pool.query(
        `SELECT mra.*, mh.server_name, mh.region, mh.base_url
         FROM matrix_room_assignments mra
         LEFT JOIN matrix_homeservers mh ON mra.homeserver_id = mh.id
         WHERE mra.room_id = $1`,
        [roomId]
      );
      if (result.rows.length > 0) {
        assignmentInfo = {
          homeserverId: result.rows[0].homeserver_id,
          homeserverName: result.rows[0].server_name,
          region: result.rows[0].region,
          baseUrl: result.rows[0].base_url
        };
      }
    } catch (error) {
      logger.warn('Failed to get room assignment info:', error.message);
    }

    res.json({
      success: true,
      roomId,
      decision,
      assignment: assignmentInfo,
      message: 'Room created successfully via orchestrator'
    });
  } catch (error) {
    logger.error('Failed to create room via orchestrator:', error);
    res.status(500).json({ error: 'Failed to create room', details: error.message });
  }
});

// Get user's assigned homeserver
router.get('/orchestrator/users/:userId/homeserver', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id || req.user.userId;

    // Users can only check their own homeserver unless admin
    if (userId !== currentUserId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const orchestratorService = getOrchestratorService();
    if (!orchestratorService.isInitialized) {
      return res.status(503).json({ error: 'Orchestrator service not initialized' });
    }

    const homeserver = await orchestratorService.getUserHomeserver(userId);
    const userRegion = await orchestratorService.getUserRegion(userId);

    res.json({
      success: true,
      userId,
      region: userRegion,
      homeserver: {
        id: homeserver.id,
        serverName: homeserver.serverName,
        region: homeserver.region,
        baseUrl: homeserver.baseUrl,
        federationUrl: homeserver.federationUrl
      }
    });
  } catch (error) {
    logger.error('Failed to get user homeserver:', error);
    res.status(500).json({ error: 'Failed to get user homeserver', details: error.message });
  }
});

// ============================================
// Matrix Federation Routes
// ============================================

// Get federation status for all homeservers
router.get('/federation/status', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const federationService = getMatrixFederationService();
    if (!federationService.isInitialized) {
      return res.status(503).json({ error: 'Federation service not initialized' });
    }

    const status = federationService.getFederationStatus();

    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    logger.error('Failed to get federation status:', error);
    res.status(500).json({ error: 'Failed to get federation status', details: error.message });
  }
});

// Get federation status for a specific homeserver
router.get('/federation/homeservers/:homeserverId/status', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { homeserverId } = req.params;
    const federationService = getMatrixFederationService();

    if (!federationService.isInitialized) {
      return res.status(503).json({ error: 'Federation service not initialized' });
    }

    const status = federationService.getHomeserverFederationStatus(homeserverId);

    if (!status) {
      return res.status(404).json({ error: 'Homeserver not found' });
    }

    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    logger.error('Failed to get homeserver federation status:', error);
    res.status(500).json({ error: 'Failed to get homeserver federation status', details: error.message });
  }
});

// Reload federation configuration
router.post('/federation/reload', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const federationService = getMatrixFederationService();
    if (!federationService.isInitialized) {
      return res.status(503).json({ error: 'Federation service not initialized' });
    }

    await federationService.reloadFederationConfig();

    res.json({
      success: true,
      message: 'Federation configuration reloaded successfully'
    });
  } catch (error) {
    logger.error('Failed to reload federation configuration:', error);
    res.status(500).json({ error: 'Failed to reload federation configuration', details: error.message });
  }
});

// Verify room access via federation
router.post('/federation/rooms/:roomId/verify', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { roomId } = req.params;
    const { homeserverId } = req.body;

    if (!homeserverId) {
      return res.status(400).json({ error: 'Homeserver ID is required' });
    }

    const federationService = getMatrixFederationService();
    if (!federationService.isInitialized) {
      return res.status(503).json({ error: 'Federation service not initialized' });
    }

    const verification = await federationService.verifyRoomAccess(roomId, homeserverId);

    res.json({
      success: true,
      ...verification
    });
  } catch (error) {
    logger.error('Failed to verify room access:', error);
    res.status(500).json({ error: 'Failed to verify room access', details: error.message });
  }
});

// Get all federated homeservers
router.get('/federation/homeservers', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const federationService = getMatrixFederationService();
    if (!federationService.isInitialized) {
      return res.status(503).json({ error: 'Federation service not initialized' });
    }

    const homeservers = federationService.getFederatedHomeservers();

    res.json({
      success: true,
      homeservers,
      count: homeservers.length
    });
  } catch (error) {
    logger.error('Failed to get federated homeservers:', error);
    res.status(500).json({ error: 'Failed to get federated homeservers', details: error.message });
  }
});

module.exports = router;
