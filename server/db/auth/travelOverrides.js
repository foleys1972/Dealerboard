const { pool } = require('../pool');

async function getActiveTravelOverrideForUser(userId) {
  const result = await pool.query(
    `SELECT travel_location_id, force_origin, starts_at, expires_at
     FROM user_travel_overrides
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND starts_at <= NOW()
       AND expires_at > NOW()
     ORDER BY expires_at DESC
     LIMIT 1`,
    [String(userId)]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    travelLocationId: row.travel_location_id,
    forceOrigin: row.force_origin === true,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
  };
}

module.exports = {
  getActiveTravelOverrideForUser,
};
