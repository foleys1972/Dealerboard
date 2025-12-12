/**
 * Role-Based Access Control Middleware
 * 
 * Roles:
 * - user: Standard trading floor user (NO admin access)
 * - admin: System administrators (full access)
 */

const logger = require('../utils/logger');

// Role definitions
const ROLES = {
  USER: 'user',
  ADMIN: 'admin'
};

// Permission definitions for users
const USER_PERMISSIONS = {
  // Calling permissions
  MAKE_DIRECT_CALL: true,
  MAKE_HUNT_CALL: true,
  RECEIVE_CALLS: true,
  
  // Broadcast permissions
  MONITOR_BROADCASTS: true,
  ADJUST_BROADCAST_VOLUME: true,
  LISTEN_MULTIPLE_BROADCASTS: true, // Up to 10+
  
  // Personal settings
  SET_DND: true,
  SET_CALL_FORWARD: true,
  SET_STATUS: true,
  VIEW_PERSONAL_HISTORY: true,
  
  // Restricted permissions (NOT allowed)
  CREATE_GROUPS: false,
  DELETE_GROUPS: false,
  MANAGE_USERS: false,
  ACCESS_RECORDINGS: false,
  DELETE_RECORDINGS: false,
  ACCESS_ADMIN_PANEL: false,
  MANAGE_FEDERATION: false,
  VIEW_COMPLIANCE_DATA: false,
  MANAGE_SYSTEM_SETTINGS: false
};

// Permission definitions for admins
const ADMIN_PERMISSIONS = {
  ...USER_PERMISSIONS,
  // Override restricted permissions
  CREATE_GROUPS: true,
  DELETE_GROUPS: true,
  MANAGE_USERS: true,
  ACCESS_RECORDINGS: true,
  DELETE_RECORDINGS: true,
  ACCESS_ADMIN_PANEL: true,
  MANAGE_FEDERATION: true,
  VIEW_COMPLIANCE_DATA: true,
  MANAGE_SYSTEM_SETTINGS: true
};

/**
 * Get permissions for a role
 */
const getPermissions = (role) => {
  switch(role) {
    case ROLES.ADMIN:
      return ADMIN_PERMISSIONS;
    case ROLES.USER:
    default:
      return USER_PERMISSIONS;
  }
};

/**
 * Check if user has permission
 */
const hasPermission = (user, permission) => {
  const permissions = getPermissions(user.role || ROLES.USER);
  return permissions[permission] === true;
};

/**
 * Middleware: Require specific role
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      const user = req.user; // Assume user is attached by auth middleware
      
      if (!user) {
        return res.status(401).json({ 
          error: 'Authentication required',
          message: 'You must be logged in to access this resource'
        });
      }

      const userRole = user.role || ROLES.USER;
      
      if (!allowedRoles.includes(userRole)) {
        logger.warn(`Access denied for user ${user.id} with role ${userRole} to resource requiring roles: ${allowedRoles.join(', ')}`);
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to access this resource',
          requiredRole: allowedRoles,
          currentRole: userRole
        });
      }

      next();
    } catch (error) {
      logger.error('Role check error:', error);
      res.status(500).json({ error: 'Internal server error during permission check' });
    }
  };
};

/**
 * Middleware: Require specific permission
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    try {
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({ 
          error: 'Authentication required' 
        });
      }

      if (!hasPermission(user, permission)) {
        logger.warn(`Permission denied: User ${user.id} attempted to access ${permission}`);
        return res.status(403).json({ 
          error: 'Permission denied',
          message: `You do not have permission to perform this action`,
          requiredPermission: permission
        });
      }

      next();
    } catch (error) {
      logger.error('Permission check error:', error);
      res.status(500).json({ error: 'Internal server error during permission check' });
    }
  };
};

/**
 * Middleware: Admin only routes
 */
const adminOnly = requireRole([ROLES.ADMIN]);

/**
 * Middleware: User routes (both user and admin can access)
 */
const authenticatedUser = requireRole([ROLES.USER, ROLES.ADMIN]);

module.exports = {
  ROLES,
  USER_PERMISSIONS,
  ADMIN_PERMISSIONS,
  getPermissions,
  hasPermission,
  requireRole,
  requirePermission,
  adminOnly,
  authenticatedUser
};

