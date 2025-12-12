const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { pool } = require('./databaseService');
const logger = require('../utils/logger');

/**
 * Zoom Service
 * Handles OAuth authentication, API access, meeting management, and audio bridging
 */
class ZoomService {
  constructor() {
    this.config = {
      enabled: process.env.ZOOM_ENABLED === 'true',
      clientId: process.env.ZOOM_CLIENT_ID,
      clientSecret: process.env.ZOOM_CLIENT_SECRET,
      redirectUri: process.env.ZOOM_REDIRECT_URI || `${process.env.CLIENT_URL || 'http://localhost:3000'}/api/zoom/callback`,
      accountId: process.env.ZOOM_ACCOUNT_ID, // For Server-to-Server OAuth
      apiBaseUrl: 'https://api.zoom.us/v2',
      oauthBaseUrl: 'https://zoom.us/oauth',
      allowDirectAuth: process.env.ZOOM_ALLOW_DIRECT_AUTH === 'true', // Allow direct API key/secret auth
    };
    
    this.activeMeetings = new Map(); // meetingId -> MeetingInfo
    this.activeBridges = new Map(); // meetingId -> BridgeInfo
    this.isInitialized = false;
  }

  async initialize() {
    if (!this.config.enabled) {
      logger.info('Zoom integration disabled');
      return;
    }

    if (!this.config.clientId || !this.config.clientSecret) {
      logger.warn('Zoom credentials not configured - integration will be limited');
      return;
    }

    this.isInitialized = true;
    logger.info('Zoom service initialized');
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(userId, state = null) {
    const stateToken = state || crypto.randomBytes(16).toString('hex');
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: 'meeting:write meeting:read user:read',
      state: stateToken
    });

    // Store state for verification
    if (userId) {
      // Store in database or cache
      this.storeOAuthState(userId, stateToken);
    }

