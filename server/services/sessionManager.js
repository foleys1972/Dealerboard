const logger = require('../utils/logger');

class SessionManager {
  constructor(redisService) {
    this.redis = redisService;
    this.sessions = new Map(); // Fallback in-memory storage
    this.sessionTimeout = 24 * 60 * 60; // 24 hours default
    this.cleanupInterval = null;
  }

  async initialize() {
    try {
      // Start session cleanup every 5 minutes
      this.cleanupInterval = setInterval(async () => {
        await this.cleanupExpiredSessions();
      }, 5 * 60 * 1000);

      logger.info('Session manager initialized');
    } catch (error) {
      logger.error('Failed to initialize session manager:', error);
    }
  }

  async createSession(userId, userData, options = {}) {
    try {
      const sessionId = this.generateSessionId();
      const sessionData = {
        sessionId,
        userId,
        userData,
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        ipAddress: options.ipAddress || null,
        userAgent: options.userAgent || null,
        isActive: true,
        permissions: userData.permissions || [],
        groups: userData.groups || [],
        expiresAt: new Date(Date.now() + (options.ttl || this.sessionTimeout) * 1000).toISOString()
      };

      // Store in Redis if available, otherwise use in-memory
      if (this.redis && this.redis.isConnected) {
        await this.redis.setSession(sessionId, sessionData, options.ttl || this.sessionTimeout);
        await this.redis.addUserSession(userId, sessionId);
      } else {
        this.sessions.set(sessionId, sessionData);
      }

      logger.info(`Session created for user ${userId}: ${sessionId}`);
      return sessionId;
    } catch (error) {
      logger.error('Failed to create session:', error);
      throw error;
    }
  }

  async getSession(sessionId) {
    try {
      let sessionData = null;

      if (this.redis && this.redis.isConnected) {
        sessionData = await this.redis.getSession(sessionId);
      } else {
        sessionData = this.sessions.get(sessionId);
      }

      if (!sessionData) {
        return null;
      }

      // Check if session is expired
      if (new Date(sessionData.expiresAt) < new Date()) {
        await this.deleteSession(sessionId);
        return null;
      }

      // Update last accessed time
      sessionData.lastAccessed = new Date().toISOString();
      
      if (this.redis && this.redis.isConnected) {
        await this.redis.setSession(sessionId, sessionData, this.sessionTimeout);
      } else {
        this.sessions.set(sessionId, sessionData);
      }

      return sessionData;
    } catch (error) {
      logger.error('Failed to get session:', error);
      return null;
    }
  }

  async updateSession(sessionId, updates) {
    try {
      const sessionData = await this.getSession(sessionId);
      if (!sessionData) {
        return false;
      }

      // Update session data
      Object.assign(sessionData, updates);
      sessionData.lastAccessed = new Date().toISOString();

      if (this.redis && this.redis.isConnected) {
        await this.redis.setSession(sessionId, sessionData, this.sessionTimeout);
      } else {
        this.sessions.set(sessionId, sessionData);
      }

      return true;
    } catch (error) {
      logger.error('Failed to update session:', error);
      return false;
    }
  }

  async deleteSession(sessionId) {
    try {
      const sessionData = await this.getSession(sessionId);
      
      if (this.redis && this.redis.isConnected) {
        await this.redis.deleteSession(sessionId);
        if (sessionData) {
          await this.redis.removeUserSession(sessionData.userId, sessionId);
        }
      } else {
        this.sessions.delete(sessionId);
      }

      logger.info(`Session deleted: ${sessionId}`);
      return true;
    } catch (error) {
      logger.error('Failed to delete session:', error);
      return false;
    }
  }

  async extendSession(sessionId, ttl = this.sessionTimeout) {
    try {
      const sessionData = await this.getSession(sessionId);
      if (!sessionData) {
        return false;
      }

      sessionData.expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
      
      if (this.redis && this.redis.isConnected) {
        await this.redis.setSession(sessionId, sessionData, ttl);
      } else {
        this.sessions.set(sessionId, sessionData);
      }

      return true;
    } catch (error) {
      logger.error('Failed to extend session:', error);
      return false;
    }
  }

  async getUserSessions(userId) {
    try {
      if (this.redis && this.redis.isConnected) {
        const sessionIds = await this.redis.getUserSessions(userId);
        const sessions = [];
        
        for (const sessionId of sessionIds) {
          const sessionData = await this.getSession(sessionId);
          if (sessionData) {
            sessions.push(sessionData);
          }
        }
        
        return sessions;
      } else {
        // Fallback to in-memory search
        const sessions = [];
        for (const [sessionId, sessionData] of this.sessions) {
          if (sessionData.userId === userId) {
            sessions.push(sessionData);
          }
        }
        return sessions;
      }
    } catch (error) {
      logger.error('Failed to get user sessions:', error);
      return [];
    }
  }

  async deleteUserSessions(userId) {
    try {
      const sessions = await this.getUserSessions(userId);
      
      for (const session of sessions) {
        await this.deleteSession(session.sessionId);
      }

      logger.info(`Deleted all sessions for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('Failed to delete user sessions:', error);
      return false;
    }
  }

  async cleanupExpiredSessions() {
    try {
      const now = new Date();
      let cleanedCount = 0;

      if (this.redis && this.redis.isConnected) {
        // Redis handles TTL automatically, but we can clean up user session sets
        // This would require scanning all user session sets, which is expensive
        // For now, we'll rely on Redis TTL
        return;
      } else {
        // Clean up in-memory sessions
        for (const [sessionId, sessionData] of this.sessions) {
          if (new Date(sessionData.expiresAt) < now) {
            this.sessions.delete(sessionId);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} expired sessions`);
      }
    } catch (error) {
      logger.error('Failed to cleanup expired sessions:', error);
    }
  }

  async getActiveSessionCount() {
    try {
      if (this.redis && this.redis.isConnected) {
        // This would require scanning all session keys, which is expensive
        // For now, return 0 and implement proper counting later
        return 0;
      } else {
        return this.sessions.size;
      }
    } catch (error) {
      logger.error('Failed to get active session count:', error);
      return 0;
    }
  }

  async getSessionStats() {
    try {
      const activeCount = await this.getActiveSessionCount();
      
      return {
        activeSessions: activeCount,
        sessionTimeout: this.sessionTimeout,
        redisEnabled: this.redis && this.redis.isConnected,
        lastCleanup: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get session stats:', error);
      return {
        activeSessions: 0,
        sessionTimeout: this.sessionTimeout,
        redisEnabled: false,
        lastCleanup: null
      };
    }
  }

  generateSessionId() {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substr(2, 9);
    return `sess_${timestamp}_${randomPart}`;
  }

  async cleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    logger.info('Session manager cleaned up');
  }
}

module.exports = {
  SessionManager,
};
