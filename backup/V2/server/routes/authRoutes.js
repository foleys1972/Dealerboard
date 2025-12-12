const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { activeDirectoryService } = require('../services/activeDirectoryService');
const { groupService } = require('../services/groupService');
const { createUser, findUsers, updateUser, deleteUser, getUserById } = require('../services/databaseService');
const logger = require('../utils/logger');

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
  return jwt.sign(
    {
      id: user.id,
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
            isActive: true
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

      user = {
        id: localUser.id,
        username: localUser.username,
        email: localUser.email,
        firstName: localUser.firstName,
        lastName: localUser.lastName,
        displayName: localUser.displayName,
        role: localUser.role,
        source: 'local',
        isActive: localUser.isActive
      };
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is disabled' });
    }

    // Generate JWT token
    const token = generateToken(user);

    // Store session
    userSessions.set(user.id, {
      user,
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

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        role: user.role,
        source: user.source
      },
      expiresIn: JWT_EXPIRES_IN
    });
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
router.post('/logout', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    
    // Remove session
    userSessions.delete(userId);
    
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
    const session = userSessions.get(req.user.id);
    if (!session) {
      return res.status(401).json({ error: 'Session not found' });
    }

    // Update last activity
    session.lastActivity = new Date();

    // Fetch user from database to get latest settings
    const dbUser = await getUserById(req.user.id);
    const userData = {
      ...session.user,
      settings: dbUser?.settings || {}
    };

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
    const { userId } = req.params;
    
    // Users can only view their own settings, admins can view any user
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        role: user.role,
        settings: user.settings || {},
        isActive: user.isActive
      }
    });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
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
    const { userId } = req.params;
    const { settings } = req.body;
    
    // Users can only update their own settings, admins can update any user
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings object is required' });
    }

    // Get current user to merge settings
    const currentUser = await getUserById(userId);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Merge with existing settings
    const currentSettings = currentUser.settings || {};
    const updatedSettings = {
      ...currentSettings,
      ...settings
    };

    // Update user settings in database
    const updatedUser = await updateUser(userId, {
      settings: updatedSettings
    });

    logger.info(`User settings updated for ${userId} by ${req.user.username}`);

    res.json({
      success: true,
      message: 'Settings updated successfully',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        settings: updatedUser.settings
      }
    });
  } catch (error) {
    logger.error('Update user settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
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

// List all users (admin only)
router.get('/users', authenticateToken, async (req, res) => {
  try {
    logger.info(`Users endpoint called by user: ${req.user.username}, role: ${req.user.role}`);
    
    // Check if user is admin
    if (req.user.role !== 'admin') {
      logger.warn(`Non-admin user ${req.user.username} tried to access users endpoint`);
      return res.status(403).json({ error: 'Admin access required' });
    }

    const users = await findUsers({});
    
    const formattedUsers = users.map(user => ({
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
      source: user.source,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    }));

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
    const { username, firstName, lastName, email, role, isActive, extension, sipUri, employeeId, department, password } = req.body;

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
    if (password) updateData.password = password;

    const updatedRecord = await updateUser(userId, updateData);

    // Update cache (handle username change)
    if (localUser.username && localUser.username !== updatedRecord.username) {
      localUsers.delete(localUser.username);
    }
    cacheLocalUser(updatedRecord);

    logger.info(`User ${userId} updated by admin ${req.user.username}`);

    res.json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
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
  verifyToken
};
