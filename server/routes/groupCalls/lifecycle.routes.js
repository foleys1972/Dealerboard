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
    if (
      session.initiatorUserId !== req.user.id &&
      req.user.role !== 'platform_admin' &&
      req.user.role !== 'tenant_admin'
    ) {
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
