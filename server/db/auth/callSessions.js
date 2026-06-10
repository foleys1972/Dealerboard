const { pool } = require('../pool');

async function listActiveIntercomGroupSessions() {
  const result = await pool.query(
    `
      SELECT participants, initiator_user_id, first_answerer_user_id
      FROM call_sessions
      WHERE status IN ('pending', 'active')
        AND line_type IN ('INTERCOM', 'GROUP')
        AND end_time IS NULL
    `
  );
  return result.rows;
}

module.exports = {
  listActiveIntercomGroupSessions,
};
