const axios = require('axios');
const crypto = require('crypto');
const { pool } = require('./databaseService');
const logger = require('../utils/logger');

/**
 * Microsoft Teams Service
 * Handles OAuth authentication, Graph API access, meeting management, and audio/video bridging
 */
class TeamsService {
  constructor() {
    this.config = {
      enabled: process.env.TEAMS_ENABLED === 'true',
      clientId: process.env.TEAMS_CLIENT_ID,
      clientSecret: process.env.TEAMS_CLIENT_SECRET,
      tenantId: process.env.TEAMS_TENANT_ID,
      redirectUri: process.env.TEAMS_REDIRECT_URI || `${process.env.CLIENT_URL || 'http://localhost:3000'}/api/teams/callback`,
      apiBaseUrl: 'https://graph.microsoft.com/v1.0',
      oauthBaseUrl: `https://login.microsoftonline.com/${process.env.TEAMS_TENANT_ID || 'common'}/oauth2/v2.0`,
      scopes: 'OnlineMeetings.ReadWrite User.Read Calendars.ReadWrite',
    };
    
    this.activeMeetings = new Map(); // meetingId -> MeetingInfo
    this.activeBridges = new Map(); // meetingId -> BridgeInfo
    this.isInitialized = false;
  }

  async initialize() {
    if (!this.config.enabled) {
      logger.info('Microsoft Teams integration disabled');
      return;
    }

    if (!this.config.clientId || !this.config.clientSecret) {
      logger.warn('Teams credentials not configured - integration will be limited');
      return;
    }

    this.isInitialized = true;
    logger.info('Microsoft Teams service initialized');
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(userId, state = null) {
    const stateToken = state || crypto.randomBytes(16).toString('hex');
    
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      response_mode: 'query',
      scope: this.config.scopes,
      state: stateToken
    });

