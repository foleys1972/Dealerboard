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

router.get('/sessions', authenticateToken, (req, res) => {
  try {
    // Check if user has admin role
    if (req.user.role !== 'platform_admin') {
      return res.status(403).json({ error: 'Admin role required' });
    }

    const callerTenantId = req.user.tid || req.user.tenantId || null;
    if (callerTenantId) {
      return res.status(403).json({ error: 'Platform admin access is restricted to tenantless scope' });
    }

    const sessions = Array.from(userSessions.values()).map(session => ({
      userId: session.user.id,
      username: session.user.username,
      loginTime: session.loginTime,
      lastActivity: session.lastActivity,
      source: session.user.source
    }));

    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    logger.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// Revoke session
router.delete('/sessions/:userId', authenticateToken, (req, res) => {
  try {
    // Check if user has admin role
    if (req.user.role !== 'platform_admin') {
      return res.status(403).json({ error: 'Admin role required' });
    }

    const callerTenantId = req.user.tid || req.user.tenantId || null;
    if (callerTenantId) {
      return res.status(403).json({ error: 'Platform admin access is restricted to tenantless scope' });
    }

    const { userId } = req.params;
    const session = userSessions.get(userId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    userSessions.delete(userId);
    
    logger.info(`Session revoked for user ${session.user.username}`);
    
    res.json({
      success: true,
      message: 'Session revoked successfully'
    });
  } catch (error) {
    logger.error('Revoke session error:', error);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

module.exports = router;