    return {
      url: `${this.config.oauthBaseUrl}/authorize?${params.toString()}`,
      state: stateToken
    };
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code) {
    try {
      const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
      
      const response = await axios.post(
        `${this.config.oauthBaseUrl}/token`,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: this.config.redirectUri
        }),
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type,
        scope: response.data.scope
      };
    } catch (error) {
      logger.error('Failed to exchange Zoom OAuth code:', error.response?.data || error.message);
      throw new Error(`Zoom OAuth token exchange failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken) {
    try {
      const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
      
      const response = await axios.post(
        `${this.config.oauthBaseUrl}/token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        }),
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || refreshToken,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type
      };
    } catch (error) {
      logger.error('Failed to refresh Zoom access token:', error.response?.data || error.message);
      throw new Error(`Zoom token refresh failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Generate JWT token for direct API authentication
   */
  generateJWTToken(apiKey, apiSecret) {
    const payload = {
      iss: apiKey,
      exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour expiry
    };

    return jwt.sign(payload, apiSecret, { algorithm: 'HS256' });
  }

  /**
   * Store direct API credentials (API Key/Secret)
   */
  async storeDirectCredentials(userId, apiKey, apiSecret, zoomUserId = null) {
    // Generate JWT token
    const jwtToken = this.generateJWTToken(apiKey, apiSecret);

    // Store credentials
    // Note: In production, you should encrypt the API secret
    const expiresAt = new Date(Date.now() + (60 * 60 * 1000)); // 1 hour

    await pool.query(
      `INSERT INTO zoom_user_credentials (user_id, zoom_user_id, access_token, refresh_token, token_expires_at, auth_type, api_key, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'direct', $6, true, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         zoom_user_id = COALESCE(EXCLUDED.zoom_user_id, zoom_user_credentials.zoom_user_id),
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         token_expires_at = EXCLUDED.token_expires_at,
         auth_type = 'direct',
         api_key = EXCLUDED.api_key,
         is_active = true,
         updated_at = NOW()`,
      [userId, zoomUserId, jwtToken, apiSecret, expiresAt, apiKey]
    );

    logger.info(`Stored direct Zoom credentials for user ${userId}`);
  }

  /**
   * Get or refresh user's access token
   */
  async getUserAccessToken(userId) {
    try {
      const result = await pool.query(
        `SELECT access_token, refresh_token, token_expires_at, auth_type
         FROM zoom_user_credentials 
         WHERE user_id = $1 AND is_active = true`,
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('Zoom credentials not found for user');
      }

      const credentials = result.rows[0];

      // Handle direct API key/secret authentication (JWT)
      if (credentials.auth_type === 'direct') {
        const expiresAt = new Date(credentials.token_expires_at);

        // Check if JWT needs regeneration (regenerate 5 minutes before expiry)
        if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
          logger.info(`Regenerating Zoom JWT token for user ${userId}`);
          
          // Get API key and secret from stored credentials
          const apiKey = credentials.api_key;
          const apiSecret = credentials.refresh_token; // API secret stored in refresh_token field
          
          if (!apiKey || !apiSecret) {
            throw new Error('API key or secret missing. Please re-authenticate.');
          }

          try {
            const newJWT = this.generateJWTToken(apiKey, apiSecret);
            const newExpiresAt = new Date(Date.now() + (60 * 60 * 1000));

            await pool.query(
              `UPDATE zoom_user_credentials 
               SET access_token = $1, token_expires_at = $2, updated_at = NOW()
               WHERE user_id = $3`,
              [newJWT, newExpiresAt, userId]
            );

            return newJWT;
          } catch (error) {
            logger.error(`Failed to regenerate JWT token:`, error);
            throw new Error('Failed to regenerate Zoom JWT token. Please re-authenticate.');
          }
        }

        return credentials.access_token;
      }

      // Handle OAuth token refresh
      const expiresAt = new Date(credentials.token_expires_at);

      // Check if token needs refresh (refresh 5 minutes before expiry)
      if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
        logger.info(`Refreshing Zoom OAuth token for user ${userId}`);
        const newTokens = await this.refreshAccessToken(credentials.refresh_token);
        
        // Update database
        await pool.query(
          `UPDATE zoom_user_credentials 
           SET access_token = $1, refresh_token = $2, token_expires_at = NOW() + INTERVAL '1 second' * $3, updated_at = NOW()
           WHERE user_id = $4`,
          [newTokens.accessToken, newTokens.refreshToken, newTokens.expiresIn, userId]
        );

        return newTokens.accessToken;
      }

      return credentials.access_token;
    } catch (error) {
      logger.error(`Failed to get Zoom access token for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Store OAuth state for verification
   */
  async storeOAuthState(userId, state) {
    // Store in database with expiration (5 minutes)
    await pool.query(
      `INSERT INTO zoom_oauth_states (user_id, state_token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '5 minutes')
       ON CONFLICT (user_id) DO UPDATE SET state_token = $2, expires_at = NOW() + INTERVAL '5 minutes'`,
      [userId, state]
    );
  }

  /**
   * Verify OAuth state
   */
  async verifyOAuthState(userId, state) {
    const result = await pool.query(
      `SELECT state_token FROM zoom_oauth_states 
       WHERE user_id = $1 AND state_token = $2 AND expires_at > NOW()`,
      [userId, state]
    );

    if (result.rows.length === 0) {
      return false;
    }

    // Clean up used state
    await pool.query(
      `DELETE FROM zoom_oauth_states WHERE user_id = $1 AND state_token = $2`,
      [userId, state]
    );

    return true;
  }

  /**
   * Store user credentials (OAuth)
   */
  async storeUserCredentials(userId, tokens, zoomUserId = null) {
    const expiresAt = new Date(Date.now() + (tokens.expiresIn * 1000));

    await pool.query(
      `INSERT INTO zoom_user_credentials (user_id, zoom_user_id, access_token, refresh_token, token_expires_at, auth_type, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'oauth', true, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         zoom_user_id = COALESCE(EXCLUDED.zoom_user_id, zoom_user_credentials.zoom_user_id),
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         token_expires_at = EXCLUDED.token_expires_at,
         auth_type = 'oauth',
         is_active = true,
         updated_at = NOW()`,
      [userId, zoomUserId, tokens.accessToken, tokens.refreshToken, expiresAt]
    );

    logger.info(`Stored Zoom OAuth credentials for user ${userId}`);
  }

  /**
   * Get user's Zoom profile
   */
  async getUserProfile(userId) {
    try {
      const accessToken = await this.getUserAccessToken(userId);
      
      const response = await axios.get(
        `${this.config.apiBaseUrl}/users/me`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error(`Failed to get Zoom profile for user ${userId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create a Zoom meeting
   */
  async createMeeting(userId, meetingData) {
    try {
      const accessToken = await this.getUserAccessToken(userId);
      
      const meetingPayload = {
        topic: meetingData.topic || 'Intercom Meeting',
        type: meetingData.type || 2, // 2 = scheduled meeting, 1 = instant, 3 = recurring
        start_time: meetingData.startTime || new Date().toISOString(),
        duration: meetingData.duration || 60,
        timezone: meetingData.timezone || 'UTC',
        settings: {
          host_video: meetingData.settings?.hostVideo !== false,
          participant_video: meetingData.settings?.participantVideo !== false,
          join_before_host: meetingData.settings?.joinBeforeHost || false,
          mute_upon_entry: meetingData.settings?.muteUponEntry || false,
          waiting_room: meetingData.settings?.waitingRoom || false,
          audio: 'both', // both, telephony, voip
          auto_recording: meetingData.settings?.autoRecording || 'none', // none, local, cloud
          ...meetingData.settings
        }
      };

      const response = await axios.post(
        `${this.config.apiBaseUrl}/users/me/meetings`,
        meetingPayload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const meeting = response.data;

      // Store meeting in database
      await pool.query(
        `INSERT INTO zoom_meetings (id, user_id, zoom_meeting_id, topic, start_time, duration, join_url, start_url, password, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET
           topic = EXCLUDED.topic,
           start_time = EXCLUDED.start_time,
           duration = EXCLUDED.duration,
           join_url = EXCLUDED.join_url,
           start_url = EXCLUDED.start_url,
           password = EXCLUDED.password,
           updated_at = NOW()`,
        [
          crypto.randomUUID(),
          userId,
          meeting.id.toString(),
          meeting.topic,
          meeting.start_time,
          meeting.duration,
          meeting.join_url,
          meeting.start_url,
          meeting.password || null
        ]
      );

      logger.info(`Created Zoom meeting ${meeting.id} for user ${userId}`);
      return meeting;
    } catch (error) {
      logger.error(`Failed to create Zoom meeting for user ${userId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get meeting details
   */
  async getMeeting(meetingId, userId) {
    try {
      const accessToken = await this.getUserAccessToken(userId);
      
      const response = await axios.get(
        `${this.config.apiBaseUrl}/meetings/${meetingId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error(`Failed to get Zoom meeting ${meetingId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Join a Zoom meeting (returns join URL)
   */
  async joinMeeting(meetingId, userId) {
    try {
      // Get meeting from database or API
      const dbResult = await pool.query(
        `SELECT zoom_meeting_id, join_url, start_url FROM zoom_meetings WHERE id = $1 OR zoom_meeting_id = $1`,
        [meetingId]
      );

      if (dbResult.rows.length > 0) {
        return {
          joinUrl: dbResult.rows[0].join_url,
          startUrl: dbResult.rows[0].start_url,
          meetingId: dbResult.rows[0].zoom_meeting_id
        };
      }

      // If not in database, try to get from API
      const meeting = await this.getMeeting(meetingId, userId);
      return {
        joinUrl: meeting.join_url,
        startUrl: meeting.start_url,
        meetingId: meeting.id.toString()
      };
    } catch (error) {
      logger.error(`Failed to join Zoom meeting ${meetingId}:`, error);
      throw error;
    }
  }

  /**
   * Bridge Zoom meeting audio to Matrix room
   * This will use WebRTC or SIP to connect to Zoom's audio stream
   */
  async bridgeMeetingToMatrixRoom(meetingId, matrixRoomId, userId, options = {}) {
    try {
      // Get meeting info
      const meetingInfo = await this.joinMeeting(meetingId, userId);
      
      // Get meeting details for SIP dial-in info
      const meeting = await this.getMeeting(meetingInfo.meetingId, userId);
      
      // Initialize Zoom-Matrix bridge service
      const { getZoomMatrixBridge } = require('./zoomMatrixBridge');
      const zoomMatrixBridge = getZoomMatrixBridge();

      // Prepare bridge options
      const bridgeOptions = {
        method: options.method || (meeting.settings?.sip_dial_in_uri ? 'sip' : 'webrtc'),
        sipInfo: meeting.settings?.sip_dial_in_uri ? {
          dialInNumber: meeting.settings?.global_dial_in_numbers?.[0]?.number,
          dialInNumbers: meeting.settings?.global_dial_in_numbers || [],
          meetingId: meetingInfo.meetingId,
          passcode: meeting.password,
          sipUri: meeting.settings?.sip_dial_in_uri
        } : null,
        ...options
      };

      // Bridge via Zoom-Matrix bridge service
      const bridgeInfo = await zoomMatrixBridge.bridgeMeetingToMatrixRoom(
        meetingInfo.meetingId,
        matrixRoomId,
        userId,
        bridgeOptions
      );

      // Store in database
      await pool.query(
        `INSERT INTO zoom_matrix_bridges (id, zoom_meeting_id, matrix_room_id, user_id, is_active, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, $5::jsonb, NOW(), NOW())
         ON CONFLICT (zoom_meeting_id, matrix_room_id) DO UPDATE SET
           is_active = true,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
        [
          bridgeInfo.bridgeId,
          meetingInfo.meetingId,
          matrixRoomId,
          userId,
          JSON.stringify({
            method: bridgeInfo.method,
            joinUrl: meetingInfo.joinUrl,
            startUrl: meetingInfo.startUrl
          })
        ]
      );

      logger.info(`Bridged Zoom meeting ${meetingId} to Matrix room ${matrixRoomId}`, {
        method: bridgeInfo.method,
        bridgeId: bridgeInfo.bridgeId
      });

      return {
        bridgeId: bridgeInfo.bridgeId,
        meetingId: meetingInfo.meetingId,
        matrixRoomId: bridgeInfo.matrixRoomId,
        method: bridgeInfo.method,
        joinUrl: meetingInfo.joinUrl,
        startUrl: meetingInfo.startUrl,
        isActive: bridgeInfo.isActive
      };
    } catch (error) {
      logger.error(`Failed to bridge Zoom meeting to Matrix room:`, error);
      throw error;
    }
  }

  /**
   * End bridge between Zoom meeting and Matrix room
   */
  async endBridge(meetingId, matrixRoomId) {
    try {
      // Use Zoom-Matrix bridge service to end the bridge
      const { getZoomMatrixBridge } = require('./zoomMatrixBridge');
      const zoomMatrixBridge = getZoomMatrixBridge();

      await zoomMatrixBridge.endBridge(meetingId, matrixRoomId);

      logger.info(`Ended bridge between Zoom meeting ${meetingId} and Matrix room ${matrixRoomId}`);
    } catch (error) {
      logger.error(`Failed to end Zoom bridge:`, error);
      throw error;
    }
  }

  /**
   * Get user's Zoom meetings
   */
  async getUserMeetings(userId, options = {}) {
    try {
      const accessToken = await this.getUserAccessToken(userId);
      
      const params = new URLSearchParams({
        page_size: options.pageSize || 30,
        type: options.type || 'scheduled' // scheduled, live, upcoming, past
      });

      if (options.from) {
        params.append('from', options.from);
      }
      if (options.to) {
        params.append('to', options.to);
      }

      const response = await axios.get(
        `${this.config.apiBaseUrl}/users/me/meetings?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error(`Failed to get Zoom meetings for user ${userId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Revoke user's Zoom access
   */
  async revokeUserAccess(userId) {
    try {
      await pool.query(
        `UPDATE zoom_user_credentials SET is_active = false, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );

      logger.info(`Revoked Zoom access for user ${userId}`);
    } catch (error) {
      logger.error(`Failed to revoke Zoom access for user ${userId}:`, error);
      throw error;
    }
  }
}

let zoomServiceInstance = null;

function initializeZoomService() {
  if (!zoomServiceInstance) {
    zoomServiceInstance = new ZoomService();
  }
  return zoomServiceInstance;
}

function getZoomService() {
  if (!zoomServiceInstance) {
    zoomServiceInstance = new ZoomService();
  }
  return zoomServiceInstance;
}

module.exports = {
  initializeZoomService,
  getZoomService,
  ZoomService
};

