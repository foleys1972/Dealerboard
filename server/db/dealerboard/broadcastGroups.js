const { pool } = require('../pool');

async function findBroadcastByAorMetadata(aor) {
  const result = await pool.query(
    `SELECT id, name, call_mode, type, metadata FROM groups WHERE (metadata->>'aor') = $1 LIMIT 1`,
    [aor]
  );
  return result.rows[0] || null;
}

async function findBroadcastById(groupId) {
  const result = await pool.query(
    `SELECT id, name, call_mode, type, metadata FROM groups WHERE id = $1 LIMIT 1`,
    [groupId]
  );
  return result.rows[0] || null;
}

async function findBroadcastByLegacyAor(aor) {
  const result = await pool.query(
    `SELECT id, name, metadata FROM groups WHERE (metadata->>'legacyAor') = $1 LIMIT 1`,
    [aor]
  );
  return result.rows[0] || null;
}

module.exports = {
  findBroadcastByAorMetadata,
  findBroadcastById,
  findBroadcastByLegacyAor,
};
