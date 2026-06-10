const { pool } = require('../pool');

async function getActiveMonitorSession(lineId, userId) {
  const result = await pool.query(
    `SELECT * FROM dealerboard_monitor_sessions
     WHERE private_wire_id = $1 AND user_id = $2 AND ended_at IS NULL`,
    [lineId, userId]
  );
  return result.rows[0] || null;
}

async function createMonitorSession(sessionId, lineId, userId) {
  await pool.query(
    `INSERT INTO dealerboard_monitor_sessions (id, private_wire_id, user_id)
     VALUES ($1, $2, $3)`,
    [sessionId, lineId, userId]
  );
}

async function endMonitorSession(lineId, userId) {
  await pool.query(
    `UPDATE dealerboard_monitor_sessions
     SET ended_at = NOW()
     WHERE private_wire_id = $1 AND user_id = $2 AND ended_at IS NULL`,
    [lineId, userId]
  );
}

async function getActiveMonitorSessions(lineId) {
  const result = await pool.query(
    `SELECT dms.*, u.username, u.display_name
     FROM dealerboard_monitor_sessions dms
     INNER JOIN users u ON dms.user_id = u.id
     WHERE dms.private_wire_id = $1 AND dms.ended_at IS NULL`,
    [lineId]
  );
  return result.rows;
}

async function findMonitorMatrixRoomId(lineId) {
  const result = await pool.query(
    `SELECT matrix_room_id FROM dealerboard_monitor_sessions
     WHERE private_wire_id = $1 AND matrix_room_id IS NOT NULL AND ended_at IS NULL
     LIMIT 1`,
    [lineId]
  );
  return result.rows[0]?.matrix_room_id || null;
}

async function setMonitorSessionsMatrixRoomId(lineId, matrixRoomId) {
  await pool.query(
    `UPDATE dealerboard_monitor_sessions
     SET matrix_room_id = $1
     WHERE private_wire_id = $2 AND ended_at IS NULL`,
    [matrixRoomId, lineId]
  );
}

async function countActiveMonitorSessions(lineId) {
  const result = await pool.query(
    `SELECT * FROM dealerboard_monitor_sessions
     WHERE private_wire_id = $1 AND ended_at IS NULL`,
    [lineId]
  );
  return result.rows.length;
}

async function getRemainingMonitorUserIds(lineId) {
  const result = await pool.query(
    `SELECT user_id FROM dealerboard_monitor_sessions
     WHERE private_wire_id = $1 AND ended_at IS NULL`,
    [lineId]
  );
  return result.rows.map((row) => row.user_id);
}

module.exports = {
  getActiveMonitorSession,
  createMonitorSession,
  endMonitorSession,
  getActiveMonitorSessions,
  findMonitorMatrixRoomId,
  setMonitorSessionsMatrixRoomId,
  countActiveMonitorSessions,
  getRemainingMonitorUserIds,
};
