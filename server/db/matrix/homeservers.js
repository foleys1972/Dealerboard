const { pool } = require('../pool');

function mapHomeserverRow(row, { includeMetadata = true, includeNames = false } = {}) {
  const mapped = {
    id: row.id,
    subscriberId: row.subscriber_id,
    region: row.region,
    serverName: row.server_name,
    baseUrl: row.base_url,
    federationUrl: row.federation_url,
    isSelfHosted: row.is_self_hosted,
    externalProvider: row.external_provider,
    locationId: row.location_id,
    isActive: row.is_active,
    capacity: row.capacity,
    currentLoad: row.current_load,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (includeMetadata) {
    mapped.metadata = row.metadata || {};
  } else {
    mapped.metadata = undefined;
  }

  if (includeNames) {
    mapped.subscriberName = row.subscriber_name;
    mapped.locationName = row.location_name;
  }

  return mapped;
}

async function getUserRegion(userId) {
  const result = await pool.query(
    `SELECT region FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0]?.region || null;
}

async function listHomeservers({ isAdmin, region, isActive, userId }) {
  let query = `
    SELECT
      id, subscriber_id, region, server_name, base_url, federation_url,
      is_self_hosted, external_provider, location_id, is_active,
      capacity, current_load, metadata, created_at, updated_at
    FROM matrix_homeservers
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;

  if (!isAdmin) {
    query += ' AND is_active = true';
    const userRegion = await getUserRegion(userId);
    if (userRegion) {
      query += ` AND region = $${paramIndex}`;
      params.push(userRegion);
      paramIndex += 1;
    }
  } else if (region) {
    query += ` AND region = $${paramIndex}`;
    params.push(region);
    paramIndex += 1;
  }

  if (isAdmin && isActive !== undefined) {
    query += ` AND is_active = $${paramIndex}`;
    params.push(isActive);
    paramIndex += 1;
  }

  query += ' ORDER BY region, server_name';
  const result = await pool.query(query, params);
  return result.rows;
}

async function listHomeserversLegacy({ region, subscriberId }) {
  let query = `SELECT mh.*, s.name as subscriber_name, l.name as location_name
               FROM matrix_homeservers mh
               LEFT JOIN subscribers s ON mh.subscriber_id = s.id
               LEFT JOIN locations l ON mh.location_id = l.id
               WHERE 1=1`;
  const params = [];
  let paramCount = 1;

  if (region) {
    query += ` AND mh.region = $${paramCount++}`;
    params.push(region);
  }
  if (subscriberId) {
    query += ` AND mh.subscriber_id = $${paramCount++}`;
    params.push(subscriberId);
  }

  query += ' ORDER BY mh.region, mh.server_name';
  const result = await pool.query(query, params);
  return result.rows;
}

async function getHomeserverById(id) {
  const result = await pool.query(
    `SELECT mh.*, s.name as subscriber_name, l.name as location_name
     FROM matrix_homeservers mh
     LEFT JOIN subscribers s ON mh.subscriber_id = s.id
     LEFT JOIN locations l ON mh.location_id = l.id
     WHERE mh.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function getSubscriberIdByServerId(serverId) {
  const result = await pool.query(
    `SELECT id FROM subscribers WHERE server_id = $1`,
    [serverId]
  );
  return result.rows[0]?.id || null;
}

async function insertHomeserver(values) {
  const result = await pool.query(
    `INSERT INTO matrix_homeservers
     (id, subscriber_id, region, server_name, base_url, federation_url, is_self_hosted,
      external_provider, location_id, capacity, metadata, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
     RETURNING *`,
    values
  );
  return result.rows[0];
}

async function updateHomeserver(id, updates, values) {
  const result = await pool.query(
    `UPDATE matrix_homeservers
     SET ${updates.join(', ')}
     WHERE id = $${values.length}
     RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

async function countRoomAssignmentsForHomeserver(homeserverId) {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM matrix_room_assignments WHERE homeserver_id = $1`,
    [homeserverId]
  );
  return parseInt(result.rows[0].count, 10) || 0;
}

async function deleteHomeserverById(id) {
  const result = await pool.query(
    `DELETE FROM matrix_homeservers WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.rows[0] || null;
}

module.exports = {
  mapHomeserverRow,
  getUserRegion,
  listHomeservers,
  listHomeserversLegacy,
  getHomeserverById,
  getSubscriberIdByServerId,
  insertHomeserver,
  updateHomeserver,
  countRoomAssignmentsForHomeserver,
  deleteHomeserverById,
};
