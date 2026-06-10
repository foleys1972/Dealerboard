const { pool } = require('../pool');

async function getUserLocationId(userId) {
  const result = await pool.query(
    'SELECT location_id FROM users WHERE id = $1',
    [String(userId)]
  );
  const locId = result.rows?.[0]?.location_id;
  return locId ? String(locId) : null;
}

module.exports = {
  getUserLocationId,
};
