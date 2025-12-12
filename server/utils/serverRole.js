const { pool } = require('../services/databaseService');
const logger = require('./logger');

let cachedServerRole = null;

/**
 * Get the server role from system settings
 * Falls back to environment variable or default to 'publisher'
 */
async function getServerRole() {
  if (cachedServerRole) {
    return cachedServerRole;
  }

  try {
    const result = await pool.query(
      `SELECT settings FROM system_settings WHERE id = 'global'`
    );

    if (result.rows.length > 0 && result.rows[0].settings?.serverRole) {
      cachedServerRole = result.rows[0].settings.serverRole;
      logger.info(`Server role loaded from database: ${cachedServerRole.role}`);
      return cachedServerRole;
    }
  } catch (error) {
    logger.warn('Failed to load server role from database, using environment/default:', error.message);
  }

  // Fallback to environment variables or defaults
  cachedServerRole = {
    role: process.env.SERVER_ROLE || 'publisher',
    publisherUrl: process.env.PUBLISHER_URL || '',
    serverId: process.env.SERVER_ID || 'intercom-server-01',
    serverName: process.env.SERVER_NAME || 'Trading Intercom Server'
  };

  logger.info(`Server role using fallback: ${cachedServerRole.role}`);
  return cachedServerRole;
}

/**
 * Check if this server is a publisher
 */
async function isPublisher() {
  const role = await getServerRole();
  return role.role === 'publisher';
}

/**
 * Check if this server is a subscriber
 */
async function isSubscriber() {
  const role = await getServerRole();
  return role.role === 'subscriber';
}

/**
 * Clear the cached server role (useful after updates)
 */
function clearCache() {
  cachedServerRole = null;
  logger.info('Server role cache cleared');
}

/**
 * Initialize server role on startup
 */
async function initializeServerRole() {
  try {
    const role = await getServerRole();
    logger.info(`Server initialized as: ${role.role.toUpperCase()}`);
    if (role.role === 'subscriber' && role.publisherUrl) {
      logger.info(`Subscriber will connect to publisher at: ${role.publisherUrl}`);
    }
    return role;
  } catch (error) {
    logger.error('Failed to initialize server role:', error);
    throw error;
  }
}

module.exports = {
  getServerRole,
  isPublisher,
  isSubscriber,
  clearCache,
  initializeServerRole
};

