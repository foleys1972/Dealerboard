/**
 * Group Call Routes for Web Clients
 * 
 * Wrapper endpoints that accept JWT authentication and proxy to subscriber API.
 * These endpoints are for web clients, while /api/subscriber/* is for subscriber services.
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_ACCESS_TOKEN_SECRET || 'dev_secret';

// Middleware to authenticate requests (same as authRoutes)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};
const {
  createCallSession,
  getCallSession,
  updateCallSession,
  getLineConfiguration
} = require('../services/databaseService');
const logger = require('../utils/logger');
const crypto = require('crypto');

// Get socket handler from app locals
function getSocketHandler(req) {
  return req.app?.locals?.socketHandler;
}

// POST /api/group-calls/initiate
// Initiate a group call (web client version)
router.post('/initiate', authenticateToken, async (req, res) => {
  try {
    const {
      lineId,
      mode, // FIRST_ANSWER or REMAIN_GROUP
      targetUsers,
      initiatorRegion = 'US'
    } = req.body;

    if (!lineId || !mode || !targetUsers || targetUsers.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['FIRST_ANSWER', 'REMAIN_GROUP'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode. Use FIRST_ANSWER or REMAIN_GROUP' });
    }

    // Get line configuration
    const lineConfig = await getLineConfiguration(lineId);
    if (!lineConfig) {
      return res.status(404).json({ error: 'Line configuration not found' });
    }

    if (lineConfig.lineType !== 'GROUP') {
      return res.status(400).json({ error: 'Line is not configured for group calls' });
    }

    // Create session
    const sessionId = `session_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    
    await createCallSession({
      sessionId,
      lineId,
      lineType: 'GROUP',
      initiatorUserId: req.user.id,
      groupMode: mode,
      status: 'pending',
      participants: [],
      invitedNoAnswer: targetUsers.map(userId => ({
        userId,
        invitedAt: new Date().toISOString(),
        status: 'ringing'
      }))
    });

    // Emit WebSocket events to notify target users
    const socketHandler = getSocketHandler(req);
    if (socketHandler) {
      targetUsers.forEach(userId => {
        socketHandler.io.to(`user:${userId}`).emit('group-call-invite', {
          sessionId,
          lineId,
          mode,
          initiatorUserId: req.user.id,
          initiatorDisplayName: req.user.displayName || req.user.username,
          targetUsers
        });
      });
    }

    res.json({
      sessionId,
      mode,
      targetCount: targetUsers.length,
      instruction: mode === 'FIRST_ANSWER' ? 'wait-for-first-answer' : 'wait-for-answers'
    });
  } catch (error) {
    logger.error('Failed to initiate group call:', error);
    res.status(500).json({ error: 'Failed to initiate group call' });
  }
});

// POST /api/group-calls/answer
// Answer a group call (web client version)
router.post('/answer', authenticateToken, async (req, res) => {
  try {
    const {
      sessionId,
      answerRegion = 'US'
    } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const session = await getCallSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Call session not found' });
    }

    if (session.status !== 'pending' && session.status !== 'ringing') {
      return res.status(400).json({ error: 'Call is not in a state that can be answered' });
    }

    const answerUserId = req.user.id;
    const answerTimestamp = new Date().toISOString();

    // Check if already answered
    const existingParticipant = session.participants?.find(p => p.userId === answerUserId);
    if (existingParticipant) {
      return res.json({
        firstAnswerer: false,
        cancelOthers: false,
        topology: session.topologyType,
        currentParticipants: session.participants.length
      });
    }

    // Add participant
    const answerOrder = (session.participants?.length || 0) + 1;
    const newParticipant = {
      userId: answerUserId,
      displayName: req.user.displayName || req.user.username,
      joinTime: answerTimestamp,
      answerOrder,
      region: answerRegion
    };

    const updatedParticipants = [...(session.participants || []), newParticipant];
    const isFirstAnswerer = answerOrder === 1;
    const isFirstAnswerMode = session.groupMode === 'FIRST_ANSWER';

    // Update session
    let updatedSession;
    if (isFirstAnswerer && isFirstAnswerMode) {
      // FIRST_ANSWER mode: First answerer wins
      updatedSession = await updateCallSession(sessionId, {
        status: 'active',
        firstAnswererUserId: answerUserId,
        participants: updatedParticipants,
        topologyType: 'P2P',
        startTime: new Date()
      });

      // Emit cancellation to other participants
      const socketHandler = getSocketHandler(req);
      if (socketHandler) {
        const otherUserIds = session.invitedNoAnswer
          ?.filter(inv => inv.userId !== answerUserId)
          .map(inv => inv.userId) || [];
        
        // Convert user IDs to usernames for socket lookup
        const { getUserById } = require('../services/databaseService');
        const answerUsername = req.user.username || answerUserId;
        const otherUsernames = await Promise.all(
          otherUserIds.map(async (userId) => {
            try {
              const user = await getUserById(userId);
              return user?.username || userId;
            } catch (error) {
              return userId;
            }
          })
        );
        
        socketHandler.emitGroupCallAnswered(
          sessionId,
          answerUsername, // Use username instead of userId
          req.user.displayName || req.user.username,
          otherUsernames // Use usernames instead of userIds
        );
      }

      res.json({
        firstAnswerer: true,
        cancelOthers: true,
        otherParticipants: [],
        topology: 'P2P',
        currentParticipants: 1
      });
    } else {
      // REMAIN_GROUP mode or subsequent answerer
      let topology = session.topologyType || 'P2P';
      
      // Transition to room when 3rd participant joins
      if (updatedParticipants.length === 2) {
        topology = 'P2P'; // Still P2P with 2 participants
      } else if (updatedParticipants.length >= 3) {
        topology = 'single-room'; // Create room for 3+ participants
      }

      updatedSession = await updateCallSession(sessionId, {
        status: 'active',
        participants: updatedParticipants,
        topologyType: topology,
        startTime: session.startTime || new Date()
      });

      // Emit participant joined event
      const socketHandler = getSocketHandler(req);
      if (socketHandler) {
        const answerUsername = req.user.username || answerUserId;
        socketHandler.emitGroupCallParticipantJoined(
          sessionId,
          answerUsername, // Use username instead of userId
          req.user.displayName || req.user.username,
          updatedParticipants.length,
          topology
        );
      }

      res.json({
        firstAnswerer: isFirstAnswerer,
        cancelOthers: false,
        otherParticipants: updatedParticipants.filter(p => p.userId !== answerUserId),
        topology,
        currentParticipants: updatedParticipants.length
      });
    }
  } catch (error) {
    logger.error('Failed to answer group call:', error);
    res.status(500).json({ error: 'Failed to answer group call' });
  }
});

// POST /api/group-calls/cancel
// Cancel a group call (web client version)
router.post('/cancel', authenticateToken, async (req, res) => {
  try {
    const { sessionId, reason = 'cancelled-by-user' } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const session = await getCallSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Call session not found' });
    }

    // Only initiator or admin can cancel
    if (session.initiatorUserId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the initiator can cancel this call' });
    }

    await updateCallSession(sessionId, {
      status: 'cancelled',
      endTime: new Date()
    });

    // Emit cancellation event
    const socketHandler = getSocketHandler(req);
    if (socketHandler) {
      const allUserIds = [
        ...(session.participants || []).map(p => p.userId),
        ...(session.invitedNoAnswer || []).map(inv => inv.userId)
      ].filter(userId => userId !== req.user.id);

      socketHandler.emitGroupCallCancelled(sessionId, reason, allUserIds);
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to cancel group call:', error);
    res.status(500).json({ error: 'Failed to cancel group call' });
  }
});

// GET /api/group-calls/status/:sessionId
// Get group call status (web client version)
router.get('/status/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await getCallSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const participants = Array.isArray(session.participants) ? session.participants : [];
    const invitedNoAnswer = Array.isArray(session.invitedNoAnswer) ? session.invitedNoAnswer : [];

    res.json({
      sessionId: session.sessionId,
      lineId: session.lineId,
      mode: session.groupMode,
      initiator: session.initiatorUserId,
      targetUsers: [
        ...participants.map(p => p.userId),
        ...invitedNoAnswer.map(inv => inv.userId)
      ],
      answers: participants.map((p, idx) => ({
        userId: p.userId,
        displayName: p.displayName,
        timestamp: p.joinTime,
        order: p.answerOrder || idx + 1
      })),
      noAnswers: invitedNoAnswer
        .filter(inv => !participants.find(p => p.userId === inv.userId))
        .map(inv => inv.userId),
      topology: session.topologyType,
      currentParticipants: participants.length,
      status: session.status
    });
  } catch (error) {
    logger.error('Failed to get group call status:', error);
    res.status(500).json({ error: 'Failed to get group call status' });
  }
});

module.exports = router;

