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

router.get('/ad/status', authenticateToken, (req, res) => {
  try {
    const status = activeDirectoryService.getStatus();
    
    res.json({
      success: true,
      status
    });
  } catch (error) {
    logger.error('Get AD status error:', error);
    res.status(500).json({ error: 'Failed to get AD status' });
  }
});

// Sync users from AD
router.post('/ad/sync/users', authenticateToken, async (req, res) => {
  try {
    // Check if user has admin role
    if (req.user.role !== 'platform_admin') {
      return res.status(403).json({ error: 'Admin role required' });
    }

    const callerTenantId = req.user.tid || req.user.tenantId || null;
    if (callerTenantId) {
      return res.status(403).json({ error: 'Platform admin access is restricted to tenantless scope' });
    }

    const users = await activeDirectoryService.syncUsers();
    
    res.json({
      success: true,
      message: `Synced ${users.length} users from Active Directory`,
      users: users.slice(0, 100) // Return first 100 users
    });
  } catch (error) {
    logger.error('AD user sync error:', error);
    res.status(500).json({ error: 'Failed to sync users from AD' });
  }
});

// Sync groups from AD
router.post('/ad/sync/groups', authenticateToken, async (req, res) => {
  try {
    // Check if user has admin role
    if (req.user.role !== 'platform_admin') {
      return res.status(403).json({ error: 'Admin role required' });
    }

    const callerTenantId = req.user.tid || req.user.tenantId || null;
    if (callerTenantId) {
      return res.status(403).json({ error: 'Platform admin access is restricted to tenantless scope' });
    }

    const groups = await activeDirectoryService.syncGroups();
    
    res.json({
      success: true,
      message: `Synced ${groups.length} groups from Active Directory`,
      groups: groups.slice(0, 100) // Return first 100 groups
    });
  } catch (error) {
    logger.error('AD group sync error:', error);
    res.status(500).json({ error: 'Failed to sync groups from AD' });
  }
});

// Get cached users
router.get('/ad/users', authenticateToken, (req, res) => {
  try {
    const users = activeDirectoryService.getAllCachedUsers();
    
    res.json({
      success: true,
      users
    });
  } catch (error) {
    logger.error('Get cached users error:', error);
    res.status(500).json({ error: 'Failed to get cached users' });
  }
});

// Get cached groups
router.get('/ad/groups', authenticateToken, (req, res) => {
  try {
    const groups = activeDirectoryService.getAllCachedGroups();
    
    res.json({
      success: true,
      groups
    });
  } catch (error) {
    logger.error('Get cached groups error:', error);
    res.status(500).json({ error: 'Failed to get cached groups' });
  }
});

module.exports = router;
