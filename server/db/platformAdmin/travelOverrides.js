const { pool } = require('../pool');

function mapTravelOverrideRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    userDisplayName: row.display_name,
    homeLocationId: row.home_location_id,
    travelLocationId: row.travel_location_id,
    travelLocationName: row.travel_location_name,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    forceOrigin: row.force_origin === true,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
  };
}

async function listTravelOverrides({ activeOnly, username, userId }) {
  const where = [];
  const values = [];
  let p = 1;

  if (activeOnly) {
    where.push('o.revoked_at IS NULL AND o.starts_at <= NOW() AND o.expires_at > NOW()');
  }
  if (username) {
    where.push(`u.username = $${p++}`);
    values.push(username);
  }
  if (userId) {
    where.push(`o.user_id = $${p++}`);
    values.push(userId);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT o.id,
            o.user_id,
            o.travel_location_id,
            o.starts_at,
            o.expires_at,
            o.force_origin,
            o.reason,
            o.created_by,
            o.created_at,
            o.revoked_at,
            o.revoked_by,
            u.username,
            u.display_name,
            u.location_id AS home_location_id,
            l.name AS travel_location_name
     FROM user_travel_overrides o
     JOIN users u ON u.id = o.user_id
     LEFT JOIN locations l ON l.id = o.travel_location_id
     ${whereSql}
     ORDER BY o.created_at DESC
     LIMIT 500`,
    values
  );
  return result.rows;
}

async function locationExists(locationId) {
  const result = await pool.query(`SELECT id FROM locations WHERE id = $1`, [locationId]);
  return result.rows.length > 0;
}

async function revokeActiveTravelOverridesForUser(userId, revokedBy) {
  await pool.query(
    `UPDATE user_travel_overrides
     SET revoked_at = NOW(), revoked_by = $2
     WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
    [userId, revokedBy]
  );
}

async function insertTravelOverride(values) {
  await pool.query(
    `INSERT INTO user_travel_overrides (
       id, user_id, travel_location_id, starts_at, expires_at, force_origin, reason, created_by, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
    values
  );
}

async function getTravelOverrideById(id) {
  const result = await pool.query(
    `SELECT o.id,
            o.user_id,
            o.travel_location_id,
            o.starts_at,
            o.expires_at,
            o.force_origin,
            o.reason,
            o.created_by,
            o.created_at,
            o.revoked_at,
            o.revoked_by,
            u.username,
            u.display_name,
            u.location_id AS home_location_id,
            l.name AS travel_location_name
     FROM user_travel_overrides o
     JOIN users u ON u.id = o.user_id
     LEFT JOIN locations l ON l.id = o.travel_location_id
     WHERE o.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function revokeTravelOverrideById(id, revokedBy) {
  const result = await pool.query(
    `UPDATE user_travel_overrides
     SET revoked_at = NOW(), revoked_by = $2
     WHERE id = $1
     RETURNING id`,
    [id, revokedBy]
  );
  return result.rows[0] || null;
}

module.exports = {
  mapTravelOverrideRow,
  listTravelOverrides,
  locationExists,
  revokeActiveTravelOverridesForUser,
  insertTravelOverride,
  getTravelOverrideById,
  revokeTravelOverrideById,
};
