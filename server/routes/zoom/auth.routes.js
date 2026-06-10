const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticateToken } = require('../authRoutes');
const { getZoomService } = require('../../services/zoomService');
const logger = require('../../utils/logger');
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
    const tempService = new (require('../../services/zoomService').ZoomService)();
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
      const { getActiveAuthType } = require('../db/integrations/zoomCredentials');
      const authType = await getActiveAuthType(userId);

      res.json({
        success: true,
        connected: true,
        enabled: true,
        authType: authType || 'oauth',
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

module.exports = router;
