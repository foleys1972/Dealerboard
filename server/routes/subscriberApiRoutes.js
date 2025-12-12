const express = require('express');
const router = express.Router();
const { 
  pool,
  getUserById,
  createCallSession,
  getCallSession,
  updateCallSession,
  getLineConfiguration
} = require('../services/databaseService');
const logger = require('../utils/logger');
const crypto = require('crypto');

// Get socket handler from app locals (set by server initialization)
function getSocketHandler(req) {
  return req.app?.locals?.socketHandler;
}

// Middleware to authenticate subscriber requests
// Subscribers use auth_token from subscribers table
async function authenticateSubscriber(req, res, next) {
  try {
    const authToken = req.headers['x-subscriber-token'] || req.query.token;
    
    if (!authToken) {
      return res.status(401).json({ error: 'Subscriber authentication token required' });
    }

    const result = await pool.query(
      `SELECT * FROM subscribers WHERE auth_token = $1 AND is_active = true`,
      [authToken]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid subscriber token' });
    }

    req.subscriber = result.rows[0];
    next();
  } catch (error) {
    logger.error('Subscriber authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// ============================================================================
// Standard Call Endpoints (Intercom, ARD, MRD)
// ============================================================================

// POST /api/subscriber/call/initiate
router.post('/call/initiate', authenticateSubscriber, async (req, res) => {
  try {
    const {
      lineId,
      lineType,
      initiatorUserId,
      targetUserId
    } = req.body;

    if (!lineId || !lineType || !initiatorUserId || !targetUserId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const sessionId = `session_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    // Create call session using helper function
    await createCallSession({
      sessionId,
      lineId,
      lineType,
      initiatorUserId,
      status: 'pending'
    });

    res.json({
      sessionId,
      topology: 'pending',
      instruction: 'wait-for-answer'
    });
  } catch (error) {
    logger.error('Failed to initiate call:', error);
    res.status(500).json({ error: 'Failed to initiate call' });
  }
});

// POST /api/subscriber/call/answer
router.post('/call/answer', authenticateSubscriber, async (req, res) => {
  try {
    const {
      sessionId,
      answerUserId,
      answerTimestamp
    } = req.body;

    if (!sessionId || !answerUserId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get session using helper function
    const session = await getCallSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Update session with answer
    const participants = Array.isArray(session.participants) ? session.participants : [];
    participants.push({
      userId: answerUserId,
      role: 'participant',
      joinTime: answerTimestamp || new Date().toISOString()
    });

    await updateCallSession(sessionId, {
      status: 'active',
      participants,
      topologyType: 'P2P'
    });

    res.json({
      sessionId,
      topology: 'P2P',
      instruction: {
        type: 'establish-p2p',
        withUserId: session.initiator_user_id
      }
    });
  } catch (error) {
    logger.error('Failed to answer call:', error);
    res.status(500).json({ error: 'Failed to answer call' });
  }
});

// ============================================================================
// Group Call Endpoints
// ============================================================================

// POST /api/subscriber/group/initiate
router.post('/group/initiate', authenticateSubscriber, async (req, res) => {
  try {
    const {
      lineId,
      lineType,
      mode, // FIRST_ANSWER or REMAIN_GROUP
      initiatorUserId,
      initiatorRegion,
      targetUsers
    } = req.body;

    if (!lineId || !lineType || !mode || !initiatorUserId || !targetUsers || !Array.isArray(targetUsers)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['FIRST_ANSWER', 'REMAIN_GROUP'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode. Must be FIRST_ANSWER or REMAIN_GROUP' });
    }

    const sessionId = `session_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    // Get line configuration for timeout
    const lineConfig = await getLineConfiguration(lineId);
    const timeout = lineConfig?.callTimeout || 30;
    const ringTimeout = lineConfig?.ringTimeout || 60;

    // Create group call session using helper function
    await createCallSession({
      sessionId,
      lineId,
      lineType,
      groupMode: mode,
      initiatorUserId,
      status: 'pending',
      participants: [],
      invitedNoAnswer: targetUsers.map(userId => ({ userId, status: 'pending' })),
      sessionMetadata: { initiatorRegion, timeout, ringTimeout }
    });

    res.json({
      sessionId,
      topology: 'pending',
      mode,
      targetCount: targetUsers.length,
      timeout,
      instruction: 'wait-for-answers'
    });
  } catch (error) {
    logger.error('Failed to initiate group call:', error);
    res.status(500).json({ error: 'Failed to initiate group call' });
  }
});

// POST /api/subscriber/group/answer
router.post('/group/answer', authenticateSubscriber, async (req, res) => {
  try {
    const {
      sessionId,
      answerUserId,
      answerRegion,
      answerTimestamp
    } = req.body;

    if (!sessionId || !answerUserId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get session using helper function
    const session = await getCallSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const mode = session.groupMode;
    const participants = Array.isArray(session.participants) ? session.participants : [];
    const invitedNoAnswer = Array.isArray(session.invitedNoAnswer) ? session.invitedNoAnswer : [];
    const metadata = session.sessionMetadata || {};

    // Remove from invited_no_answer and add to participants
    const updatedInvited = invitedNoAnswer.filter(inv => inv.userId !== answerUserId);
    const answerOrder = participants.length + 1;

    participants.push({
      userId: answerUserId,
      region: answerRegion,
      role: answerOrder === 1 ? 'first-answerer' : 'participant',
      answerOrder,
      joinTime: answerTimestamp || new Date().toISOString()
    });

    // Handle FIRST_ANSWER mode
    if (mode === 'FIRST_ANSWER' && answerOrder === 1) {
      // First answer - mark as first answerer and cancel others
      await updateCallSession(sessionId, {
        status: 'active',
        firstAnswererUserId: answerUserId,
        participants,
        invitedNoAnswer: updatedInvited,
        topologyType: 'P2P'
      });

      // Emit WebSocket event to cancel other participants
      const socketHandler = getSocketHandler(req);
      if (socketHandler) {
        // Get display name and username for answered user
        const answerUser = await getUserById(answerUserId);
        const displayName = answerUser?.displayName || answerUser?.name || answerUserId;
        const answerUsername = answerUser?.username || answerUserId;
        
        // Convert target user IDs to usernames for socket lookup
        const targetUsernames = await Promise.all(
          updatedInvited.map(async (inv) => {
            try {
              const user = await getUserById(inv.userId);
              return user?.username || inv.userId;
            } catch (error) {
              logger.warn(`Failed to get username for userId ${inv.userId}:`, error.message);
              return inv.userId;
            }
          })
        );
        
        socketHandler.emitGroupCallAnswered(
          sessionId,
          answerUsername, // Use username instead of userId
          displayName,
          targetUsernames // Use usernames instead of userIds
        );
      }

      res.json({
        mode: 'FIRST_ANSWER',
        firstAnswerer: true,
        topology: 'P2P',
        instruction: {
          type: 'establish-p2p',
          withUserId: session.initiator_user_id
        },
        cancelOthers: true,
        otherParticipants: updatedInvited.map(inv => inv.userId)
      });
    } 
    // Handle REMAIN_GROUP mode
    else if (mode === 'REMAIN_GROUP') {
      const currentParticipantCount = participants.length;
      let topology = 'P2P';
      let instruction = {
        type: 'establish-p2p',
        withUserId: session.initiator_user_id
      };
      let participantsToMigrate = [];

      // If 3rd person answers, need to create room
      if (currentParticipantCount === 3) {
        topology = 'single-room';
        // Room creation will be handled by Matrix service
        // For now, return instruction to create room
        instruction = {
          type: 'join-room',
          roomId: null, // Will be created by Matrix service
          matrixHomeserver: metadata.initiatorRegion || 'US'
        };
        participantsToMigrate = participants.slice(0, 2).map(p => ({
          userId: p.userId,
          action: 'leave-p2p-join-room'
        }));
      }

      await updateCallSession(sessionId, {
        status: 'active',
        participants,
        invitedNoAnswer: updatedInvited,
        topologyType: topology
      });

      // Emit WebSocket event for participant joined
      const socketHandler = getSocketHandler(req);
      if (socketHandler) {
        const joinedUser = await getUserById(answerUserId);
        const displayName = joinedUser?.displayName || joinedUser?.name || answerUserId;
        const joinedUsername = joinedUser?.username || answerUserId;
        
        socketHandler.emitGroupCallParticipantJoined(
          sessionId,
          joinedUsername, // Use username instead of userId
          displayName,
          currentParticipantCount,
          topologyChange || false,
          topology,
          instruction.roomId || null
        );
      }

      res.json({
        mode: 'REMAIN_GROUP',
        answerNumber: answerOrder,
        currentParticipants: currentParticipantCount,
        topology,
        instruction,
        participantsToMigrate: participantsToMigrate.length > 0 ? participantsToMigrate : undefined,
        awaitingAnswers: updatedInvited.map(inv => inv.userId)
      });
    }
  } catch (error) {
    logger.error('Failed to answer group call:', error);
    res.status(500).json({ error: 'Failed to answer group call' });
  }
});

// POST /api/subscriber/group/cancel
router.post('/group/cancel', authenticateSubscriber, async (req, res) => {
  try {
    const {
      sessionId,
      reason
    } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    // Get session using helper function
    const session = await getCallSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const invitedNoAnswer = Array.isArray(session.invitedNoAnswer) ? session.invitedNoAnswer : [];
    const participants = Array.isArray(session.participants) ? session.participants : [];

    // Get all user IDs that need to be cancelled
    const cancelledParticipants = [
      ...invitedNoAnswer.map(inv => inv.userId),
      ...participants.map(p => p.userId).filter(id => id !== session.initiatorUserId)
    ];

    await updateCallSession(sessionId, {
      status: 'cancelled'
    });

    res.json({
      success: true,
      sessionId,
      cancelledParticipants: [...new Set(cancelledParticipants)]
    });
  } catch (error) {
    logger.error('Failed to cancel group call:', error);
    res.status(500).json({ error: 'Failed to cancel group call' });
  }
});

// GET /api/subscriber/group/status/:sessionId
router.get('/group/status/:sessionId', authenticateSubscriber, async (req, res) => {
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
        timestamp: p.joinTime,
        order: p.answerOrder || idx + 1
      })),
      noAnswers: invitedNoAnswer.map(inv => inv.userId),
      topology: session.topologyType,
      currentParticipants: participants.length,
      status: session.status
    });
  } catch (error) {
    logger.error('Failed to get group call status:', error);
    res.status(500).json({ error: 'Failed to get group call status' });
  }
});

