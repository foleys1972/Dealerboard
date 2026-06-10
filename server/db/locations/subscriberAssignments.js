const { pool } = require('../pool');

async function getLocationSubscriberAssignmentRow(locationId) {
  const result = await pool.query(
    `SELECT a.location_id,
            a.primary_subscriber_id,
            a.secondary_subscriber_id,
            a.updated_at,
            a.updated_by,
            a.notes,
            ps.server_id AS primary_server_id,
            ps.name AS primary_name,
            ps.server_url AS primary_server_url,
            ss.server_id AS secondary_server_id,
            ss.name AS secondary_name,
            ss.server_url AS secondary_server_url
     FROM location_subscriber_assignments a
     LEFT JOIN subscribers ps ON ps.id = a.primary_subscriber_id
     LEFT JOIN subscribers ss ON ss.id = a.secondary_subscriber_id
     WHERE a.location_id = $1`,
    [String(locationId)]
  );
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    locationId: row.location_id,
    primarySubscriberId: row.primary_subscriber_id,
    secondarySubscriberId: row.secondary_subscriber_id,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    notes: row.notes,
    primary: row.primary_subscriber_id ? {
      subscriberId: row.primary_subscriber_id,
      serverId: row.primary_server_id,
      name: row.primary_name,
      serverUrl: row.primary_server_url,
    } : null,
    secondary: row.secondary_subscriber_id ? {
      subscriberId: row.secondary_subscriber_id,
      serverId: row.secondary_server_id,
      name: row.secondary_name,
      serverUrl: row.secondary_server_url,
    } : null,
  };
}

async function subscriberExists(subscriberId) {
  const result = await pool.query(`SELECT id FROM subscribers WHERE id = $1`, [subscriberId]);
  return result.rows.length > 0;
}

async function upsertLocationSubscriberAssignment(values) {
  await pool.query(
    `INSERT INTO location_subscriber_assignments (
       location_id, primary_subscriber_id, secondary_subscriber_id, updated_at, updated_by, notes
     )
     VALUES ($1,$2,$3,NOW(),$4,$5)
     ON CONFLICT (location_id) DO UPDATE SET
       primary_subscriber_id = EXCLUDED.primary_subscriber_id,
       secondary_subscriber_id = EXCLUDED.secondary_subscriber_id,
       updated_at = NOW(),
       updated_by = EXCLUDED.updated_by,
       notes = EXCLUDED.notes`,
    values
  );
}

async function getLocationSubscriberRouting(locationId) {
  const result = await pool.query(
    `SELECT a.location_id,
            a.primary_subscriber_id,
            a.secondary_subscriber_id,
            ps.server_url AS primary_server_url,
            ps.server_id  AS primary_server_id,
            ps.name       AS primary_name,
            ps.connection_port AS primary_connection_port,
            ss.server_url AS secondary_server_url,
            ss.server_id  AS secondary_server_id,
            ss.name       AS secondary_name,
            ss.connection_port AS secondary_connection_port
     FROM location_subscriber_assignments a
     LEFT JOIN subscribers ps ON ps.id = a.primary_subscriber_id
     LEFT JOIN subscribers ss ON ss.id = a.secondary_subscriber_id
     WHERE a.location_id = $1`,
    [String(locationId)]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    locationId: row.location_id,
    primary: row.primary_subscriber_id ? {
      subscriberId: row.primary_subscriber_id,
      serverId: row.primary_server_id,
      name: row.primary_name,
      serverUrl: row.primary_server_url,
      connectionPort: row.primary_connection_port,
    } : null,
    secondary: row.secondary_subscriber_id ? {
      subscriberId: row.secondary_subscriber_id,
      serverId: row.secondary_server_id,
      name: row.secondary_name,
      serverUrl: row.secondary_server_url,
      connectionPort: row.secondary_connection_port,
    } : null,
  };
}

module.exports = {
  getLocationSubscriberAssignmentRow,
  getLocationSubscriberRouting,
  subscriberExists,
  upsertLocationSubscriberAssignment,
};
