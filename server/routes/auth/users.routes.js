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

function normalizeSettingsFlag(value, defaultValue) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes') return true;
    if (v === 'false' || v === '0' || v === 'no') return false;
  }
  if (typeof value === 'number') return value === 1;
  return Boolean(value);
}

const {
  cacheLocalUser,
  findLocalUserById,
  getUserByUsername,
  userSessions,
  localUsers,
  getIo,
} = sessionStore;

router.get('/users', authenticateToken, async (req, res) => {
  try {
    logger.info(`GET /users - caller ${req.user?.username || req.user?.id} role=${req.user?.role} tid=${req.user?.tid} tenantId=${req.user?.tenantId}`);
    if (req.user.role !== 'platform_admin') {
      return res.status(403).json({ error: 'Platform admin access required' });
    }

    const onlineKeys = collectOnlineKeys(req.app?.locals?.socketHandler);
    const users = await findUsers({});
    const userDbIds = (users || []).map((u) => String(u.id)).filter(Boolean);
    const { intercomDndByUserId, inCallUserIds } = await userPresenceService.loadAdminPresenceMaps(userDbIds);

    const formattedUsers = (users || []).map((user) => {
      const settings = user.settings || {};
      const intercomEnabled = normalizeSettingsFlag(settings.intercomEnabled, true);
      const dealerboardEnabled = normalizeSettingsFlag(settings.dealerboardEnabled, false);

      const isOnline = onlineKeys.has(String(user.username || '')) || onlineKeys.has(String(user.id || ''));
      const prefIntercomDnd = intercomDndByUserId.get(String(user.id)) === true;
      const settingsDnd = Boolean(settings.dnd);
      const intercomDnd = settingsDnd || prefIntercomDnd;
      const isInIntercomCall = inCallUserIds.has(String(user.id));

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
        intercomDnd,
        isInIntercomCall,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        tenantId: user.tenantId,
        subTenantId: user.subTenantId,
        siteId: user.siteId,
      };
    });

    res.json({
      success: true,
      users: formattedUsers,
      total: formattedUsers.length,
    });
  } catch (error) {
    logger.error('List users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Create user (platform admin only, tenantless scope)
async function handlePlatformAdminCreateUser(req, res) {
  try {
    if (req.user.role !== 'platform_admin') {
      return res.status(403).json({ error: 'Platform admin access required' });
    }

    const callerTenantId = req.user.tid || req.user.tenantId || null;
    if (callerTenantId) {
      return res.status(403).json({ error: 'Platform admin access is restricted to tenantless scope' });
    }

    const {
      username,
      email,
      firstName,
      lastName,
      password,
      role,
      isActive,
      extension,
      sipUri,
      employeeId,
      department,
      companyName,
      country,
      intercomEnabled,
      dealerboardEnabled,
    } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Missing required fields: username, password' });
    }

    const existing = await findUsers({ username });
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Normalize/validate role.
    // Backward compatibility: treat legacy 'admin' as 'platform_admin'.
    const normalizedRoleRaw = (role || 'user').toString().trim();
    const normalizedRole = normalizedRoleRaw === 'admin' ? 'platform_admin' : normalizedRoleRaw;
    const allowedRoles = new Set(['user', 'trader', 'tenant_admin', 'platform_admin']);
    if (!allowedRoles.has(normalizedRole)) {
      return res.status(400).json({ error: `Invalid role: ${normalizedRole}` });
    }

    const settings = {
      intercomEnabled: intercomEnabled !== undefined ? Boolean(intercomEnabled) : true,
      dealerboardEnabled: dealerboardEnabled !== undefined ? Boolean(dealerboardEnabled) : false,
    };

    const now = new Date();
    const newUser = {
      id: `user-${Date.now()}`,
      username,
      email: email || null,
      firstName: firstName || null,
      lastName: lastName || null,
      displayName: `${firstName || ''} ${lastName || ''}`.trim() || username,
      password: hashedPassword,
      role: normalizedRole,
      isActive: isActive !== undefined ? isActive : true,
      source: 'local',
      extension: extension || null,
      sipUri: sipUri || null,
      employeeId: employeeId || null,
      department: department || null,
      companyName: companyName || null,
      country: country || null,
      tenantId: null,
      subTenantId: null,
      siteId: null,
      settings,
      createdAt: now,
      updatedAt: now,
      lastLogin: null,
    };

    const created = await createUser(newUser);

    return res.status(201).json({
      success: true,
      user: {
        id: created.username || created.id,
        userId: created.id,
        username: created.username,
        email: created.email,
        firstName: created.firstName,
        lastName: created.lastName,
        displayName: created.displayName,
        role: created.role,
        isActive: created.isActive,
        extension: created.extension,
        sipUri: created.sipUri,
        employeeId: created.employeeId,
        department: created.department,
        companyName: created.companyName,
        country: created.country,
        tenantId: created.tenantId,
        subTenantId: created.subTenantId,
        siteId: created.siteId,
        intercomEnabled: settings.intercomEnabled,
        dealerboardEnabled: settings.dealerboardEnabled,
        source: created.source,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      }
    });
  } catch (error) {
    logger.error('Create user error:', error);
    if (error && (error.code === '23505' || error.code === 23505)) {
      return res.status(409).json({ error: 'User already exists' });
    }
    return res.status(500).json({ error: 'Failed to create user' });
  }
}

router.post('/users', authenticateToken, handlePlatformAdminCreateUser);
// Backward compatible endpoint used by some admin UI components
router.post('/register', authenticateToken, handlePlatformAdminCreateUser);

// Get user by ID (for settings)
router.get('/users/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params; // Can be either ID or username
    
    logger.info(`GET /users/${userId} - Request from user: ${req.user.username} (ID: ${req.user.id})`);
    
    // Get user by ID or username
    let targetUser;
    try {
      targetUser = await getUserByIdOrUsername(userId);
    } catch (error) {
      logger.error(`Error fetching user ${userId}:`, error);
      logger.error('Error stack:', error.stack);
      return res.status(500).json({ error: 'Failed to fetch user', details: error.message });
    }
    
    if (!targetUser) {
      logger.warn(`User not found: ${userId}`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    logger.info(`User found: ${targetUser.username} (ID: ${targetUser.id})`);
    
    // Users can only view their own settings, admins can view any user
    // Check by both ID and username to support both formats
    const isOwnProfile = (req.user.id === targetUser.id || req.user.id === userId) || 
                         (req.user.username === targetUser.username || req.user.username === userId);
    if (!isOwnProfile && req.user.role !== 'platform_admin') {
      logger.warn(`Access denied: ${req.user.username} trying to access ${userId}`);
      return res.status(403).json({ error: 'Access denied' });
    }

    const user = targetUser;

    // Convert zoomEnabled and teamsEnabled to proper booleans
    // mapUserRow already converts to boolean, so we just need to ensure it's a proper boolean
    // Ensure we always return a boolean, never undefined
    const zoomEnabled = user.zoomEnabled != null ? Boolean(user.zoomEnabled === true || user.zoomEnabled === 1 || user.zoomEnabled === 'true' || user.zoomEnabled === '1') : false;
    const teamsEnabled = user.teamsEnabled != null ? Boolean(user.teamsEnabled === true || user.teamsEnabled === 1 || user.teamsEnabled === 'true' || user.teamsEnabled === '1') : false;
    
    logger.info(`GET /users/${userId} - zoomEnabled: ${zoomEnabled} (from ${JSON.stringify(user.zoomEnabled)}, type: ${typeof user.zoomEnabled}), teamsEnabled: ${teamsEnabled} (from ${JSON.stringify(user.teamsEnabled)}, type: ${typeof user.teamsEnabled})`);

    // Extract client type settings from user.settings
    const settings = user.settings || {};
    const intercomEnabled = normalizeSettingsFlag(settings.intercomEnabled, true);
    const dealerboardEnabled = normalizeSettingsFlag(settings.dealerboardEnabled, false);

    res.json({
      success: true,
      user: {
        id: user.username || user.id, // Use username as ID
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        role: user.role,
        settings: user.settings || {},
        isActive: user.isActive,
        zoomEnabled: zoomEnabled,
        teamsEnabled: teamsEnabled,
        intercomEnabled: intercomEnabled,
        dealerboardEnabled: dealerboardEnabled
      }
    });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user info',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Admin reset user password
router.post('/users/:userId/reset-password', authenticateToken, async (req, res) => {
  try {
    // Only admins can reset passwords
    if (req.user.role !== 'platform_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const callerTenantId = req.user.tid || req.user.tenantId || null;
    if (callerTenantId) {
      return res.status(403).json({ error: 'Platform admin access is restricted to tenantless scope' });
    }

    const { userId } = req.params;
    const { newPassword, temporaryPassword } = req.body;

    // Validate password is provided
    const passwordToSet = newPassword || temporaryPassword;
    if (!passwordToSet || passwordToSet.trim().length < 6) {
      return res.status(400).json({ 
        error: 'Password is required and must be at least 6 characters long' 
      });
    }

    // Get user to verify they exist
    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.tenantId) {
      return res.status(403).json({ error: 'Platform admin may only manage tenantless users' });
    }

    // Only reset passwords for local users
    if (user.source !== 'local') {
      return res.status(400).json({ 
        error: 'Cannot reset password for non-local users (Active Directory, etc.)' 
      });
    }

    // Hash the new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(passwordToSet, saltRounds);

    // Update user password
    await updateUser(user.id, { password: hashedPassword });

    // Clear user from cache to force reload
    localUsers.delete(user.username);

    logger.info(`Password reset for user ${user.username} by admin ${req.user.username}`);

    res.json({
      success: true,
      message: 'Password reset successfully',
      temporaryPassword: temporaryPassword ? passwordToSet : undefined // Only return if it was a temporary password
    });
  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Update user (admin only)
router.put('/users/:userId', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'platform_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const rawUserId = req.params.userId;
    const userId = rawUserId ? String(rawUserId).trim() : rawUserId;
    const { username, firstName, lastName, email, role, isActive, extension, sipUri, employeeId, department, companyName, country, password, zoomEnabled, teamsEnabled, intercomEnabled, dealerboardEnabled, locationId } = req.body;

    // Validate required fields
    if (!username || !firstName || !lastName || !email) {
      return res.status(400).json({ error: 'Username, first name, last name, and email are required' });
    }

    // Find user via cache/DB
    let localUser = findLocalUserById(userId);
    if (!localUser) {
      try {
        localUser = await getUserById(userId);
        if (localUser) {
          cacheLocalUser(localUser);
        }
      } catch (error) {
        logger.warn('Failed to fetch user from database:', error.message);
      }
    }

    // Some admin UI components historically send username (or legacy id) rather than DB id.
    // Fall back to the unified lookup helper so we don't incorrectly 404.
    if (!localUser) {
      try {
        localUser = await getUserByIdOrUsername(userId);
        if (localUser) {
          cacheLocalUser(localUser);
        }
      } catch (error) {
        logger.warn('Failed to fetch user from database (getUserByIdOrUsername fallback):', error.message);
      }
    }
    
    if (!localUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user data
    const updatedUser = {
      ...localUser,
      username,
      firstName,
      lastName,
      email,
      displayName: `${firstName} ${lastName}`,
      role: role || localUser.role,
      isActive: isActive !== undefined ? isActive : localUser.isActive,
      extension: extension !== undefined ? extension : localUser.extension,
      sipUri: sipUri !== undefined ? sipUri : localUser.sipUri,
      employeeId: employeeId !== undefined ? employeeId : localUser.employeeId,
      department: department !== undefined ? department : localUser.department,
      updatedAt: new Date()
    };

    // Update in database
    const updateData = {
      username,
      firstName,
      lastName,
      email,
      displayName: `${firstName} ${lastName}`,
      role: role || localUser.role,
      isActive: isActive !== undefined ? isActive : localUser.isActive,
      updatedAt: new Date()
    };

    // Add optional fields if provided
    if (extension !== undefined) updateData.extension = extension;
    if (sipUri !== undefined) updateData.sipUri = sipUri;
    if (employeeId !== undefined) updateData.employeeId = employeeId;
    if (department !== undefined) updateData.department = department;
    if (locationId !== undefined) updateData.locationId = locationId === null ? null : String(locationId);
    if (companyName !== undefined) updateData.companyName = companyName;
    if (country !== undefined) updateData.country = country;

    // Handle intercomEnabled and dealerboardEnabled (stored in settings JSONB)
    if (intercomEnabled !== undefined && intercomEnabled !== null) {
      const currentSettings = localUser.settings || {};
      updateData.settings = updateData.settings || currentSettings;
      updateData.settings.intercomEnabled = Boolean(intercomEnabled === true || intercomEnabled === 'true' || intercomEnabled === 1);
      logger.info(`Setting intercomEnabled to ${updateData.settings.intercomEnabled} for user ${userId}`);
    }

    if (dealerboardEnabled !== undefined && dealerboardEnabled !== null) {
      const currentSettings = updateData.settings || localUser.settings || {};
      updateData.settings = updateData.settings || currentSettings;
      updateData.settings.dealerboardEnabled = Boolean(dealerboardEnabled === true || dealerboardEnabled === 'true' || dealerboardEnabled === 1);
      logger.info(`Setting dealerboardEnabled to ${updateData.settings.dealerboardEnabled} for user ${userId}`);
    }
    
    // Handle zoomEnabled and teamsEnabled - always include if provided (including false)
    // This ensures the checkbox state is properly saved
    if (zoomEnabled !== undefined && zoomEnabled !== null) {
      // Convert to boolean - explicitly handle all cases including false
      let boolValue;
      if (zoomEnabled === true || zoomEnabled === 'true' || zoomEnabled === 1 || zoomEnabled === '1') {
        boolValue = true;
      } else if (zoomEnabled === false || zoomEnabled === 'false' || zoomEnabled === 0 || zoomEnabled === '0') {
        boolValue = false;
      } else {
        // Default to false for any other value
        boolValue = false;
      }
      updateData.zoomEnabled = boolValue;
      logger.info(`Setting zoomEnabled to ${updateData.zoomEnabled} (from ${JSON.stringify(zoomEnabled)}, type: ${typeof zoomEnabled}) for user ${userId}`);
    } else {
      // If not provided, don't update it (keep existing value)
      logger.info(`zoomEnabled not provided in request for user ${userId}, keeping existing value`);
    }
    
    if (teamsEnabled !== undefined && teamsEnabled !== null) {
      // Convert to boolean - explicitly handle all cases including false
      let boolValue;
      if (teamsEnabled === true || teamsEnabled === 'true' || teamsEnabled === 1 || teamsEnabled === '1') {
        boolValue = true;
      } else if (teamsEnabled === false || teamsEnabled === 'false' || teamsEnabled === 0 || teamsEnabled === '0') {
        boolValue = false;
      } else {
        // Default to false for any other value
        boolValue = false;
      }
      updateData.teamsEnabled = boolValue;
      logger.info(`Setting teamsEnabled to ${updateData.teamsEnabled} (from ${JSON.stringify(teamsEnabled)}, type: ${typeof teamsEnabled}) for user ${userId}`);
    } else {
      // If not provided, don't update it (keep existing value)
      logger.info(`teamsEnabled not provided in request for user ${userId}, keeping existing value`);
    }
    
    if (password) updateData.password = password;
    
    logger.info(`Final updateData for user ${userId}:`, JSON.stringify(updateData, null, 2));

    logger.info(`Calling updateUser for ${userId} with updateData:`, JSON.stringify(updateData, null, 2));
    const updatedRecord = await updateUser(userId, updateData);
    logger.info(`updateUser returned zoomEnabled: ${updatedRecord.zoomEnabled} (type: ${typeof updatedRecord.zoomEnabled}), teamsEnabled: ${updatedRecord.teamsEnabled} (type: ${typeof updatedRecord.teamsEnabled})`);

    // Update cache (handle username change)
    if (localUser.username && localUser.username !== updatedRecord.username) {
      localUsers.delete(localUser.username);
    }
    cacheLocalUser(updatedRecord);

    // Notify user via socket if they're online
    try {
      const socketHandler = req.app.locals?.socketHandler;
      if (socketHandler && socketHandler.getSocketsByUserId) {
        // Get user to find username for socket lookup
        const user = await getUserById(userId);
        const username = user?.username || userId;
        
        const userSockets = socketHandler.getSocketsByUserId(username); // Use username for lookup
        for (const userSocket of userSockets) {
          userSocket.emit('profile-updated', {
            userId,
            username, // Include username in event
            updatedBy: req.user.username,
            message: 'Your profile has been updated. Click "Update now" to see the changes.',
            timestamp: new Date().toISOString()
          });
        }
        if (userSockets.length > 0) {
          logger.info(`Profile update notification sent to user ${username} (${userSockets.length} socket(s))`);
        }
      }
    } catch (error) {
      logger.warn('Failed to send profile update notification:', error.message);
      // Don't fail the request if notification fails
    }

    // Persist notification so Dealerboard/clients can show it even if user is offline.
    try {
      const { createUserNotification, getUserById } = require('../services/databaseService');
      const user = await getUserById(userId);
      const notifyUserId = String(user?.username || userId);
      await createUserNotification({
        id: `profile_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId: notifyUserId,
        type: 'profile-updated',
        title: 'Profile updated',
        message: 'Your profile has been updated. Please log off and log on again to see the changes.',
        metadata: {
          severity: 'high',
          color: 'red',
          updatedBy: req.user.username,
        },
      });
    } catch (error) {
      logger.warn('Failed to persist profile update notification:', error.message);
    }

    logger.info(`User ${userId} updated by admin ${req.user.username}`);

    const settings = updatedRecord.settings || {};
    const finalIntercomEnabled = normalizeSettingsFlag(settings.intercomEnabled, true);
    const finalDealerboardEnabled = normalizeSettingsFlag(settings.dealerboardEnabled, false);

    res.json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: updatedRecord.username || updatedRecord.id, // Use username as ID
        username: updatedRecord.username,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        displayName: updatedUser.displayName,
        role: updatedRecord.role,
        isActive: updatedRecord.isActive,
        extension: updatedRecord.extension,
        sipUri: updatedRecord.sipUri,
        employeeId: updatedRecord.employeeId,
        department: updatedRecord.department,
        locationId: updatedRecord.locationId,
        companyName: updatedRecord.companyName,
        country: updatedRecord.country,
        zoomEnabled: Boolean(updatedRecord.zoomEnabled),
        teamsEnabled: Boolean(updatedRecord.teamsEnabled),
        intercomEnabled: finalIntercomEnabled,
        dealerboardEnabled: finalDealerboardEnabled,
        source: updatedRecord.source,
        createdAt: updatedRecord.createdAt,
        updatedAt: updatedRecord.updatedAt
      }
    });
  } catch (error) {
    logger.error('User update error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user (admin only)
router.delete('/users/:userId', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'platform_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const callerTenantId = req.user.tid || req.user.tenantId || null;
    if (callerTenantId) {
      return res.status(403).json({ error: 'Platform admin access is restricted to tenantless scope' });
    }

    const { userId } = req.params;

    const sessionUserId = req.user.username || req.user.id;

    // Prevent admin from deleting themselves
    if (userId === req.user.id || userId === req.user.username || userId === sessionUserId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Find user in cache/DB (userId can be either username or DB id)
    let localUser = findLocalUserById(userId);
    if (!localUser) {
      localUser = localUsers.get(userId);
    }
    if (!localUser) {
      try {
        localUser = await getUserByIdOrUsername(userId);
        if (localUser) {
          cacheLocalUser(localUser);
        }
      } catch (error) {
        logger.warn('Failed to fetch user from database:', error.message);
      }
    }
    
    if (!localUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove from local storage (delete by username key)
    localUsers.delete(localUser.username);

    // Remove from database
    await deleteUser(localUser.id || localUser.username || userId);

    logger.info(`User ${userId} (${localUser.username}) deleted by admin ${req.user.username}`);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    logger.error('User deletion error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Search users (AD integration)
router.get('/users/search', authenticateToken, async (req, res) => {
  try {
    const { q, limit = 50 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    let users = [];

    // Search in AD if connected
    if (activeDirectoryService.getStatus().isConnected) {
      try {
        const adUsers = await activeDirectoryService.searchUsers(q, parseInt(limit));
        users = adUsers.map(user => ({
          id: user.guid,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: user.displayName,
          title: user.title,
          department: user.department,
          source: 'active_directory'
        }));
      } catch (error) {
        logger.error('AD user search failed:', error);
      }
    }

    // Also search database users (covers all local accounts, not just in-memory cache).
    try {
      const dbUsers = await findUsers({});
      const qLower = String(q).toLowerCase();
      const dbMatches = (dbUsers || [])
        .filter((user) => {
          const haystack = [
            user.username,
            user.email,
            user.displayName,
            user.firstName,
            user.lastName,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(qLower);
        })
        .map((user) => ({
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: user.displayName,
          role: user.role,
          source: user.source || 'local',
        }));

      const seen = new Set(users.map((u) => String(u.id || u.username || '')));
      for (const user of dbMatches) {
        const key = String(user.id || user.username || '');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        users.push(user);
      }
    } catch (error) {
      logger.warn('Database user search failed:', error?.message || error);
    }

    // Also search local users
    const localUsersList = Array.from(localUsers.values())
      .filter(user => 
        user.username.toLowerCase().includes(q.toLowerCase()) ||
        user.email.toLowerCase().includes(q.toLowerCase()) ||
        user.displayName.toLowerCase().includes(q.toLowerCase())
      )
      .map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        role: user.role,
        source: 'local'
      }));

    users = [...users, ...localUsersList];

    res.json({
      success: true,
      users: users.slice(0, parseInt(limit)),
      total: users.length
    });
  } catch (error) {
    logger.error('User search error:', error);
    res.status(500).json({ error: 'User search failed' });
  }
});

// Get user groups (AD integration)
router.get('/users/:username/groups', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;

    let groups = [];

    // Get groups from AD if connected
    if (activeDirectoryService.getStatus().isConnected) {
      try {
        const adGroups = await activeDirectoryService.getUserGroups(username);
        groups = adGroups.map(group => ({
          id: group.guid,
          name: group.name,
          description: group.description,
          source: 'active_directory'
        }));
      } catch (error) {
        logger.error('AD group lookup failed:', error);
      }
    }

    res.json({
      success: true,
      groups
    });
  } catch (error) {
    logger.error('Get user groups error:', error);
    res.status(500).json({ error: 'Failed to get user groups' });
  }
});

module.exports = router;