// ============================================================================
// Broadcast Endpoints
// ============================================================================

// POST /api/subscriber/broadcast/activate
router.post('/broadcast/activate', authenticateSubscriber, async (req, res) => {
  try {
    const {
      lineId,
      lineType,
      activatorUserId,
      activatorRegion
    } = req.body;

    if (!lineId || !lineType || !activatorUserId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get line configuration using helper function
    const line = await getLineConfiguration(lineId);

    if (!line || line.lineType !== 'BROADCAST') {
      return res.status(404).json({ error: 'Broadcast line not found' });
    }

    const roomId = line.persistentRoomId;
    const authorizedParticipants = Array.isArray(line.targetParticipants) 
      ? line.targetParticipants 
      : [];

    const sessionId = `session_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    // Create broadcast session using helper function
    await createCallSession({
      sessionId,
      lineId,
      lineType,
      broadcastActivatorUserId: activatorUserId,
      broadcastRoomId: roomId,
      initiatorUserId: activatorUserId,
      status: 'active',
      participants: [{
        userId: activatorUserId,
        role: 'activator',
        joinTime: new Date().toISOString()
      }],
      topologyType: 'broadcast'
    });

    // Emit WebSocket event for broadcast activation
    const socketHandler = getSocketHandler(req);
    if (socketHandler) {
      const activatorUser = await getUserById(activatorUserId);
      const displayName = activatorUser?.displayName || activatorUser?.name || activatorUserId;
      const activatorUsername = activatorUser?.username || activatorUserId;
      
      // Convert authorized participant IDs to usernames for socket lookup
      const authorizedUsernames = await Promise.all(
        authorizedParticipants.map(async (userId) => {
          try {
            const user = await getUserById(userId);
            return user?.username || userId;
          } catch (error) {
            logger.warn(`Failed to get username for userId ${userId}:`, error.message);
            return userId;
          }
        })
      );
      
      socketHandler.emitBroadcastActivated(
        lineId,
        sessionId,
        activatorUsername, // Use username instead of userId
        displayName,
        roomId,
        authorizedUsernames // Use usernames instead of userIds
      );
    }

    res.json({
      sessionId,
      lineId,
      roomId,
      authorizedParticipants,
      instruction: {
        type: 'join-room',
        roomId
      }
    });
  } catch (error) {
    logger.error('Failed to activate broadcast:', error);
    res.status(500).json({ error: 'Failed to activate broadcast' });
  }
});

// POST /api/subscriber/broadcast/join
router.post('/broadcast/join', authenticateSubscriber, async (req, res) => {
  try {
    const {
      sessionId,
      lineId,
      joiningUserId,
      joiningRegion
    } = req.body;

    if (!sessionId || !lineId || !joiningUserId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get session using helper function
    const session = await getCallSession(sessionId);

    if (!session || session.lineType !== 'BROADCAST') {
      return res.status(404).json({ error: 'Broadcast session not found' });
    }

    const participants = Array.isArray(session.participants) ? session.participants : [];

    // Add participant
    participants.push({
      userId: joiningUserId,
      region: joiningRegion,
      role: 'participant',
      joinTime: new Date().toISOString()
    });

    await updateCallSession(sessionId, {
      participants
    });

    // Emit WebSocket event for participant joined
    const socketHandler = getSocketHandler(req);
    if (socketHandler) {
      const joinedUser = await getUserById(joiningUserId);
      const displayName = joinedUser?.displayName || joinedUser?.name || joiningUserId;
      const joinedUsername = joinedUser?.username || joiningUserId;
      
      socketHandler.emitBroadcastParticipantJoined(
        sessionId,
        lineId,
        joinedUsername, // Use username instead of userId
        displayName,
        participants.length
      );
    }

    res.json({
      success: true,
      roomId: session.broadcastRoomId,
      currentParticipants: participants.length,
      instruction: {
        type: 'join-room',
        roomId: session.broadcastRoomId
      }
    });
  } catch (error) {
    logger.error('Failed to join broadcast:', error);
    res.status(500).json({ error: 'Failed to join broadcast' });
  }
});

// POST /api/subscriber/broadcast/leave
router.post('/broadcast/leave', authenticateSubscriber, async (req, res) => {
  try {
    const {
      sessionId,
      lineId,
      leavingUserId
    } = req.body;

    if (!sessionId || !leavingUserId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get session using helper function
    const session = await getCallSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const participants = Array.isArray(session.participants) 
      ? session.participants.filter(p => p.userId !== leavingUserId)
      : [];

    await updateCallSession(sessionId, {
      participants
    });

    // Emit WebSocket event for participant left
    const socketHandler = getSocketHandler(req);
    if (socketHandler) {
      const leftUser = await getUserById(leavingUserId);
      const displayName = leftUser?.displayName || leftUser?.name || leavingUserId;
      const leftUsername = leftUser?.username || leavingUserId;
      
      socketHandler.emitBroadcastParticipantLeft(
        sessionId,
        lineId,
        leftUsername, // Use username instead of userId
        displayName,
        participants.length
      );
    }

    const broadcastStillActive = participants.length > 0;

    res.json({
      success: true,
      currentParticipants: participants.length,
      broadcastStillActive
    });
  } catch (error) {
    logger.error('Failed to leave broadcast:', error);
    res.status(500).json({ error: 'Failed to leave broadcast' });
  }
});

// POST /api/subscriber/broadcast/close
router.post('/broadcast/close', authenticateSubscriber, async (req, res) => {
  try {
    const {
      sessionId,
      lineId,
      closerUserId
    } = req.body;

    if (!sessionId || !closerUserId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get session using helper function
    const session = await getCallSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const participants = Array.isArray(session.participants) ? session.participants : [];
    const participantsKicked = participants
      .filter(p => p.userId !== closerUserId)
      .map(p => p.userId);

    // Close session
    await updateCallSession(sessionId, {
      status: 'ended'
    });

    // Emit WebSocket event for broadcast closed
    const socketHandler = getSocketHandler(req);
    if (socketHandler) {
      const closerUser = await getUserById(closerUserId);
      const closerUsername = closerUser?.username || closerUserId;
      
      // Convert participant IDs to usernames for socket lookup
      const participantsKickedUsernames = await Promise.all(
        participantsKicked.map(async (userId) => {
          try {
            const user = await getUserById(userId);
            return user?.username || userId;
          } catch (error) {
            logger.warn(`Failed to get username for userId ${userId}:`, error.message);
            return userId;
          }
        })
      );
      
      socketHandler.emitBroadcastClosed(
        sessionId,
        lineId,
        closerUsername, // Use username instead of userId
        participantsKickedUsernames // Use usernames instead of userIds
      );
    }

    res.json({
      success: true,
      participantsKicked,
      broadcastClosed: true
    });
  } catch (error) {
    logger.error('Failed to close broadcast:', error);
    res.status(500).json({ error: 'Failed to close broadcast' });
  }
});

module.exports = router;

