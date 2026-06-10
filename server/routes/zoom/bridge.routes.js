const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticateToken } = require('../authRoutes');
const { getZoomService } = require('../../services/zoomService');
const logger = require('../../utils/logger');
router.post('/meetings/:meetingId/bridge', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { matrixRoomId, method, sipInfo } = req.body;

    if (!matrixRoomId) {
      return res.status(400).json({ error: 'Matrix room ID is required' });
    }

    const zoomService = getZoomService();

    if (!zoomService.config.enabled) {
      return res.status(503).json({ error: 'Zoom integration is not enabled' });
    }

    const bridgeInfo = await zoomService.bridgeMeetingToMatrixRoom(
      req.params.meetingId,
      matrixRoomId,
      userId,
      {
        method, // 'sip' or 'webrtc'
        sipInfo // Optional SIP dial-in info
      }
    );

    res.json({
      success: true,
      message: 'Zoom meeting bridged to Matrix room',
      bridge: {
        bridgeId: bridgeInfo.bridgeId,
        meetingId: bridgeInfo.meetingId,
        matrixRoomId: bridgeInfo.matrixRoomId,
        method: bridgeInfo.method,
        joinUrl: bridgeInfo.joinUrl,
        startUrl: bridgeInfo.startUrl
      }
    });
  } catch (error) {
    logger.error('Failed to bridge Zoom meeting:', error);
    res.status(500).json({ error: 'Failed to bridge Zoom meeting to Matrix room', details: error.message });
  }
});

// Get bridge status
router.get('/meetings/:meetingId/bridge/status', authenticateToken, async (req, res) => {
  try {
    const { matrixRoomId } = req.query;
    const { getZoomMatrixBridge } = require('../../services/zoomMatrixBridge');
    const zoomMatrixBridge = getZoomMatrixBridge();

    const status = zoomMatrixBridge.getBridgeStatus(req.params.meetingId);

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
    logger.error('Failed to get Zoom bridge status:', error);
    res.status(500).json({ error: 'Failed to get bridge status', details: error.message });
  }
});

// End bridge between Zoom meeting and Matrix room
router.post('/meetings/:meetingId/bridge/end', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { matrixRoomId } = req.body;

    if (!matrixRoomId) {
      return res.status(400).json({ error: 'Matrix room ID is required' });
    }

    const zoomService = getZoomService();

    await zoomService.endBridge(req.params.meetingId, matrixRoomId);

    res.json({
      success: true,
      message: 'Bridge ended successfully'
    });
  } catch (error) {
    logger.error('Failed to end Zoom bridge:', error);
    res.status(500).json({ error: 'Failed to end bridge', details: error.message });
  }
});

module.exports = router;
