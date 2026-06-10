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

router.post('/login', async (req, res) => {
  try {
    const { username, password, useAD = false } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    let user = null;
    let authResult = null;

    if (useAD && activeDirectoryService.getStatus().isConnected) {
      // Try Active Directory authentication
      try {
        authResult = await activeDirectoryService.authenticateUser(username, password);
        if (authResult.authenticated) {
          const userDetails = await activeDirectoryService.getUserDetails(username);
          // Try to get local user data if AD user exists in local DB (for zoomEnabled/teamsEnabled)
          const localUserData = await getUserByUsername(username);
          // Get settings from local user data if available
          const adSettings = localUserData?.settings || {};
          const adIntercomEnabled = adSettings.intercomEnabled !== undefined ? adSettings.intercomEnabled : true;
          const adDealerboardEnabled = adSettings.dealerboardEnabled !== undefined ? adSettings.dealerboardEnabled : false;
          
          user = {
            id: userDetails.guid,
            username: userDetails.username,
            email: userDetails.email,
            firstName: userDetails.firstName,
            lastName: userDetails.lastName,
            displayName: userDetails.displayName,
            title: userDetails.title,
            department: userDetails.department,
            phone: userDetails.phone,
            role: 'user', // Default role, can be enhanced with AD group mapping
            source: 'active_directory',
            isActive: true,
            zoomEnabled: localUserData ? Boolean(localUserData.zoomEnabled) : false, // Include if exists in local DB
            teamsEnabled: localUserData ? Boolean(localUserData.teamsEnabled) : false, // Include if exists in local DB
            intercomEnabled: adIntercomEnabled,
            dealerboardEnabled: adDealerboardEnabled,
            settings: adSettings
          };
        }
      } catch (error) {
        logger.warn(`AD authentication failed for ${username}:`, error.message);
      }
    }

    if (!user) {
      // Try local authentication
      logger.info(`Attempting local authentication for user: ${username}`);
      const localUser = await getUserByUsername(username);
      if (!localUser) {
        logger.warn(`User not found: ${username}`);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      logger.info(`User found: ${username}, checking password...`);

      if (!localUser.password || typeof localUser.password !== 'string') {
        logger.warn(`Local user ${username} has no password hash; cannot authenticate`);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Verify password hash
      const isValidPassword = await bcrypt.compare(password, localUser.password);
      logger.info(`Password valid: ${isValidPassword}`);
      if (!isValidPassword) {
        logger.warn(`Invalid password for user: ${username}`);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Extract client type settings from settings JSONB
      const settings = localUser.settings || {};
      const intercomEnabled = settings.intercomEnabled !== undefined ? settings.intercomEnabled : true;
      const dealerboardEnabled = settings.dealerboardEnabled !== undefined ? settings.dealerboardEnabled : false;

      user = {
        id: localUser.username, // legacy id for existing clients
        uid: localUser.id,
        username: localUser.username,
        email: localUser.email,
        firstName: localUser.firstName,
        lastName: localUser.lastName,
        displayName: localUser.displayName,
        role: localUser.role,
        source: 'local',
        isActive: localUser.isActive,
        zoomEnabled: Boolean(localUser.zoomEnabled), // Include zoomEnabled
        teamsEnabled: Boolean(localUser.teamsEnabled), // Include teamsEnabled
        intercomEnabled: intercomEnabled,
        dealerboardEnabled: dealerboardEnabled,
        settings: settings,
        tenantId: localUser.tenantId,
        subTenantId: localUser.subTenantId,
        siteId: localUser.siteId
      };
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is disabled' });
    }

    // Legacy role migration: convert bootstrap admin from 'admin' to 'platform_admin'
    if (user.username === 'admin' && user.role === 'admin') {
      try {
        logger.info('Login: Migrating legacy admin role to platform_admin for bootstrap admin user');
        const migrated = await updateUser('admin', { role: 'platform_admin' });
        if (migrated) {
          user = migrated;
          cacheLocalUser(migrated);
        } else {
          user = { ...user, role: 'platform_admin' };
          cacheLocalUser(user);
        }
      } catch (e) {
        logger.warn('Login: Failed to migrate legacy admin role:', e.message);
      }
    }

    const tenantSlug = req.tenantSlug || process.env.DEFAULT_TENANT_SLUG || 'default';

    const presenceTenantId = user.tenantId || process.env.DEFAULT_TENANT_ID || 'tenant-default';
    const presenceSubTenantId = user.subTenantId || process.env.DEFAULT_SUB_TENANT_ID || 'subtenant-default';
    const presenceSiteId = user.siteId || process.env.DEFAULT_SITE_ID || 'site-default';

    const tokenTenantId = user.role === 'platform_admin' ? null : (user.tenantId || null);
    const tokenSubTenantId = user.role === 'platform_admin' ? null : (user.subTenantId || null);
    const tokenSiteId = user.role === 'platform_admin' ? null : (user.siteId || null);
    const uid = user.uid || user.id;
    const sipUri = buildSipUriForUser(uid, tenantSlug);

    // Generate JWT token
    const token = generateToken(user, {
      tenantSlug,
      tenantId: tokenTenantId,
      subTenantId: tokenSubTenantId,
      siteId: tokenSiteId,
      sipUri
    });

    // Store session - use username as the key (since id is now username)
    const sessionKey = user.username || user.id;
    userSessions.set(sessionKey, {
      user: {
        ...user,
        id: user.username || user.id // Ensure id is username
      },
      token,
      loginTime: new Date(),
      lastActivity: new Date()
    });

    // Update last login
    if (user.source === 'local') {
      const localUser = localUsers.get(user.username);
      if (localUser) {
        localUser.lastLogin = new Date();
      }
    }

    logger.info(`User ${username} logged in successfully (source: ${user.source})`);

    // Get intercomEnabled/dealerboardEnabled from user object or settings
    const settings = user.settings || {};
    const finalIntercomEnabled = user.intercomEnabled !== undefined ? user.intercomEnabled : (settings.intercomEnabled !== undefined ? settings.intercomEnabled : true);
    const finalDealerboardEnabled = user.dealerboardEnabled !== undefined ? user.dealerboardEnabled : (settings.dealerboardEnabled !== undefined ? settings.dealerboardEnabled : false);

    const responseData = {
      success: true,
      token,
      user: {
        id: user.username, // Use username as ID
        username: user.username,
        uid,
        sipUri,
        tenantSlug,
        tenantId: presenceTenantId,
        subTenantId: presenceSubTenantId,
        siteId: presenceSiteId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        role: user.role,
        source: user.source,
        zoomEnabled: Boolean(user.zoomEnabled), // Include zoomEnabled
        teamsEnabled: Boolean(user.teamsEnabled), // Include teamsEnabled
        intercomEnabled: finalIntercomEnabled,
        dealerboardEnabled: finalDealerboardEnabled,
        locationId: user.locationId || null
      },
      expiresIn: JWT_EXPIRES_IN
    };

    try {
      const dbUser = await getUserByIdOrUsername(user.username || user.id);
      await routingService.applyRoutingToUserData(responseData.user, dbUser);
    } catch (error) {
      logger.warn('Failed to compute location-based subscriber routing during login:', error.message);
    }

    // Get user's assigned homeserver and region (geographic routing)
    try {
      const orchestratorService = getOrchestratorService();
      if (orchestratorService && orchestratorService.isInitialized) {
        const userRegion = await orchestratorService.getUserRegion(user.id);
        const homeserver = await orchestratorService.getUserHomeserver(user.id);

        responseData.user.matrixHomeserver = {
          id: homeserver.id,
          serverName: homeserver.serverName,
          region: homeserver.region,
          baseUrl: homeserver.baseUrl,
          federationUrl: homeserver.federationUrl,
        };
        responseData.user.region = userRegion;
      }
    } catch (error) {
      logger.warn('Failed to get user homeserver during login:', error.message);
    }

    // Update user status to online in database
    try {
      await updateUserStatus(user.username || user.id, 'online');
      logger.info(`Updated user ${user.username} status to online in database`);
    } catch (error) {
      logger.warn('Failed to update user status to online:', error.message);
    }

    // Emit presence-update event for all clients (including HTTP-only logins)
    if (getIo()) {
      try {
        const tenantRoom = getTenantRoom(presenceTenantId, presenceSubTenantId);
        getIo().to(tenantRoom).emit('presence-update', { 
          userId: user.username || user.id, 
          username: user.username,
          online: true,
          source: 'http-login'
        });
        logger.info(`Emitted presence-update for user ${user.username} (HTTP login)`);
      } catch (error) {
        logger.warn('Failed to emit presence-update during HTTP login:', error.message);
      }
    } else {
      logger.warn('Socket.IO instance not available for presence-update emission');
    }

    res.json(responseData);
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Debug endpoint to list all users
router.get('/debug/users', async (req, res) => {
  try {
    const users = await findUsers({});
    const formattedUsers = users.map(user => ({
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      source: user.source,
      id: user.id,
      email: user.email
    }));
    
    res.json({
      totalUsers: formattedUsers.length,
      users: formattedUsers
    });
  } catch (error) {
    logger.error('Debug users error:', error);
    res.status(500).json({ error: 'Failed to get debug users' });
  }
});

module.exports = router;
