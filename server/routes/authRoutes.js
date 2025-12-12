const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { activeDirectoryService } = require('../services/activeDirectoryService');
const { groupService } = require('../services/groupService');
const { createUser, findUsers, updateUser, deleteUser, getUserById, getUserByIdOrUsername, updateUserStatus } = require('../services/databaseService');
const { getOrchestratorService } = require('../services/orchestratorService');
const logger = require('../utils/logger');

// Socket.IO instance - will be set by setupRoutes
let ioInstance = null;
function setSocketIO(io) {
  ioInstance = io;
  logger.info('Socket.IO instance set for authRoutes');
}

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Local user cache (backed by Postgres)
const localUsers = new Map();
const userSessions = new Map();

function cacheLocalUser(user) {
  if (!user || !user.username) {
    return;
  }

  localUsers.set(user.username, {
    ...user,
    createdAt: user.createdAt || new Date(),
    updatedAt: user.updatedAt || new Date(),
  });
}

function findLocalUserById(userId) {
  for (const user of localUsers.values()) {
    if (user.id === userId) {
      return user;
    }
  }
  return null;
}

async function getUserByUsername(username) {
  if (!username) return null;

  let user = localUsers.get(username);
  if (user) {
    return user;
  }

  const users = await findUsers({ username });
  if (users && users.length > 0) {
    cacheLocalUser(users[0]);
    return users[0];
  }

  return null;
}

// Sync users from database to localUsers Map
async function syncUsersToLocalStorage() {
  try {
    const users = await findUsers({});
    users.forEach(user => {
      if (user.source === 'local') {
        cacheLocalUser(user);
      }
    });
    logger.info(`Synced ${users.length} users to local storage`);
  } catch (error) {
    logger.warn('Failed to sync users to local storage (this is normal if database is not ready):', error.message);
    // Don't throw error, just log warning - the system can work without this sync
  }
}

// Initialize with some default users
// Generate proper bcrypt hashes
const adminPasswordHash = bcrypt.hashSync('admin', 10);
const traderPasswordHash = bcrypt.hashSync('trader123', 10);

const defaultUsers = [
  {
    id: 'admin-001',
    username: 'admin',
    email: 'admin@trading-intercom.com',
    firstName: 'Admin',
    lastName: 'User',
    displayName: 'Administrator',
    password: adminPasswordHash,
    role: 'admin',
    isActive: true,
    source: 'local',
    createdAt: new Date(),
    lastLogin: null
  },
  {
    id: 'trader-001',
    username: 'trader1',
    email: 'trader1@trading-intercom.com',
    firstName: 'Test',
    lastName: 'Trader',
    displayName: 'Test Trader',
    password: traderPasswordHash,
    role: 'user',
    isActive: true,
    source: 'local',
    createdAt: new Date(),
    lastLogin: null
  }
];

defaultUsers.forEach(cacheLocalUser);

async function ensureDefaultUsers() {
  try {
    for (const user of defaultUsers) {
      const existing = await findUsers({ username: user.username });
      if (!existing || existing.length === 0) {
        logger.info(`Creating default user ${user.username} in Postgres`);
        await createUser(user);
        cacheLocalUser(user);
      } else {
        cacheLocalUser(existing[0]);
      }
    }
  } catch (error) {
    logger.error('Failed to ensure default users exist in Postgres:', error);
  }
}

// Sync existing users from database (non-blocking)
setTimeout(() => {
  syncUsersToLocalStorage().catch(() => {
    // Ignore errors - sync is optional
  });
}, 2000); // Wait 2 seconds for database to be ready
ensureDefaultUsers().catch(() => {});

