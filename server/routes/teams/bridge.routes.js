const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { getTeamsService } = require('../../services/teamsService');
const logger = require('../../utils/logger');
router.post('/meetings/:meetingId/bridge', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { matrixRoomId, method } = req.body;

    if (!matrixRoomId) {
      return res.status(400).json({ error: 'Matrix room ID is required' });
    }

    const teamsService = getTeamsService();

    if (!teamsService.config.enabled) {
      return res.status(503).json({ error: 'Teams integration is not enabled' });
    }

    const bridgeInfo = await teamsService.bridgeMeetingToMatrixRoom(
      req.params.meetingId,
      matrixRoomId,
      userId,
      {
        method // 'webrtc'
      }
    );

    res.json({
      success: true,
      message: 'Teams meeting bridged to Matrix room',
      bridge: {
        bridgeId: bridgeInfo.bridgeId,
        meetingId: bridgeInfo.meetingId,
        matrixRoomId: bridgeInfo.matrixRoomId,
        method: bridgeInfo.method,
        joinUrl: bridgeInfo.joinUrl,
        joinWebUrl: bridgeInfo.joinWebUrl
      }
    });
  } catch (error) {
    logger.error('Failed to bridge Teams meeting:', error);
    res.status(500).json({ error: 'Failed to bridge Teams meeting to Matrix room', details: error.message });
  }
});

// Get bridge status
router.get('/meetings/:meetingId/bridge/status', authenticateToken, async (req, res) => {
  try {
    const { matrixRoomId } = req.query;
    const { getTeamsMatrixBridge } = require('../../services/teamsMatrixBridge');
    const teamsMatrixBridge = getTeamsMatrixBridge();

    const status = teamsMatrixBridge.getBridgeStatus(req.params.meetingId);

    if (!status) {
      return res.status(404).json({ error: 'Bridge not found' });
    }

    // Filter by matrixRoomId if provided
    if (matrixRoomId && status.matrixRoomId !== matrixRoomId) {
      return res.status(404).json({ error: 'Bridge not found for this Matrix room' });
    }

    res.json({
      success: true,
      status
    });
  } catch (error) {
    logger.error('Failed to get Teams bridge status:', error);
    res.status(500).json({ error: 'Failed to get bridge status', details: error.message });
  }
});

// End bridge between Teams meeting and Matrix room
router.post('/meetings/:meetingId/bridge/end', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { matrixRoomId } = req.body;

    if (!matrixRoomId) {
      return res.status(400).json({ error: 'Matrix room ID is required' });
    }

    const teamsService = getTeamsService();

    if (!teamsService.config.enabled) {
      return res.status(503).json({ error: 'Teams integration is not enabled' });
    }

    await teamsService.endBridge(req.params.meetingId, matrixRoomId);

    res.json({
      success: true,
      message: 'Teams bridge ended successfully'
    });
  } catch (error) {
    logger.error('Failed to end Teams bridge:', error);
    res.status(500).json({ error: 'Failed to end Teams bridge', details: error.message });
  }
});

module.exports = router;
