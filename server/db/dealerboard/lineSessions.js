const { pool } = require('../pool');

async function getActiveLineUserIds(lineId) {
  const lineSessions = await pool.query(
    `SELECT user_id FROM dealerboard_line_sessions
     WHERE private_wire_id = $1 AND ended_at IS NULL`,
    [lineId]
  );

  const monitorSessions = await pool.query(
    `SELECT user_id FROM dealerboard_monitor_sessions
     WHERE private_wire_id = $1 AND ended_at IS NULL`,
    [lineId]
  );

  const allUserIds = new Set();
  lineSessions.rows.forEach((row) => allUserIds.add(row.user_id));
  monitorSessions.rows.forEach((row) => allUserIds.add(row.user_id));

  return Array.from(allUserIds);
}

async function getActiveLineSessionUserIds(lineId) {
  const result = await pool.query(
    `SELECT user_id FROM dealerboard_line_sessions
     WHERE private_wire_id = $1 AND ended_at IS NULL`,
    [lineId]
  );
  return result.rows.map((row) => row.user_id);
}

async function findExistingMatrixRoomId(lineId) {
  const existingRoomLine = await pool.query(
    `SELECT matrix_room_id FROM dealerboard_line_sessions
     WHERE private_wire_id = $1 AND matrix_room_id IS NOT NULL AND ended_at IS NULL
     LIMIT 1`,
    [lineId]
  );

  const existingRoomMonitor = await pool.query(
    `SELECT matrix_room_id FROM dealerboard_monitor_sessions
     WHERE private_wire_id = $1 AND matrix_room_id IS NOT NULL AND ended_at IS NULL
     LIMIT 1`,
    [lineId]
  );

  const existing = existingRoomLine.rows[0] || existingRoomMonitor.rows[0];
  return existing?.matrix_room_id || null;
}

async function getActiveUserSession(lineId, userId, sessionType = 'active') {
  const result = await pool.query(
    `SELECT * FROM dealerboard_line_sessions
     WHERE private_wire_id = $1 AND user_id = $2 AND session_type = $3 AND ended_at IS NULL`,
    [lineId, userId, sessionType]
  );
  return result.rows[0] || null;
}

async function getLatestUserSession(lineId, userId) {
  const result = await pool.query(
    `SELECT id, metadata FROM dealerboard_line_sessions
     WHERE private_wire_id = $1 AND user_id = $2 AND ended_at IS NULL
     ORDER BY started_at DESC LIMIT 1`,
    [lineId, userId]
  );
  return result.rows[0] || null;
}

async function upsertActiveSession(lineId, userId, sessionId) {
  const existing = await getActiveUserSession(lineId, userId, 'active');
  if (existing) {
    await pool.query(
      `UPDATE dealerboard_line_sessions
       SET last_activity = NOW()
       WHERE private_wire_id = $1 AND user_id = $2 AND session_type = 'active' AND ended_at IS NULL`,
      [lineId, userId]
    );
    return { sessionId: existing.id, isNew: false };
  }

  await pool.query(
    `INSERT INTO dealerboard_line_sessions (id, private_wire_id, user_id, session_type)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (private_wire_id, user_id, session_type) DO UPDATE SET
       ended_at = NULL,
       last_activity = NOW()`,
    [sessionId, lineId, userId]
  );
  return { sessionId, isNew: true };
}