// Generate JWT token
const generateToken = (user) => {
  // Use username as ID to ensure username and userId are the same
  const userId = user.username || user.id;
  return jwt.sign(
    {
      id: userId, // Use username as ID
      username: user.username,
      email: user.email,
      role: user.role,
      source: user.source
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Middleware to authenticate requests
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
};

// Login with username/password
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
        id: localUser.username, // Use username as ID
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
        settings: settings
      };
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is disabled' });
    }

    // Generate JWT token
    const token = generateToken(user);

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
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        role: user.role,
        source: user.source,
        zoomEnabled: Boolean(user.zoomEnabled), // Include zoomEnabled
        teamsEnabled: Boolean(user.teamsEnabled), // Include teamsEnabled
        intercomEnabled: finalIntercomEnabled,
        dealerboardEnabled: finalDealerboardEnabled
      },
      expiresIn: JWT_EXPIRES_IN
    };

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
          federationUrl: homeserver.federationUrl
        };
        responseData.user.region = userRegion;
      }
    } catch (error) {
      logger.warn('Failed to get user homeserver during login:', error.message);
      // Don't fail login if orchestrator is not available
    }

    // Update user status to online in database
    try {
      await updateUserStatus(user.username || user.id, 'online');
      logger.info(`Updated user ${user.username} status to online in database`);
    } catch (error) {
      logger.warn('Failed to update user status to online:', error.message);
    }

    // Emit presence-update event for all clients (including HTTP-only logins)
    if (ioInstance) {
      try {
        ioInstance.emit('presence-update', { 
          userId: user.username || user.id, 
          username: user.username, 
          online: true,
          status: 'online'
        });
        logger.info(`Emitted presence-update for user ${user.username} (HTTP login)`);
      } catch (error) {
        logger.warn('Failed to emit presence-update on login:', error.message);
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

// Logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.username || req.user.id;
    
    // Update user status to offline in database
    try {
      await updateUserStatus(userId, 'offline');
      logger.info(`Updated user ${userId} status to offline in database`);
    } catch (error) {
      logger.warn('Failed to update user status to offline:', error.message);
    }

    // Emit presence-update event for all clients
    if (ioInstance) {
      try {
        ioInstance.emit('presence-update', { 
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
      teamsEnabled: dbUser?.teamsEnabled || false
    };

    // Get user's assigned homeserver (geographic routing)
    try {
      const orchestratorService = getOrchestratorService();
      if (orchestratorService && orchestratorService.isInitialized) {
        const userRegion = await orchestratorService.getUserRegion(req.user.id);
        const homeserver = await orchestratorService.getUserHomeserver(req.user.id);
        
        userData.matrixHomeserver = {
          id: homeserver.id,
          serverName: homeserver.serverName,
          region: homeserver.region,
          baseUrl: homeserver.baseUrl,
          federationUrl: homeserver.federationUrl
        };
        userData.region = userRegion;
      }
    } catch (error) {
      logger.warn('Failed to get user homeserver:', error.message);
      // Don't fail the request if orchestrator is not available
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
    if (!isOwnProfile && req.user.role !== 'admin') {
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
    const intercomEnabled = settings.intercomEnabled !== undefined ? settings.intercomEnabled : true;
    const dealerboardEnabled = settings.dealerboardEnabled !== undefined ? settings.dealerboardEnabled : false;

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
    logger.error('Error stack:', error.stack);
    logger.error('Error details:', {
      message: error.message,
      userId: req.params.userId,
      reqUser: req.user
    });
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
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
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
    await updateUser(userId, {
      password: hashedPassword
    });

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

// Update user settings
router.put('/users/:userId/settings', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params; // Can be either ID or username
    const { settings, zoomEnabled, teamsEnabled } = req.body;
    
    logger.info(`Updating user settings for ${userId}`, {
      hasSettings: !!settings,
      zoomEnabled,
      teamsEnabled,
      body: req.body
    });
    
    // Get user by ID or username
    const targetUser = await getUserByIdOrUsername(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Users can only update their own settings, admins can update any user
    // Check by both ID and username to support both formats
    const isOwnProfile = (req.user.id === targetUser.id || req.user.id === userId) || 
                         (req.user.username === targetUser.username || req.user.username === userId);
    if (!isOwnProfile && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get current user to merge settings
    const currentUser = targetUser;

    // Prepare update object
    const updateData = {};

    // Handle zoomConfig if provided
    if (req.body.zoomConfig) {
      // Get current zoomConfig or initialize empty object
      const currentZoomConfig = currentUser.zoomConfig || {};
      // Merge with new zoomConfig
      const updatedZoomConfig = {
        ...currentZoomConfig,
        ...req.body.zoomConfig
      };
      updateData.zoomConfig = updatedZoomConfig;
      logger.info(`Updating zoomConfig for ${userId}`, { zoomConfig: updatedZoomConfig });
    }

    // Update settings if provided
    if (settings && typeof settings === 'object') {
      const currentSettings = currentUser.settings || {};
      updateData.settings = {
        ...currentSettings,
        ...settings
      };
    }

    // Handle intercomEnabled and dealerboardEnabled (stored in settings JSONB)
    if (req.body.intercomEnabled !== undefined && req.body.intercomEnabled !== null) {
      const currentSettings = currentUser.settings || {};
      updateData.settings = updateData.settings || currentSettings;
      updateData.settings.intercomEnabled = Boolean(req.body.intercomEnabled === true || req.body.intercomEnabled === 'true' || req.body.intercomEnabled === 1);
      logger.info(`Setting intercomEnabled to ${updateData.settings.intercomEnabled} for user ${userId}`);
    }

    if (req.body.dealerboardEnabled !== undefined && req.body.dealerboardEnabled !== null) {
      const currentSettings = updateData.settings || currentUser.settings || {};
      updateData.settings = updateData.settings || currentSettings;
      updateData.settings.dealerboardEnabled = Boolean(req.body.dealerboardEnabled === true || req.body.dealerboardEnabled === 'true' || req.body.dealerboardEnabled === 1);
      logger.info(`Setting dealerboardEnabled to ${updateData.settings.dealerboardEnabled} for user ${userId}`);
    }

    // Update zoomEnabled if provided (top-level field, not in settings)
    // Always update if provided, including false values
    if (zoomEnabled !== undefined && zoomEnabled !== null) {
      // Convert to boolean - handle true, 'true', 1, '1', false, 'false', 0, '0'
      const boolValue = zoomEnabled === true || zoomEnabled === 'true' || zoomEnabled === 1 || zoomEnabled === '1';
      updateData.zoomEnabled = boolValue;
      logger.info(`Setting zoomEnabled to ${updateData.zoomEnabled} (from ${JSON.stringify(zoomEnabled)}) for user ${userId}`);
    }

    // Update teamsEnabled if provided (top-level field, not in settings)
    if (teamsEnabled !== undefined && teamsEnabled !== null) {
      const boolValue = teamsEnabled === true || teamsEnabled === 'true' || teamsEnabled === 1 || teamsEnabled === '1';
      updateData.teamsEnabled = boolValue;
      logger.info(`Setting teamsEnabled to ${updateData.teamsEnabled} (from ${JSON.stringify(teamsEnabled)}) for user ${userId}`);
    }

    logger.info(`Updating user ${userId} with data:`, updateData);

    // Update user in database - updateUser now accepts username or ID
    // Pass the identifier (username) since updateUser will look up the actual DB ID
    const updatedUser = await updateUser(userId, updateData);

    logger.info(`User settings updated for ${userId} by ${req.user.username}`, {
      zoomEnabled: updatedUser.zoomEnabled,
      teamsEnabled: updatedUser.teamsEnabled
    });

    res.json({
      success: true,
      message: 'Settings updated successfully',
      user: {
        id: updatedUser.username || updatedUser.id, // Use username as ID
        username: updatedUser.username,
        settings: updatedUser.settings,
        zoomEnabled: updatedUser.zoomEnabled,
        teamsEnabled: updatedUser.teamsEnabled
      }
    });
  } catch (error) {
    logger.error('Update user settings error:', error);
    logger.error('Error stack:', error.stack);
    logger.error('Error details:', {
      message: error.message,
      userId: req.params.userId,
      body: req.body,
      updateData: typeof updateData !== 'undefined' ? updateData : 'not defined'
    });
    res.status(500).json({ 
      error: 'Failed to update settings',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Refresh token
router.post('/refresh', authenticateToken, (req, res) => {
  try {
    const session = userSessions.get(req.user.id);
    if (!session) {
      return res.status(401).json({ error: 'Session not found' });
    }

    // Generate new token
    const newToken = generateToken(session.user);
    
    // Update session
    session.token = newToken;
    session.lastActivity = new Date();

    res.json({
      success: true,
      token: newToken,
      user: session.user,
      expiresIn: JWT_EXPIRES_IN
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Register new user (admin only)
router.post('/register', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { username, email, firstName, lastName, password, role = 'trader', extension, sipUri, employeeId, department } = req.body;

    // Validate required fields
    if (!username || !email || !firstName || !lastName || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await getUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = {
      id: `user-${Date.now()}`,
      username,
      email,
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`,
      password: hashedPassword,
      role,
      isActive: true,
      source: 'local',
      extension: extension || null,
      sipUri: sipUri || null,
      employeeId: employeeId || null,
      department: department || null,
      createdAt: new Date(),
      lastLogin: null
    };

    // Store user in database
    const createdUser = await createUser(newUser);

    // Also store in local cache for updates
    cacheLocalUser(createdUser);

    // Debug: Log current users
    logger.info(`New user registered: ${username} (${role})`);
    logger.info(`User created with ID: ${createdUser.id}`);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: createdUser.id,
        username: createdUser.username,
        email: createdUser.email,
        firstName: createdUser.firstName,
        lastName: createdUser.lastName,
        displayName: createdUser.displayName,
        role: createdUser.role,
        isActive: createdUser.isActive,
        extension: createdUser.extension,
        sipUri: createdUser.sipUri,
        employeeId: createdUser.employeeId,
        department: createdUser.department,
        source: createdUser.source,
        createdAt: createdUser.createdAt
      }
    });
  } catch (error) {
    logger.error('User registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// List all users (admin only) or contacts (all users)
router.get('/users', authenticateToken, async (req, res) => {
  try {
    logger.info(`Users endpoint called by user: ${req.user.username}, role: ${req.user.role}`);
    
    const isAdmin = req.user.role === 'admin';

    const users = await findUsers({});
    
    // Filter users - admins see all, regular users see only active users
    const filteredUsers = isAdmin ? users : users.filter(u => u.isActive);

    const formattedUsers = filteredUsers.map(user => {
      const settings = user.settings || {};
      const intercomEnabled = settings.intercomEnabled !== undefined ? settings.intercomEnabled : true;
      const dealerboardEnabled = settings.dealerboardEnabled !== undefined ? settings.dealerboardEnabled : false;
      
      return {
        id: user.username || user.id, // Use username as ID (after migration)
        userId: user.id, // Keep original ID for backward compatibility
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
        source: user.source,
        status: user.status || 'offline',
        zoomEnabled: Boolean(user.zoomEnabled), // Include zoomEnabled
        teamsEnabled: Boolean(user.teamsEnabled), // Include teamsEnabled
        intercomEnabled: intercomEnabled,
        dealerboardEnabled: dealerboardEnabled,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      };
    });

    logger.info(`Returning ${formattedUsers.length} users to ${req.user.username}`);
    res.json({
      success: true,
      users: formattedUsers,
      total: formattedUsers.length
    });
  } catch (error) {
    logger.error('List users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Update user (admin only)
router.put('/users/:userId', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId } = req.params;
    const { username, firstName, lastName, email, role, isActive, extension, sipUri, employeeId, department, password, zoomEnabled, teamsEnabled, intercomEnabled, dealerboardEnabled } = req.body;

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

    logger.info(`User ${userId} updated by admin ${req.user.username}`);

    const settings = updatedRecord.settings || {};
    const finalIntercomEnabled = settings.intercomEnabled !== undefined ? settings.intercomEnabled : true;
    const finalDealerboardEnabled = settings.dealerboardEnabled !== undefined ? settings.dealerboardEnabled : false;

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
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId } = req.params;

    // Prevent admin from deleting themselves
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Find user in cache/DB
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
    
    if (!localUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove from local storage (delete by username key)
    localUsers.delete(localUser.username);

    // Remove from database
    await deleteUser(userId);

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

// Get AD status
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
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' });
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
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' });
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

// Get active sessions
router.get('/sessions', authenticateToken, (req, res) => {
  try {
    // Check if user has admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' });
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
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' });
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

module.exports = {
  router,
  authenticateToken,
  generateToken,
  verifyToken,
  setSocketIO
};
