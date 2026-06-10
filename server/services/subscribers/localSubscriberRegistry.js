const crypto = require('crypto');
const { pool } = require('../../db/pool');
const { getServerRole } = require('../../utils/serverRole');
const logger = require('../../utils/logger');

function computeLocalServerUrl() {
  const port = String(process.env.PORT || 5000);
  const announcedIp = process.env.ANNOUNCED_IP || process.env.LISTEN_IP || '127.0.0.1';
  const protocol = process.env.HTTPS_ENABLED === 'true' ? 'https' : 'http';
  return `${protocol}://${announcedIp}:${port}`;
}

/**
 * Ensure the local node has a row in subscribers when subscriber capability is enabled.
 * Required for hybrid (publisher + subscriber) nodes and internal private wire pickers.
 */
async function ensureLocalSubscriberRecord(options = {}) {
  const serverRole = options.serverRole || await getServerRole();
  if (!serverRole?.enableSubscriber || !serverRole?.serverId) {
    return null;
  }

  const serverId = String(serverRole.serverId);
  const name = options.serverName || serverRole.serverName || `Subscriber ${serverId}`;
  const serverUrl = computeLocalServerUrl();
  const localPort = parseInt(process.env.PORT || '5000', 10) || 5000;

  const existing = await pool.query(
    `SELECT id, auth_token FROM subscribers WHERE server_id = $1 LIMIT 1`,
    [serverId]
  );

  if (existing.rows.length === 0) {
    const id = `subscriber_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const authToken = crypto.randomBytes(32).toString('hex');

    await pool.query(
      `INSERT INTO subscribers (
         id, name, server_url, server_id, location_id, connection_port,
         status, is_active, config, metadata, auth_token, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
      [
        id,
        name,
        serverUrl,
        serverId,
        null,
        localPort,
        'disconnected',
        true,
        JSON.stringify({}),
        JSON.stringify({
          localAutoRegistered: true,
          enablePublisher: !!serverRole.enablePublisher,
        }),
        authToken,
      ]
    );

    logger.info('Ensured local subscriber record', { serverId, id, hybrid: !!serverRole.enablePublisher });
    return id;
  }

  const row = existing.rows[0];
  await pool.query(
    `UPDATE subscribers
     SET name = COALESCE($1, name),
         server_url = COALESCE($2, server_url),
         connection_port = COALESCE($4, connection_port),
         is_active = true,
         metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb,
         updated_at = NOW()
     WHERE server_id = $3`,
    [
      name,
      serverUrl,
      serverId,
      localPort,
      JSON.stringify({
        localAutoRegistered: true,
        enablePublisher: !!serverRole.enablePublisher,
      }),
    ]
  );

  return row.id;
}

module.exports = {
  computeLocalServerUrl,
  ensureLocalSubscriberRecord,
};
