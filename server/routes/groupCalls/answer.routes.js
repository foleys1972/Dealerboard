const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const {
  createCallSession,
  getCallSession,
  updateCallSession,
  getLineConfiguration,
  getSocketHandler,
  logger,
  crypto,
} = require('./routeHelpers');
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
        const { getUserById } = require('../../services/databaseService');
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

module.exports = router;