async function createLineSession({ sessionId, lineId, userId, sessionType = 'active', metadata = {} }) {
  await pool.query(
    `INSERT INTO dealerboard_line_sessions (id, private_wire_id, user_id, session_type, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [sessionId, lineId, userId, sessionType, JSON.stringify(metadata)]
  );
}

async function setSessionSipCallId(sessionId, sipCallId) {
  await pool.query(
    `UPDATE dealerboard_line_sessions
     SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{sipCallId}', $1::jsonb)
     WHERE id = $2`,
    [JSON.stringify(sipCallId), sessionId]
  );
}

async function setSessionLineSessionKey(sessionId, lineSessionKey) {
  await pool.query(
    `UPDATE dealerboard_line_sessions
     SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{lineSessionKey}', $1::jsonb)
     WHERE id = $2`,
    [JSON.stringify(lineSessionKey), sessionId]
  );
}

/** Replace SIP Call-ID on all active sessions for a logical dealerboard line. */
async function replaceActiveLineSipCallId(lineId, oldSipCallId, newSipCallId) {
  if (!lineId || !newSipCallId) return;

  await pool.query(
    `UPDATE dealerboard_line_sessions
     SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{sipCallId}', $1::jsonb),
         last_activity = NOW()
     WHERE private_wire_id = $2
       AND ended_at IS NULL
       AND (
         metadata->>'sipCallId' = $3
         OR $3 IS NULL
       )`,
    [JSON.stringify(String(newSipCallId)), String(lineId), oldSipCallId ? String(oldSipCallId) : null]
  );
}

async function endActiveUserSession(lineId, userId, sessionType = 'active') {
  await pool.query(
    `UPDATE dealerboard_line_sessions
     SET ended_at = NOW()
     WHERE private_wire_id = $1 AND user_id = $2 AND session_type = $3 AND ended_at IS NULL`,
    [lineId, userId, sessionType]
  );
}

async function endSessionById(sessionId) {
  await pool.query(
    `UPDATE dealerboard_line_sessions SET ended_at = NOW() WHERE id = $1`,
    [sessionId]
  );
}

async function getRemainingLineUserIds(lineId) {
  const result = await pool.query(
    `SELECT user_id FROM dealerboard_line_sessions
     WHERE private_wire_id = $1 AND ended_at IS NULL`,
    [lineId]
  );
  return result.rows.map((row) => row.user_id);
}

async function endAllActiveSessionsForLine(lineId) {
  await pool.query(
    `UPDATE dealerboard_line_sessions
     SET ended_at = NOW()
     WHERE private_wire_id = $1 AND session_type = 'active' AND ended_at IS NULL`,
    [String(lineId)]
  );
}

async function updateLineSessionMatrixRoomId(lineId, userId, matrixRoomId, sessionType = 'active') {
  if (sessionType !== 'active') return;

  await pool.query(
    `UPDATE dealerboard_line_sessions
     SET matrix_room_id = $1
     WHERE private_wire_id = $2 AND user_id = $3 AND session_type = 'active' AND ended_at IS NULL`,
    [matrixRoomId, lineId, userId]
  );
}

async function updateAllLineSessionsMatrixRoomId(lineId, matrixRoomId) {
  await pool.query(
    `UPDATE dealerboard_line_sessions
     SET matrix_room_id = $1, last_activity = NOW()
     WHERE private_wire_id = $2 AND ended_at IS NULL`,
    [matrixRoomId, lineId]
  );

  await pool.query(
    `UPDATE dealerboard_monitor_sessions
     SET matrix_room_id = $1
     WHERE private_wire_id = $2 AND ended_at IS NULL`,
    [matrixRoomId, lineId]
  );
}

async function getPrivateWireLineInfo(lineId) {
  const result = await pool.query(
    `SELECT line_label, mode FROM dealerboard_private_wires WHERE id = $1`,
    [lineId]
  );
  return result.rows[0] || null;
}

async function getMatrixRoomHomeserverId(matrixRoomId) {
  const result = await pool.query(
    `SELECT homeserver_id, region FROM matrix_room_assignments WHERE room_id = $1`,
    [matrixRoomId]
  );
  return result.rows[0] || null;
}

async function getActiveBusyPrivateWireIds() {
  const result = await pool.query(
    `SELECT DISTINCT private_wire_id
     FROM dealerboard_line_sessions
     WHERE ended_at IS NULL AND session_type = 'active'`
  );
  return (result.rows || [])
    .map((row) => (row.private_wire_id ? String(row.private_wire_id) : null))
    .filter(Boolean);
}

/** lineId -> user ids with active sessions on that line */
async function getActiveSessionUsersByLineIds(lineIds) {
  if (!lineIds || lineIds.length === 0) return new Map();

  const result = await pool.query(
    `SELECT private_wire_id, user_id
     FROM dealerboard_line_sessions
     WHERE ended_at IS NULL
       AND session_type = 'active'
       AND private_wire_id = ANY($1::text[])`,
    [lineIds]
  );

  const map = new Map();
  for (const row of result.rows || []) {
    const lineId = row.private_wire_id ? String(row.private_wire_id) : null;
    if (!lineId) continue;
    if (!map.has(lineId)) map.set(lineId, new Set());
    map.get(lineId).add(String(row.user_id));
  }
  return map;
}

/** Shared SIP call ID from any active session on this logical line. */
async function getActiveLineSipCallId(lineId) {
  const result = await pool.query(
    `SELECT metadata->>'sipCallId' AS sip_call_id
     FROM dealerboard_line_sessions
     WHERE private_wire_id = $1
       AND ended_at IS NULL
       AND metadata->>'sipCallId' IS NOT NULL
     ORDER BY started_at DESC
     LIMIT 1`,
    [lineId]
  );
  const sipCallId = result.rows[0]?.sip_call_id;
  return sipCallId ? String(sipCallId) : null;
}

module.exports = {
  getActiveLineUserIds,
  getActiveLineSessionUserIds,
  findExistingMatrixRoomId,
  getActiveUserSession,
  getLatestUserSession,
  upsertActiveSession,
  createLineSession,
  setSessionSipCallId,
  setSessionLineSessionKey,
  replaceActiveLineSipCallId,
  endActiveUserSession,
  endSessionById,
  getRemainingLineUserIds,
  endAllActiveSessionsForLine,
  updateLineSessionMatrixRoomId,
  updateAllLineSessionsMatrixRoomId,
  getPrivateWireLineInfo,
  getMatrixRoomHomeserverId,
  getActiveBusyPrivateWireIds,
  getActiveSessionUsersByLineIds,
  getActiveLineSipCallId,
};
