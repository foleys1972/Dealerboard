const { pool } = require('../pool');

async function resolveUserDbId(raw) {
  const v = String(raw || '').trim();
  if (!v) return v;
  try {
    const u = await pool.query(
      `SELECT id FROM users WHERE id = $1 OR username = $1 LIMIT 1`,
      [v]
    );
    return u.rows[0]?.id || v;
  } catch {
    return v;
  }
}

module.exports = {
  resolveUserDbId,
};
