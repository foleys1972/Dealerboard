const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { matrixService } = require('../../services/matrixService');
const { handleServiceError } = require('./routeHelpers');
const chatRoomService = require('../../services/matrix/chatRoomService');

router.post('/chat/create', authenticateToken, async (req, res) => {
  try {
    const result = await chatRoomService.createChatRoom(
      req.body,
      req.user.id || req.user.userId
    );
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to create chat room');
  }
});

router.get('/chat/rooms', authenticateToken, async (req, res) => {
  try {
    const result = await chatRoomService.listChatRooms(
      req.user.id || req.user.userId,
      req.query.includeArchived
    );
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get chat rooms');
  }
});

router.post('/chat/:roomId/archive', authenticateToken, async (req, res) => {
  try {
    const result = await chatRoomService.archiveRoom(
      req.params.roomId,
      req.user.id || req.user.userId
    );
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to archive room');
  }
});

router.post('/chat/:roomId/unarchive', authenticateToken, async (req, res) => {
  try {
    await matrixService.unarchiveRoom(req.params.roomId);
    res.json({ success: true, message: 'Room unarchived successfully' });
  } catch (error) {
    handleServiceError(res, error, 'Failed to unarchive room');
  }
});

router.get('/direct/:contactId/room', authenticateToken, async (req, res) => {
  try {
    const result = await chatRoomService.getOrCreateDirectRoomForContact(
      req.params.contactId,
      req.user.id || req.user.userId,
      req.user.role
    );
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get/create direct room');
  }
});

module.exports = router;
