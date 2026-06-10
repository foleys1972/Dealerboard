const { pool } = require('../pool');

async function listSubscribers() {
  const result = await pool.query(
    `SELECT * FROM subscribers ORDER BY created_at DESC`
  );
  return result.rows;
}

async function getSubscriberById(subscriberId) {
  const result = await pool.query(
    `SELECT * FROM subscribers WHERE id = $1`,
    [subscriberId]
  );
  return result.rows[0] || null;
}

async function subscriberExists(subscriberId) {
  const result = await pool.query('SELECT id FROM subscribers WHERE id = $1', [subscriberId]);
  return result.rows.length > 0;
}

async function insertSubscriber(values) {
  const result = await pool.query(
    `INSERT INTO subscribers (
       id, name, server_url, server_id, location_id, connection_port,
       status, is_active, config, metadata, auth_token, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
     RETURNING *`,
    values
  );
  return result.rows[0];
}

async function updateSubscriber(subscriberId, updates, values) {
  const result = await pool.query(
    `UPDATE subscribers
     SET ${updates.join(', ')}
     WHERE id = $${values.length}
     RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

async function deleteSubscriberById(subscriberId) {
  const result = await pool.query(
    `DELETE FROM subscribers WHERE id = $1 RETURNING id`,
    [subscriberId]
  );
  return result.rows[0] || null;
}

function mapSubscriberRow(row, { authToken } = {}) {
  const subscriber = {
    id: row.id,
    name: row.name,
    serverUrl: row.server_url,
    serverId: row.server_id,
    locationId: row.location_id,
    connectionPort: row.connection_port,
    status: row.status,
    lastConnected: row.last_connected,
    isActive: row.is_active,
    config: row.config || {},
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (authToken) subscriber.authToken = authToken;
  return subscriber;
}

async function getSubscriberByAuthToken(authToken) {
  const result = await pool.query(
    `SELECT * FROM subscribers WHERE auth_token = $1 AND is_active = true`,
    [authToken]
  );
  return result.rows[0] || null;
}

module.exports = {
  listSubscribers,
  getSubscriberById,
  subscriberExists,
  getSubscriberByAuthToken,
  insertSubscriber,
  updateSubscriber,
  deleteSubscriberById,
  mapSubscriberRow,
};
