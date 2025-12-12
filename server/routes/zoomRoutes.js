const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticateToken } = require('./authRoutes');
const { getZoomService } = require('../services/zoomService');
const logger = require('../utils/logger');

/**
 * Zoom Integration Routes
 * Handles OAuth, meeting management, and Matrix room bridging
 */

// Get OAuth authorization URL
router.get('/auth/url', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const zoomService = getZoomService();

    if (!zoomService.config.enabled) {
      return res.status(503).json({ error: 'Zoom integration is not enabled' });
    }

    const { url, state } = zoomService.getAuthorizationUrl(userId);
    
    res.json({
      success: true,
      authUrl: url,
      state: state
    });
  } catch (error) {
    logger.error('Failed to get Zoom auth URL:', error);
    res.status(500).json({ error: 'Failed to get Zoom authorization URL', details: error.message });
  }
});

// OAuth callback
router.get('/auth/callback', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    const zoomService = getZoomService();

    // Verify state
    if (state) {
      const isValid = await zoomService.verifyOAuthState(userId, state);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid or expired state token' });
      }
    }

    // Exchange code for tokens
    const tokens = await zoomService.exchangeCodeForToken(code);

    // Get user profile to get Zoom user ID
    const tempService = new (require('../services/zoomService').ZoomService)();
    tempService.config = zoomService.config;
    const profile = await axios.get(
      `${zoomService.config.apiBaseUrl}/users/me`,
      {
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`
        }
      }
    ).then(r => r.data).catch(() => null);

    // Store credentials
    await zoomService.storeUserCredentials(userId, tokens, profile?.id);

    // Redirect to success page or return success
    res.json({
      success: true,
      message: 'Zoom account connected successfully'
    });
  } catch (error) {
    logger.error('Zoom OAuth callback failed:', error);
    res.status(500).json({ error: 'Failed to complete Zoom authorization', details: error.message });
  }
});

// Direct authentication with API Key/Secret
router.post('/auth/direct', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { apiKey, apiSecret } = req.body;

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'API Key and API Secret are required' });
    }

    const zoomService = getZoomService();

    if (!zoomService.config.enabled) {
      return res.status(503).json({ error: 'Zoom integration is not enabled' });
    }

    if (!zoomService.config.allowDirectAuth) {
      return res.status(403).json({ error: 'Direct authentication is not allowed. Please use OAuth.' });
    }

    // Verify credentials by generating JWT and testing API access
    try {
      const jwtToken = zoomService.generateJWTToken(apiKey, apiSecret);
      
      // Test the credentials by making an API call
      const testResponse = await axios.get(
        `${zoomService.config.apiBaseUrl}/users/me`,
        {
          headers: {
            'Authorization': `Bearer ${jwtToken}`
          }
        }
      );

      const profile = testResponse.data;

      // Store credentials
      await zoomService.storeDirectCredentials(userId, apiKey, apiSecret, profile.id);

      res.json({
        success: true,
        message: 'Zoom account connected successfully',
        profile: {
          id: profile.id,
          email: profile.email,
          firstName: profile.first_name,
          lastName: profile.last_name,
          displayName: profile.display_name
        }
      });
    } catch (error) {
      logger.error('Failed to verify Zoom API credentials:', error.response?.data || error.message);
      return res.status(401).json({ 
        error: 'Invalid API credentials', 
        details: error.response?.data?.message || error.message 
      });
    }
  } catch (error) {
    logger.error('Failed to authenticate with Zoom API credentials:', error);
    res.status(500).json({ error: 'Failed to authenticate', details: error.message });
  }
});

// Get user's Zoom connection status
router.get('/auth/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const zoomService = getZoomService();

    if (!zoomService.config.enabled) {
      return res.json({
        success: true,
        connected: false,
        enabled: false
      });
    }

    try {
      const profile = await zoomService.getUserProfile(userId);
      
      // Get auth type from database
      const { pool } = require('../services/databaseService');
      const authResult = await pool.query(
        `SELECT auth_type FROM zoom_user_credentials WHERE user_id = $1 AND is_active = true`,
        [userId]
      );

      res.json({
        success: true,
        connected: true,
        enabled: true,
        authType: authResult.rows[0]?.auth_type || 'oauth',
        profile: {
          id: profile.id,
          email: profile.email,
          firstName: profile.first_name,
          lastName: profile.last_name,
          displayName: profile.display_name
        }
      });
    } catch (error) {
      res.json({
        success: true,
        connected: false,
        enabled: true,
        error: error.message
      });
    }
  } catch (error) {
    logger.error('Failed to get Zoom auth status:', error);
    res.status(500).json({ error: 'Failed to get Zoom connection status', details: error.message });
  }
});

// Revoke Zoom access
router.post('/auth/revoke', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const zoomService = getZoomService();

    await zoomService.revokeUserAccess(userId);

    res.json({
      success: true,
      message: 'Zoom access revoked'
    });
  } catch (error) {
    logger.error('Failed to revoke Zoom access:', error);
    res.status(500).json({ error: 'Failed to revoke Zoom access', details: error.message });
  }
});

// Create a Zoom meeting
router.post('/meetings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const zoomService = getZoomService();

    if (!zoomService.config.enabled) {
      return res.status(503).json({ error: 'Zoom integration is not enabled' });
    }

    const meeting = await zoomService.createMeeting(userId, req.body);

    res.json({
      success: true,
      meeting: {
        id: meeting.id,
        topic: meeting.topic,
        joinUrl: meeting.join_url,
        startUrl: meeting.start_url,
        password: meeting.password,
        startTime: meeting.start_time,
        duration: meeting.duration
      }
    });
  } catch (error) {
    logger.error('Failed to create Zoom meeting:', error);
    res.status(500).json({ error: 'Failed to create Zoom meeting', details: error.message });
  }
});

// Get user's Zoom meetings
router.get('/meetings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const zoomService = getZoomService();

    if (!zoomService.config.enabled) {
      return res.status(503).json({ error: 'Zoom integration is not enabled' });
    }

    const { type, from, to, pageSize } = req.query;
    const meetings = await zoomService.getUserMeetings(userId, {
      type,
      from,
      to,
      pageSize: pageSize ? parseInt(pageSize) : undefined
    });

    res.json({
      success: true,
      meetings: meetings.meetings || [],
      pageCount: meetings.page_count,
      pageNumber: meetings.page_number,
      pageSize: meetings.page_size,
      totalRecords: meetings.total_records
    });
  } catch (error) {
    logger.error('Failed to get Zoom meetings:', error);
    res.status(500).json({ error: 'Failed to get Zoom meetings', details: error.message });
  }
});

// Get specific meeting
router.get('/meetings/:meetingId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const zoomService = getZoomService();

    if (!zoomService.config.enabled) {
      return res.status(503).json({ error: 'Zoom integration is not enabled' });
    }

    const meeting = await zoomService.getMeeting(req.params.meetingId, userId);

    res.json({
      success: true,
      meeting: {
        id: meeting.id,
        topic: meeting.topic,
        joinUrl: meeting.join_url,
        startUrl: meeting.start_url,
        password: meeting.password,
        startTime: meeting.start_time,
        duration: meeting.duration,
        status: meeting.status
      }
    });
  } catch (error) {
    logger.error('Failed to get Zoom meeting:', error);
    res.status(500).json({ error: 'Failed to get Zoom meeting', details: error.message });
  }
});

// Join a Zoom meeting (get join URL)
router.post('/meetings/:meetingId/join', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const zoomService = getZoomService();

    if (!zoomService.config.enabled) {
      return res.status(503).json({ error: 'Zoom integration is not enabled' });
    }

    const joinInfo = await zoomService.joinMeeting(req.params.meetingId, userId);

    res.json({
      success: true,
      joinUrl: joinInfo.joinUrl,
      startUrl: joinInfo.startUrl,
      meetingId: joinInfo.meetingId
    });
  } catch (error) {
    logger.error('Failed to join Zoom meeting:', error);
    res.status(500).json({ error: 'Failed to join Zoom meeting', details: error.message });
  }
});

// Bridge Zoom meeting to Matrix room
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
    const { getZoomMatrixBridge } = require('../services/zoomMatrixBridge');
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