    // Store state for verification
    if (userId) {
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
      const response = await axios.post(
        `${this.config.oauthBaseUrl}/token`,
        new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code: code,
          redirect_uri: this.config.redirectUri,
          grant_type: 'authorization_code',
          scope: this.config.scopes
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type,
        scope: response.data.scope,
        idToken: response.data.id_token
      };
    } catch (error) {
      logger.error('Failed to exchange Teams OAuth code:', error.response?.data || error.message);
      throw new Error(`Teams OAuth token exchange failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken) {
    try {
      const response = await axios.post(
        `${this.config.oauthBaseUrl}/token`,
        new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
          scope: this.config.scopes
        }),
        {
          headers: {
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
      logger.error('Failed to refresh Teams access token:', error.response?.data || error.message);
      throw new Error(`Teams token refresh failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Store OAuth state
   */
  async storeOAuthState(userId, state) {
    try {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      
      await pool.query(
        `INSERT INTO teams_oauth_states (user_id, state_token, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET
           state_token = EXCLUDED.state_token,
           expires_at = EXCLUDED.expires_at`,
        [userId, state, expiresAt]
      );
    } catch (error) {
      logger.error('Failed to store Teams OAuth state:', error);
      throw error;
    }
  }

  /**
   * Verify OAuth state
   */
  async verifyOAuthState(userId, state) {
    try {
      const result = await pool.query(
        `SELECT state_token, expires_at FROM teams_oauth_states 
         WHERE user_id = $1 AND state_token = $2 AND expires_at > NOW()`,
        [userId, state]
      );

      if (result.rows.length === 0) {
        return false;
      }

      // Clean up used state
      await pool.query(
        `DELETE FROM teams_oauth_states WHERE user_id = $1`,
        [userId]
      );

      return true;
    } catch (error) {
      logger.error('Failed to verify Teams OAuth state:', error);
      return false;
    }
  }

  /**
   * Store user credentials
   */
  async storeUserCredentials(userId, tokens, teamsUserId = null) {
    try {
      const tokenExpiresAt = new Date(Date.now() + (tokens.expiresIn * 1000));
      
      await pool.query(
        `INSERT INTO teams_user_credentials (user_id, teams_user_id, access_token, refresh_token, token_expires_at, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           teams_user_id = EXCLUDED.teams_user_id,
           access_token = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token,
           token_expires_at = EXCLUDED.token_expires_at,
           is_active = true,
           updated_at = NOW()`,
        [userId, teamsUserId, tokens.accessToken, tokens.refreshToken, tokenExpiresAt]
      );
    } catch (error) {
      logger.error('Failed to store Teams user credentials:', error);
      throw error;
    }
  }

  /**
   * Get user access token (refresh if needed)
   */
  async getUserAccessToken(userId) {
    try {
      const result = await pool.query(
        `SELECT access_token, refresh_token, token_expires_at, auth_type
         FROM teams_user_credentials 
         WHERE user_id = $1 AND is_active = true`,
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('No Teams credentials found for user');
      }

      const credentials = result.rows[0];
      
      // Check if token is expired
      if (new Date(credentials.token_expires_at) <= new Date()) {
        // Refresh token
        const newTokens = await this.refreshAccessToken(credentials.refresh_token);
        await this.storeUserCredentials(userId, newTokens, credentials.teams_user_id);
        return newTokens.accessToken;
      }

      return credentials.access_token;
    } catch (error) {
      logger.error('Failed to get Teams access token:', error);
      throw error;
    }
  }

  /**
   * Get user profile from Microsoft Graph
   */
  async getUserProfile(userId) {
    try {
      const accessToken = await this.getUserAccessToken(userId);
      
      const response = await axios.get(
        `${this.config.apiBaseUrl}/me`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Failed to get Teams user profile:', error);
      throw error;
    }
  }

  /**
   * Revoke access
   */
  async revokeAccess(userId) {
    try {
      await pool.query(
        `UPDATE teams_user_credentials 
         SET is_active = false, updated_at = NOW()
         WHERE user_id = $1`,
        [userId]
      );

      logger.info(`Revoked Teams access for user ${userId}`);
    } catch (error) {
      logger.error('Failed to revoke Teams access:', error);
      throw error;
    }
  }

  /**
   * Create an online meeting
   */
  async createMeeting(userId, meetingDetails = {}) {
    try {
      const accessToken = await this.getUserAccessToken(userId);
      
      const meetingData = {
        startDateTime: meetingDetails.startTime || new Date().toISOString(),
        endDateTime: meetingDetails.endTime || new Date(Date.now() + 3600000).toISOString(), // 1 hour default
        subject: meetingDetails.subject || 'Teams Meeting',
        participants: meetingDetails.participants || {},
        ...meetingDetails
      };

      const response = await axios.post(
        `${this.config.apiBaseUrl}/me/onlineMeetings`,
        meetingData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Store meeting in database
      await pool.query(
        `INSERT INTO teams_meetings (id, user_id, teams_meeting_id, subject, start_time, end_time, join_url, join_web_url, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW(), NOW())
         ON CONFLICT (teams_meeting_id) DO UPDATE SET
           subject = EXCLUDED.subject,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           join_url = EXCLUDED.join_url,
           join_web_url = EXCLUDED.join_web_url,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
        [
          response.data.id,
          userId,
          response.data.id,
          response.data.subject,
          response.data.startDateTime,
          response.data.endDateTime,
          response.data.joinUrl,
          response.data.joinWebUrl,
          JSON.stringify(response.data)
        ]
      );

      return {
        id: response.data.id,
        subject: response.data.subject,
        joinUrl: response.data.joinUrl,
        joinWebUrl: response.data.joinWebUrl,
        startTime: response.data.startDateTime,
        endTime: response.data.endDateTime
      };
    } catch (error) {
      logger.error('Failed to create Teams meeting:', error);
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
        `${this.config.apiBaseUrl}/me/onlineMeetings/${meetingId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Failed to get Teams meeting:', error);
      throw error;
    }
  }

  /**
   * List user's meetings
   */
  async listMeetings(userId, options = {}) {
    try {
      const accessToken = await this.getUserAccessToken(userId);
      
      const params = new URLSearchParams({
        $top: options.limit || 10,
        $orderby: 'startDateTime desc'
      });

      const response = await axios.get(
        `${this.config.apiBaseUrl}/me/onlineMeetings?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      return response.data.value || [];
    } catch (error) {
      logger.error('Failed to list Teams meetings:', error);
      throw error;
    }
  }

  /**
   * Join meeting (get join URL)
   */
  async joinMeeting(meetingId, userId) {
    try {
      // Check if meeting is in database
      const dbResult = await pool.query(
        `SELECT join_url, join_web_url, teams_meeting_id 
         FROM teams_meetings 
         WHERE teams_meeting_id = $1 OR id = $1`,
        [meetingId]
      );

      if (dbResult.rows.length > 0) {
        return {
          joinUrl: dbResult.rows[0].join_url,
          joinWebUrl: dbResult.rows[0].join_web_url,
          meetingId: dbResult.rows[0].teams_meeting_id
        };
      }

      // If not in database, try to get from API
      const meeting = await this.getMeeting(meetingId, userId);
      return {
        joinUrl: meeting.joinUrl,
        joinWebUrl: meeting.joinWebUrl,
        meetingId: meeting.id
      };
    } catch (error) {
      logger.error(`Failed to join Teams meeting ${meetingId}:`, error);
      throw error;
    }
  }

  /**
   * Bridge Teams meeting audio/video to Matrix room
   */
  async bridgeMeetingToMatrixRoom(meetingId, matrixRoomId, userId, options = {}) {
    try {
      // Get meeting info
      const meetingInfo = await this.joinMeeting(meetingId, userId);
      
      // Get meeting details
      const meeting = await this.getMeeting(meetingInfo.meetingId, userId);
      
      // Initialize Teams-Matrix bridge service
      const { getTeamsMatrixBridge } = require('./teamsMatrixBridge');
      const teamsMatrixBridge = getTeamsMatrixBridge();

      // Prepare bridge options
      const bridgeOptions = {
        method: options.method || 'webrtc', // Teams uses WebRTC
        ...options
      };

      // Bridge via Teams-Matrix bridge service
      const bridgeInfo = await teamsMatrixBridge.bridgeMeetingToMatrixRoom(
        meetingInfo.meetingId,
        matrixRoomId,
        userId,
        bridgeOptions
      );

      // Store in database
      await pool.query(
        `INSERT INTO teams_matrix_bridges (id, teams_meeting_id, matrix_room_id, user_id, is_active, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, $5::jsonb, NOW(), NOW())
         ON CONFLICT (teams_meeting_id, matrix_room_id) DO UPDATE SET
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
            joinWebUrl: meetingInfo.joinWebUrl
          })
        ]
      );

      logger.info(`Bridged Teams meeting ${meetingId} to Matrix room ${matrixRoomId}`, {
        method: bridgeInfo.method,
        bridgeId: bridgeInfo.bridgeId
      });

      return {
        bridgeId: bridgeInfo.bridgeId,
        meetingId: meetingInfo.meetingId,
        matrixRoomId: bridgeInfo.matrixRoomId,
        method: bridgeInfo.method,
        joinUrl: meetingInfo.joinUrl,
        joinWebUrl: meetingInfo.joinWebUrl,
        isActive: bridgeInfo.isActive
      };
    } catch (error) {
      logger.error(`Failed to bridge Teams meeting to Matrix room:`, error);
      throw error;
    }
  }

  /**
   * End bridge between Teams meeting and Matrix room
   */
  async endBridge(meetingId, matrixRoomId) {
    try {
      // Use Teams-Matrix bridge service to end the bridge
      const { getTeamsMatrixBridge } = require('./teamsMatrixBridge');
      const teamsMatrixBridge = getTeamsMatrixBridge();

      await teamsMatrixBridge.endBridge(meetingId, matrixRoomId);

      logger.info(`Ended bridge between Teams meeting ${meetingId} and Matrix room ${matrixRoomId}`);
    } catch (error) {
      logger.error(`Failed to end Teams bridge:`, error);
      throw error;
    }
  }

  /**
   * Get user's Teams meetings
   */
  async getUserMeetings(userId, options = {}) {
    try {
      return await this.listMeetings(userId, options);
    } catch (error) {
      logger.error('Failed to get user Teams meetings:', error);
      throw error;
    }
  }
}

let teamsServiceInstance = null;

function initializeTeamsService() {
  if (!teamsServiceInstance) {
    teamsServiceInstance = new TeamsService();
  }
  return teamsServiceInstance;
}

function getTeamsService() {
  if (!teamsServiceInstance) {
    teamsServiceInstance = new TeamsService();
  }
  return teamsServiceInstance;
}

module.exports = {
  initializeTeamsService,
  getTeamsService,
  TeamsService
};

