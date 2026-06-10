const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const {
  authenticateToken,
  generateToken,
  JWT_EXPIRES_IN,
} = require('../../middleware/auth');
const { activeDirectoryService } = require('../../services/activeDirectoryService');
const { groupService } = require('../../services/groupService');
const {
  createUser,
  findUsers,
  updateUser,
  deleteUser,
  getUserById,
  getUserByIdOrUsername,
  updateUserStatus,
  createUserNotification,
} = require('../../services/databaseService');
const { getOrchestratorService } = require('../../services/orchestratorService');
const logger = require('../../utils/logger');
const sessionStore = require('../../services/auth/sessionStore');
const routingService = require('../../services/auth/routingService');
const userPresenceService = require('../../services/auth/userPresenceService');
const { buildSipUriForUser, getTenantRoom, collectOnlineKeys } = require('../../services/auth/helpers');

const {
  cacheLocalUser,
  findLocalUserById,
  getUserByUsername,
  userSessions,
  localUsers,
  getIo,
} = sessionStore;

router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.username || req.user.id;
    const tenantId = req.user.tid || process.env.DEFAULT_TENANT_ID || 'tenant-default';
    const subTenantId = req.user.stid || process.env.DEFAULT_SUB_TENANT_ID || 'subtenant-default';
    
    // Update user status to offline in database
    try {
      await updateUserStatus(userId, 'offline');
      logger.info(`Updated user ${userId} status to offline in database`);
    } catch (error) {
      logger.warn('Failed to update user status to offline:', error.message);
    }

    // Emit presence-update event for all clients
    if (getIo()) {
      try {
        const tenantRoom = getTenantRoom(tenantId, subTenantId);
        getIo().to(tenantRoom).emit('presence-update', { 
          userId: userId, 
          username: req.user.username, 
          online: false,
          status: 'offline'
        });
        logger.info(`Emitted presence-update for user ${userId} (HTTP logout)`);
      } catch (error) {
        logger.warn('Failed to emit presence-update on logout:', error.message);
      }
    }
    
    // Try to delete session by username first, then by ID
    const sessionKey = req.user.username || req.user.id;
    userSessions.delete(sessionKey);
    if (sessionKey !== req.user.id) {
      userSessions.delete(req.user.id); // Also try deleting by ID for backward compatibility
    }
    
    logger.info(`User ${req.user.username} logged out`);
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Get current user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // Try to get session by username first, then by ID
    const sessionKey = req.user.username || req.user.id;
    let session = userSessions.get(sessionKey);
    if (!session) {
      session = userSessions.get(req.user.id);
    }
    if (!session) {
      return res.status(401).json({ error: 'Session not found' });
    }

    // Update last activity
    session.lastActivity = new Date();

    // Fetch user from database to get latest settings - use username if available
    const userIdentifier = req.user.username || req.user.id;
    const dbUser = await getUserByIdOrUsername(userIdentifier);
    const userData = {
      ...session.user,
      id: dbUser?.username || dbUser?.id || req.user.username || req.user.id, // Ensure id is username
      username: dbUser?.username || session.user.username,
      settings: dbUser?.settings || {},
      region: dbUser?.region || null,
      zoomEnabled: dbUser?.zoomEnabled || false,
      teamsEnabled: dbUser?.teamsEnabled || false,
      locationId: dbUser?.locationId || null
    };

    try {
      await routingService.applyRoutingToUserData(userData, dbUser);
    } catch (error) {
      logger.warn('Failed to compute location-based subscriber routing during /me:', error.message);
    }

    // Get user's assigned homeserver (geographic routing)
    try {
      const orchestratorService = getOrchestratorService();
      if (orchestratorService && orchestratorService.isInitialized) {
        const userRegion = await orchestratorService.getUserRegion(req.user.id);
        const homeserver = await orchestratorService.getUserHomeserver(req.user.id);

        userData.region = userRegion;

        if (homeserver) {
          userData.matrixHomeserver = {
            id: homeserver.id,
            serverName: homeserver.serverName,
            region: homeserver.region,
            baseUrl: homeserver.baseUrl,
            federationUrl: homeserver.federationUrl,
          };
        }
      }
    } catch (error) {
      logger.warn('Failed to get user homeserver:', error.message);
    }

    res.json({
      success: true,
      user: userData
    });
  } catch (error) {
    logger.error('Get user info error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

module.exports = router;
