const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { getTeamsService } = require('../../services/teamsService');
const logger = require('../../utils/logger');
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
    const { getUserIdByStateToken } = require('../db/integrations/teamsOAuth');

    const userId = await getUserIdByStateToken(state);
    if (!userId) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/settings?teams_error=invalid_state`);
    }

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

module.exports = router;
