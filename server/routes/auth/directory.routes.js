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

router.get('/directory', authenticateToken, async (req, res) => {
  try {
    const isPlatformAdmin = req.user?.role === 'platform_admin';
    const callerTenantId = isPlatformAdmin
      ? null
      : (req.user.tid || req.user.tenantId || null);
    const defaultTenantId = process.env.DEFAULT_TENANT_ID || 'tenant-default';
    const directoryAllUsers = process.env.INTERCOM_DIRECTORY_ALL_USERS !== 'false';

    const onlineKeys = collectOnlineKeys(req.app?.locals?.socketHandler);

    let users = [];
    if (directoryAllUsers || isPlatformAdmin) {
      users = await findUsers({ isActive: true });
    } else if (callerTenantId) {
      const tenantUsers = await findUsers({ tenantId: callerTenantId });
      const tenantlessUsers = await findUsers({ tenantId: null });

      const userMap = new Map();
      for (const u of [...(tenantUsers || []), ...(tenantlessUsers || [])]) {
        userMap.set(u.id, u);
      }
      users = Array.from(userMap.values());
    } else if (isPlatformAdmin) {
      users = await findUsers({});
    } else {
      const tenantlessUsers = await findUsers({ tenantId: null });
      const defaultTenantUsers = defaultTenantId ? await findUsers({ tenantId: defaultTenantId }) : [];

      const userMap = new Map();
      for (const u of [...(tenantlessUsers || []), ...(defaultTenantUsers || [])]) {
        userMap.set(u.id, u);
      }
      users = Array.from(userMap.values());
    }

    // Directory is for intercom calling — omit users without intercom access.
    users = (users || []).filter((user) => {
      const settings = user.settings || {};
      return settings.intercomEnabled !== false;
    });

    const formattedUsers = (users || []).map(user => {
      const settings = user.settings || {};
      const intercomEnabled = settings.intercomEnabled !== undefined ? settings.intercomEnabled : true;
      const dealerboardEnabled = settings.dealerboardEnabled !== undefined ? settings.dealerboardEnabled : false;
      const isOnline = onlineKeys.has(String(user.username || '')) || onlineKeys.has(String(user.id || ''));

      return {
        id: user.username || user.id,
        userId: user.id,
        username: user.username,
        email: user.email,
        name: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        role: user.role,
        isActive: user.isActive,
        extension: user.extension,
        sipUri: user.sipUri,
        employeeId: user.employeeId,
        department: user.department,
        locationId: user.locationId,
        source: user.source,
        isOnline,
        status: isOnline ? 'online' : 'offline',
        zoomEnabled: Boolean(user.zoomEnabled),
        teamsEnabled: Boolean(user.teamsEnabled),
        intercomEnabled,
        dealerboardEnabled,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        tenantId: user.tenantId,
        subTenantId: user.subTenantId,
        siteId: user.siteId
      };
    });

    res.json({
      success: true,
      users: formattedUsers,
      total: formattedUsers.length
    });
  } catch (error) {
    logger.error('Directory listing error:', error);
    res.status(500).json({ error: 'Failed to list directory users' });
  }
});

module.exports = router;
