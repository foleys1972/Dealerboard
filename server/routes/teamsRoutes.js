const express = require('express');
const router = express.Router();
const { authenticateToken } = require('./authRoutes');
const { getTeamsService } = require('../services/teamsService');
const logger = require('../utils/logger');

// Get Teams OAuth authorization URL
router.get('/auth/url', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const teamsService = getTeamsService();

    if (!teamsService.config.enabled) {
      return res.status(503).json({ error: 'Teams integration is not enabled' });
    }

    const authUrl = teamsService.getAuthorizationUrl(userId);

    res.json({
      success: true,
      authUrl: authUrl.url,
      state: authUrl.state
    });
  } catch (error) {
    logger.error('Failed to get Teams auth URL:', error);
    res.status(500).json({ error: 'Failed to get Teams authorization URL', details: error.message });
  }
});

// OAuth callback
router.get('/auth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.error('Teams OAuth error:', error);
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/settings?teams_error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/settings?teams_error=missing_params`);
    }

    const teamsService = getTeamsService();

    // Find user ID from state token
    const { pool } = require('../services/databaseService');
    const stateResult = await pool.query(
      `SELECT user_id FROM teams_oauth_states WHERE state_token = $1 AND expires_at > NOW()`,
      [state]
    );

    if (stateResult.rows.length === 0) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/settings?teams_error=invalid_state`);
    }

    const userId = stateResult.rows[0].user_id;

    // Verify state
    const isValidState = await teamsService.verifyOAuthState(userId, state);
    if (!isValidState) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/settings?teams_error=invalid_state`);
    }

    // Exchange code for token
    const tokens = await teamsService.exchangeCodeForToken(code);

    // Get user profile
    const profile = await teamsService.getUserProfile(userId);

    // Store credentials
    await teamsService.storeUserCredentials(userId, tokens, profile.id);

    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/settings?teams_success=true`);
  } catch (error) {
    logger.error('Failed to handle Teams OAuth callback:', error);
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/settings?teams_error=${encodeURIComponent(error.message)}`);
  }
});

// Get Teams auth status
router.get('/auth/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const teamsService = getTeamsService();

    if (!teamsService.config.enabled) {
      return res.json({
        success: true,
        connected: false,
        enabled: false
      });
    }

    try {
      const profile = await teamsService.getUserProfile(userId);
      res.json({
        success: true,
        connected: true,
        enabled: true,
        profile: {
          id: profile.id,
          displayName: profile.displayName,
          mail: profile.mail,
          userPrincipalName: profile.userPrincipalName
        },
        authType: 'oauth'
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
    logger.error('Failed to get Teams auth status:', error);
    res.status(500).json({ error: 'Failed to get Teams auth status', details: error.message });
  }
});

// Revoke Teams access
router.post('/auth/revoke', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const teamsService = getTeamsService();

    if (!teamsService.config.enabled) {
      return res.status(503).json({ error: 'Teams integration is not enabled' });
    }

    await teamsService.revokeAccess(userId);

    res.json({
      success: true,
      message: 'Teams access revoked successfully'
    });
  } catch (error) {
    logger.error('Failed to revoke Teams access:', error);
    res.status(500).json({ error: 'Failed to revoke Teams access', details: error.message });
  }
});

// Create a Teams meeting
router.post('/meetings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { subject, startTime, endTime, participants } = req.body;
    const teamsService = getTeamsService();

    if (!teamsService.config.enabled) {
      return res.status(503).json({ error: 'Teams integration is not enabled' });
    }

    const meeting = await teamsService.createMeeting(userId, {
      subject,
      startTime,
      endTime,
      participants
    });

    res.json({
      success: true,
      meeting: {
        id: meeting.id,
        subject: meeting.subject,
        joinUrl: meeting.joinUrl,
        joinWebUrl: meeting.joinWebUrl,
        startTime: meeting.startTime,
        endTime: meeting.endTime
      }
    });
  } catch (error) {
    logger.error('Failed to create Teams meeting:', error);
    res.status(500).json({ error: 'Failed to create Teams meeting', details: error.message });
  }
});

// List user's Teams meetings
router.get('/meetings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { limit } = req.query;
    const teamsService = getTeamsService();

    if (!teamsService.config.enabled) {
      return res.status(503).json({ error: 'Teams integration is not enabled' });
    }

    const meetings = await teamsService.listMeetings(userId, { limit: parseInt(limit) || 10 });

    res.json({
      success: true,
      meetings: meetings.map(m => ({
        id: m.id,
        subject: m.subject,
        joinUrl: m.joinUrl,
        joinWebUrl: m.joinWebUrl,
        startTime: m.startDateTime,
        endTime: m.endDateTime
      }))
    });
  } catch (error) {
    logger.error('Failed to list Teams meetings:', error);
    res.status(500).json({ error: 'Failed to list Teams meetings', details: error.message });
  }
});

// Get a specific Teams meeting
router.get('/meetings/:meetingId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const teamsService = getTeamsService();

    if (!teamsService.config.enabled) {
      return res.status(503).json({ error: 'Teams integration is not enabled' });
    }

    const meeting = await teamsService.getMeeting(req.params.meetingId, userId);

    res.json({
      success: true,
      meeting: {
        id: meeting.id,
        subject: meeting.subject,
        joinUrl: meeting.joinUrl,
        joinWebUrl: meeting.joinWebUrl,
        startTime: meeting.startDateTime,
        endTime: meeting.endDateTime
      }
    });
  } catch (error) {
    logger.error('Failed to get Teams meeting:', error);
    res.status(500).json({ error: 'Failed to get Teams meeting', details: error.message });
  }
});

// Join a Teams meeting (get join URL)
router.post('/meetings/:meetingId/join', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const teamsService = getTeamsService();

    if (!teamsService.config.enabled) {
      return res.status(503).json({ error: 'Teams integration is not enabled' });
    }

    const joinInfo = await teamsService.joinMeeting(req.params.meetingId, userId);

    res.json({
      success: true,
      joinUrl: joinInfo.joinUrl,
      joinWebUrl: joinInfo.joinWebUrl,
      meetingId: joinInfo.meetingId
    });
  } catch (error) {
    logger.error('Failed to join Teams meeting:', error);
    res.status(500).json({ error: 'Failed to join Teams meeting', details: error.message });
  }
});

// Bridge Teams meeting to Matrix room
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
    const { getTeamsMatrixBridge } = require('../services/teamsMatrixBridge');
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

