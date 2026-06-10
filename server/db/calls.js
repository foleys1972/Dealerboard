const { pool } = require('./pool');

async function createCallSession(sessionData) {
  const {
    sessionId,
    lineId,
    lineType,
    initiatorUserId,
    groupMode,
    broadcastActivatorUserId,
    broadcastRoomId,
    status = 'pending',
    topologyType,
    participants = [],
    invitedNoAnswer = [],
    rooms = [],
    bridges = [],
    sessionMetadata = {}
  } = sessionData;

  const result = await pool.query(
    `
      INSERT INTO call_sessions (
        session_id, line_id, line_type, initiator_user_id,
        group_mode, first_answerer_user_id,
        broadcast_activator_user_id, broadcast_room_id,
        status, topology_type,
        participants, invited_no_answer,
        rooms, bridges, session_metadata,
        start_time, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, NOW(), NOW(), NOW()
      )
      RETURNING *;
    `,
    [
      sessionId,
      lineId,
      lineType,
      initiatorUserId,
      groupMode || null,
      null, // first_answerer_user_id (set later)
      broadcastActivatorUserId || null,
      broadcastRoomId || null,
      status,
      topologyType || null,
      JSON.stringify(participants),
      JSON.stringify(invitedNoAnswer),
      JSON.stringify(rooms),
      JSON.stringify(bridges),
      JSON.stringify(sessionMetadata)
    ]
  );

  return mapCallSessionRow(result.rows[0]);
}

async function getCallSession(sessionId) {
  const result = await pool.query(
    `
      SELECT *
      FROM call_sessions
      WHERE session_id = $1
      LIMIT 1
    `,
    [sessionId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapCallSessionRow(result.rows[0]);
}

async function updateCallSession(sessionId, updates = {}) {
  const allowedFields = {
    lineId: 'line_id',
    lineType: 'line_type',
    groupMode: 'group_mode',
    firstAnswererUserId: 'first_answerer_user_id',
    broadcastActivatorUserId: 'broadcast_activator_user_id',
    broadcastRoomId: 'broadcast_room_id',
    initiatorUserId: 'initiator_user_id',
    endTime: 'end_time',
    status: 'status',
    topologyType: 'topology_type',
    participants: 'participants',
    invitedNoAnswer: 'invited_no_answer',
    rooms: 'rooms',
    bridges: 'bridges',
    sessionMetadata: 'session_metadata'
  };

  const setClauses = [];
  const values = [];

  Object.entries(allowedFields).forEach(([key, column]) => {
    if (updates[key] !== undefined) {
      let value = updates[key];
      
      // Handle JSONB fields
      if (['participants', 'invitedNoAnswer', 'rooms', 'bridges', 'sessionMetadata'].includes(key)) {
        value = JSON.stringify(value);
      }
      
      values.push(value);
      setClauses.push(`${column} = $${values.length}`);
    }
  });

  if (setClauses.length === 0) {
    return getCallSession(sessionId);
  }

  values.push(sessionId);
  const result = await pool.query(
    `
      UPDATE call_sessions
      SET ${setClauses.join(', ')},
          updated_at = NOW()
      WHERE session_id = $${values.length}
      RETURNING *;
    `,
    values
  );

  return mapCallSessionRow(result.rows[0]);
}

async function findCallSessions(filter = {}) {
  const conditions = [];
  const values = [];
  let paramCount = 1;

  if (filter.lineId) {
    conditions.push(`line_id = $${paramCount++}`);
    values.push(filter.lineId);
  }

  if (filter.lineType) {
    conditions.push(`line_type = $${paramCount++}`);
    values.push(filter.lineType);
  }

  if (filter.initiatorUserId) {
    conditions.push(`initiator_user_id = $${paramCount++}`);
    values.push(filter.initiatorUserId);
  }

  if (filter.status) {
    conditions.push(`status = $${paramCount++}`);
    values.push(filter.status);
  }

  if (filter.groupMode) {
    conditions.push(`group_mode = $${paramCount++}`);
    values.push(filter.groupMode);
  }

  if (filter.startTimeFrom) {
    conditions.push(`start_time >= $${paramCount++}`);
    values.push(filter.startTimeFrom);
  }

  if (filter.startTimeTo) {
    conditions.push(`start_time <= $${paramCount++}`);
    values.push(filter.startTimeTo);
  }

  const whereClause = conditions.length > 0 
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const result = await pool.query(
    `
      SELECT *
      FROM call_sessions
      ${whereClause}
      ORDER BY start_time DESC
      ${filter.limit ? `LIMIT $${paramCount++}` : ''}
    `,
    filter.limit ? [...values, filter.limit] : values
  );

  return result.rows.map(mapCallSessionRow);
}

function mapCallSessionRow(row) {
  if (!row) return null;

  return {
    sessionId: row.session_id,
    lineId: row.line_id,
    lineType: row.line_type,
    groupMode: row.group_mode,
    firstAnswererUserId: row.first_answerer_user_id,
    broadcastActivatorUserId: row.broadcast_activator_user_id,
    broadcastRoomId: row.broadcast_room_id,
    initiatorUserId: row.initiator_user_id,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    topologyType: row.topology_type,
    participants: Array.isArray(row.participants) ? row.participants : (row.participants ? JSON.parse(row.participants) : []),
    invitedNoAnswer: Array.isArray(row.invited_no_answer) ? row.invited_no_answer : (row.invited_no_answer ? JSON.parse(row.invited_no_answer) : []),
    rooms: Array.isArray(row.rooms) ? row.rooms : (row.rooms ? JSON.parse(row.rooms) : []),
    bridges: Array.isArray(row.bridges) ? row.bridges : (row.bridges ? JSON.parse(row.bridges) : []),
    sessionMetadata: row.session_metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = {
  createCallSession,
  getCallSession,
  updateCallSession,
  findCallSessions,
  mapCallSessionRow,
};
