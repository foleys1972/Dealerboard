const logger = require('../utils/logger');
const { MatrixService } = require('./matrixService');
const { getUserById, updateUser, findUsers } = require('./databaseService');

class MatrixUserSync {
  constructor() {
    this.matrixService = new MatrixService();
    this.syncInterval = null;
    this.isRunning = false;
    this.lastSyncTime = null;
    this.syncStats = {
      totalUsers: 0,
      syncedUsers: 0,
      failedUsers: 0,
      lastSync: null
    };
  }

  async initialize() {
    try {
      if (!this.matrixService.config.enabled) {
        logger.warn('Matrix user sync disabled - Matrix service not enabled');
        return;
      }

      // Initialize Matrix service
      await this.matrixService.initialize();

      // Start periodic sync
      this.startPeriodicSync();

      logger.info('Matrix user sync initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Matrix user sync:', error);
    }
  }

  startPeriodicSync() {
    if (this.isRunning) return;

    // Sync every 5 minutes
    this.syncInterval = setInterval(async () => {
      await this.syncAllUsers();
    }, 5 * 60 * 1000);

    this.isRunning = true;
    logger.info('Matrix user sync started (every 5 minutes)');
  }

  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.isRunning = false;
    logger.info('Matrix user sync stopped');
  }

  async syncAllUsers() {
    try {
      logger.info('Starting Matrix user sync...');
      this.lastSyncTime = new Date();
      this.syncStats = {
        totalUsers: 0,
        syncedUsers: 0,
        failedUsers: 0,
        lastSync: this.lastSyncTime
      };

      // Get all users from database
      const users = await findUsers({});
      this.syncStats.totalUsers = users.length;

      logger.info(`Syncing ${users.length} users to Matrix...`);

      for (const user of users) {
        try {
          await this.syncUserToMatrix(user);
          this.syncStats.syncedUsers++;
        } catch (error) {
          logger.error(`Failed to sync user ${user.id} to Matrix:`, error.message);
          this.syncStats.failedUsers++;
        }
      }

      logger.info('Matrix user sync completed', this.syncStats);
    } catch (error) {
      logger.error('Matrix user sync failed:', error);
    }
  }

  async syncUserToMatrix(user) {
    try {
      if (!this.matrixService.config.enabled) {
        throw new Error('Matrix service not enabled');
      }

      // Create Matrix user ID
      const matrixUserId = `@trading-intercom_${user.username}:${this.matrixService.config.serverName}`;
      
      // Check if user already exists in Matrix
      const existingUser = await this.getMatrixUser(matrixUserId);
      
      if (existingUser) {
        // Update existing user
        await this.updateMatrixUser(matrixUserId, {
          displayName: user.displayName || user.username,
          avatarUrl: user.avatarUrl || null,
          email: user.email,
          isActive: user.isActive
        });
        
        logger.debug(`Updated Matrix user: ${matrixUserId}`);
      } else {
        // Create new Matrix user
        await this.createMatrixUser(matrixUserId, {
          displayName: user.displayName || user.username,
          avatarUrl: user.avatarUrl || null,
          email: user.email,
          isActive: user.isActive
        });
        
        logger.debug(`Created Matrix user: ${matrixUserId}`);
      }

      // Update user record with Matrix user ID
      await updateUser(user.id, {
        matrixUserId: matrixUserId,
        lastMatrixSync: new Date()
      });

    } catch (error) {
      logger.error(`Failed to sync user ${user.id} to Matrix:`, error);
      throw error;
    }
  }

  async createMatrixUser(matrixUserId, userData) {
    try {
      // This would typically involve creating a user account on the Matrix server
      // For now, we'll just log the action as Matrix user creation requires
      // server-side user registration which is handled by the Matrix homeserver
      
      logger.info(`Matrix user creation requested: ${matrixUserId}`, userData);
      
      // In a real implementation, you would:
      // 1. Register the user with the Matrix homeserver
      // 2. Set up user profile
      // 3. Configure user permissions
      
      return {
        userId: matrixUserId,
        displayName: userData.displayName,
        avatarUrl: userData.avatarUrl,
        email: userData.email,
        isActive: userData.isActive
      };
    } catch (error) {
      logger.error(`Failed to create Matrix user ${matrixUserId}:`, error);
      throw error;
    }
  }

  async updateMatrixUser(matrixUserId, userData) {
    try {
      // This would typically involve updating user profile on Matrix server
      logger.info(`Matrix user update requested: ${matrixUserId}`, userData);
      
      // In a real implementation, you would:
      // 1. Update user profile on Matrix server
      // 2. Update user permissions if needed
      // 3. Sync user status
      
      return {
        userId: matrixUserId,
        displayName: userData.displayName,
        avatarUrl: userData.avatarUrl,
        email: userData.email,
        isActive: userData.isActive
      };
    } catch (error) {
      logger.error(`Failed to update Matrix user ${matrixUserId}:`, error);
      throw error;
    }
  }

  async getMatrixUser(matrixUserId) {
    try {
      // This would typically involve querying the Matrix server for user info
      // For now, we'll return null as we don't have a real Matrix server running
      
      logger.debug(`Matrix user query: ${matrixUserId}`);
      return null;
    } catch (error) {
      logger.error(`Failed to get Matrix user ${matrixUserId}:`, error);
      return null;
    }
  }

  async syncUserFromMatrix(matrixUserId) {
    try {
      // This would typically involve getting user data from Matrix server
      // and syncing it back to our database
      
      logger.info(`Matrix user sync from Matrix: ${matrixUserId}`);
      
      // In a real implementation, you would:
      // 1. Get user profile from Matrix server
      // 2. Update local user record
      // 3. Sync user groups/rooms
      
      return null;
    } catch (error) {
      logger.error(`Failed to sync user from Matrix ${matrixUserId}:`, error);
      throw error;
    }
  }

  async syncUserGroups(userId) {
    try {
      const user = await getUserById(userId);
      if (!user || !user.matrixUserId) {
        throw new Error('User or Matrix user ID not found');
      }

      // Get user's groups
      const userGroups = await this.getUserGroups(userId);
      
      // Sync each group to Matrix
      for (const group of userGroups) {
        if (group.matrixRoomId) {
          try {
            // Ensure user is in the Matrix room
            await this.matrixService.inviteUser(group.matrixRoomId, user.matrixUserId);
            logger.debug(`User ${userId} synced to Matrix room ${group.matrixRoomId}`);
          } catch (error) {
            logger.warn(`Failed to sync user ${userId} to Matrix room ${group.matrixRoomId}:`, error.message);
          }
        }
      }

      logger.info(`User ${userId} groups synced to Matrix`);
    } catch (error) {
      logger.error(`Failed to sync user groups for ${userId}:`, error);
      throw error;
    }
  }

  async getUserGroups(userId) {
    try {
      // This would typically query the group service for user's groups
      // For now, we'll return an empty array
      
      logger.debug(`Getting groups for user: ${userId}`);
      return [];
    } catch (error) {
      logger.error(`Failed to get groups for user ${userId}:`, error);
      return [];
    }
  }

  async handleMatrixUserEvent(event) {
    try {
      const { type, content, sender } = event;
      
      switch (type) {
        case 'm.room.member':
          await this.handleMatrixMemberEvent(event);
          break;
        case 'm.room.message':
          await this.handleMatrixMessageEvent(event);
          break;
        default:
          logger.debug(`Unhandled Matrix event type: ${type}`);
      }
    } catch (error) {
      logger.error('Failed to handle Matrix user event:', error);
    }
  }

  async handleMatrixMemberEvent(event) {
    try {
      const { content, sender, state_key } = event;
      const membership = content.membership;
      
      logger.info(`Matrix member event: ${state_key} ${membership} in room ${event.room_id}`);
      
      // Handle different membership states
      switch (membership) {
        case 'join':
          await this.handleUserJoined(event);
          break;
        case 'leave':
          await this.handleUserLeft(event);
          break;
        case 'invite':
          await this.handleUserInvited(event);
          break;
        case 'ban':
          await this.handleUserBanned(event);
          break;
      }
    } catch (error) {
      logger.error('Failed to handle Matrix member event:', error);
    }
  }

  async handleMatrixMessageEvent(event) {
    try {
      const { content, sender, room_id } = event;
      
      logger.debug(`Matrix message event: ${sender} in room ${room_id}`);
      
      // Handle different message types
      if (content.msgtype === 'm.text') {
        await this.handleTextMessage(event);
      } else if (content.msgtype === 'm.image') {
        await this.handleImageMessage(event);
      }
    } catch (error) {
      logger.error('Failed to handle Matrix message event:', error);
    }
  }

  async handleUserJoined(event) {
    // Handle user joining a Matrix room
    logger.info(`User joined Matrix room: ${event.state_key} in ${event.room_id}`);
  }

  async handleUserLeft(event) {
    // Handle user leaving a Matrix room
    logger.info(`User left Matrix room: ${event.state_key} in ${event.room_id}`);
  }

  async handleUserInvited(event) {
    // Handle user being invited to a Matrix room
    logger.info(`User invited to Matrix room: ${event.state_key} in ${event.room_id}`);
  }

  async handleUserBanned(event) {
    // Handle user being banned from a Matrix room
    logger.info(`User banned from Matrix room: ${event.state_key} in ${event.room_id}`);
  }

  async handleTextMessage(event) {
    // Handle text message from Matrix
    logger.debug(`Text message from Matrix: ${event.sender} in ${event.room_id}`);
  }

  async handleImageMessage(event) {
    // Handle image message from Matrix
    logger.debug(`Image message from Matrix: ${event.sender} in ${event.room_id}`);
  }

  getSyncStats() {
    return {
      ...this.syncStats,
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime
    };
  }

  async cleanup() {
    this.stopPeriodicSync();
    logger.info('Matrix user sync cleaned up');
  }
}

// Initialize the service
const matrixUserSync = new MatrixUserSync();

module.exports = {
  matrixUserSync,
  MatrixUserSync,
  initializeMatrixUserSync: () => matrixUserSync.initialize(),
};
