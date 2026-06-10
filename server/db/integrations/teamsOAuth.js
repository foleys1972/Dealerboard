const { pool } = require('../pool');

async function getUserIdByStateToken(stateToken) {
  const result = await pool.query(
    `SELECT user_id FROM teams_oauth_states WHERE state_token = $1 AND expires_at > NOW()`,
    [stateToken]
  );
  return result.rows[0]?.user_id || null;
}

module.exports = {
  getUserIdByStateToken,
};
