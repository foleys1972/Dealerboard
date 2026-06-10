const { pool } = require('../services/databaseService');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');

let cachedServerRole = null;

function computeCapabilities(roleObj) {
  const role = (roleObj?.role || '').toString();

  const envEnablePublisher = process.env.ENABLE_PUBLISHER;
  const envEnableSubscriber = process.env.ENABLE_SUBSCRIBER;

  const enablePublisher = envEnablePublisher !== undefined
    ? envEnablePublisher === 'true'
    : (roleObj?.enablePublisher !== undefined ? !!roleObj.enablePublisher : (role === 'publisher'));

  const enableSubscriber = envEnableSubscriber !== undefined
    ? envEnableSubscriber === 'true'
    : (roleObj?.enableSubscriber !== undefined ? !!roleObj.enableSubscriber : (role === 'subscriber'));

  return { enablePublisher, enableSubscriber };
}

function applyLoopbackPublisherUrl(roleObj) {
  const { enablePublisher, enableSubscriber } = computeCapabilities(roleObj);
  if (!enablePublisher || !enableSubscriber) return roleObj;

  if (roleObj?.publisherUrl && String(roleObj.publisherUrl).trim()) return roleObj;

  const port = parseInt(process.env.PORT || '5000', 10) || 5000;

  // Match server/index.js behavior exactly: HTTPS is opt-in via
  // HTTPS_ENABLED=true AND requires readable cert/key (index.js falls back
  // to HTTP if they can't be loaded). Anything else and the subscriber
  // would speak TLS to a plaintext port (EPROTO reconnect loop).
  let protocol = 'http';
  try {
    if (process.env.HTTPS_ENABLED !== 'true') {
      throw new Error('https disabled');
    }
    const certPath =
      process.env.SSL_CERT_FILE ||
      path.join(__dirname, '..', '..', 'dev-cert.pem');
    const keyPath =
      process.env.SSL_KEY_FILE ||
      path.join(__dirname, '..', '..', 'dev-key.pem');
    fs.readFileSync(certPath);
    fs.readFileSync(keyPath);
    protocol = 'https';
  } catch {
    protocol = 'http';
  }
  return {
    ...(roleObj || {}),
    publisherUrl: `${protocol}://127.0.0.1:${port}`
  };
}

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
      const fromDb = result.rows[0].settings.serverRole;
      const caps = computeCapabilities(fromDb);
      cachedServerRole = applyLoopbackPublisherUrl({ ...fromDb, ...caps });
      logger.info(`Server role loaded from database: ${cachedServerRole.role}`);
      return cachedServerRole;
    }
  } catch (error) {
    logger.warn('Failed to load server role from database, using environment/default:', error.message);
  }

  // Fallback to environment variables or defaults
  const fallback = {
    role: process.env.SERVER_ROLE || 'publisher',
    publisherUrl: process.env.PUBLISHER_URL || '',
    serverId: process.env.SERVER_ID || 'intercom-server-01',
    serverName: process.env.SERVER_NAME || 'Trading Intercom Server'
  };
  const caps = computeCapabilities(fallback);
  cachedServerRole = applyLoopbackPublisherUrl({ ...fallback, ...caps });

  logger.info(`Server role using fallback: ${cachedServerRole.role}`);
  return cachedServerRole;
}

/**
 * Check if this server is a publisher
 */
async function isPublisher() {
  const role = await getServerRole();
  return !!role.enablePublisher;
}

/**
 * Check if this server is a subscriber
 */
async function isSubscriber() {
  const role = await getServerRole();
  return !!role.enableSubscriber;
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
    logger.info('Server capabilities', { enablePublisher: !!role.enablePublisher, enableSubscriber: !!role.enableSubscriber });
    if (role.enableSubscriber && role.publisherUrl) {
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

