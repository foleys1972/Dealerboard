const { pool } = require('../pool');

async function getActiveAuthType(userId) {
  const result = await pool.query(
    `SELECT auth_type FROM zoom_user_credentials WHERE user_id = $1 AND is_active = true`,
    [userId]
  );
  return result.rows[0]?.auth_type || null;
}

module.exports = {
  getActiveAuthType,
};
