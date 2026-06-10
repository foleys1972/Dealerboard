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

module.exports = router;
