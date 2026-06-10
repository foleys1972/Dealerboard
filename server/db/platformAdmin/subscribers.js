const { pool } = require('../pool');

async function getSubscriberForAgent(subscriberId) {
  const result = await pool.query(
    `SELECT id, server_url, name, server_id, is_active, metadata FROM subscribers WHERE id = $1`,
    [subscriberId]
  );
  return result.rows[0] || null;
}

module.exports = {
  getSubscriberForAgent,
};
