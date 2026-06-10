const { pool } = require('./pool');

async function createRecording(recordingData) {
  const {
    recordingId,
    sessionId,
    callType,
    groupCallMode,
    broadcastMode,
    recordingUserId,
    lineId,
    startTime,
    endTime,
    duration,
    fileUrl,
    fileSize,
    audioFormat,
    participants = [],
    invitedNoAnswer = [],
    topology,
    roomIds = [],
    videoWasEnabled = false,
    captureMethod,
    platform,
    uploaded = false,
    verintSynced = false,
    recordingMetadata = {},
    retentionUntil
  } = recordingData;

  const result = await pool.query(
    `
      INSERT INTO recordings (
        recording_id, session_id, call_type,
        group_call_mode, broadcast_mode,
        recording_user_id, line_id,
        start_time, end_time, duration,
        file_url, file_size, audio_format,
        participants, invited_no_answer,
        topology, room_ids,
        video_was_enabled, capture_method, platform,
        uploaded, verint_synced,
        recording_metadata, retention_until,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, NOW(), NOW()
      )
      RETURNING *;
    `,
    [
      recordingId,
      sessionId,
      callType,
      groupCallMode || null,
      broadcastMode || null,
      recordingUserId,
      lineId || null,
      startTime,
      endTime || null,
      duration || null,
      fileUrl,
      fileSize || null,
      audioFormat || null,
      JSON.stringify(participants),
      JSON.stringify(invitedNoAnswer),
      topology || null,
      JSON.stringify(roomIds),
      videoWasEnabled,
      captureMethod || null,
      platform || null,
      uploaded,
      verintSynced,
      JSON.stringify(recordingMetadata),
      retentionUntil || null
    ]
  );

  return mapRecordingRow(result.rows[0]);
}

async function getRecording(recordingId) {
  const result = await pool.query(
    `
      SELECT *
      FROM recordings
      WHERE recording_id = $1
      LIMIT 1
    `,
    [recordingId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRecordingRow(result.rows[0]);
}

async function updateRecording(recordingId, updates = {}) {
  const allowedFields = {
    sessionId: 'session_id',
    callType: 'call_type',
    groupCallMode: 'group_call_mode',
    broadcastMode: 'broadcast_mode',
    recordingUserId: 'recording_user_id',
    lineId: 'line_id',
    startTime: 'start_time',
    endTime: 'end_time',
    duration: 'duration',
    fileUrl: 'file_url',
    fileSize: 'file_size',
    audioFormat: 'audio_format',
    participants: 'participants',
    invitedNoAnswer: 'invited_no_answer',
    topology: 'topology',
    roomIds: 'room_ids',
    videoWasEnabled: 'video_was_enabled',
    captureMethod: 'capture_method',
    platform: 'platform',
    uploaded: 'uploaded',
    verintSynced: 'verint_synced',
    recordingMetadata: 'recording_metadata',
    retentionUntil: 'retention_until'
  };

  const setClauses = [];
  const values = [];

  Object.entries(allowedFields).forEach(([key, column]) => {
    if (updates[key] !== undefined) {
      let value = updates[key];
      
      // Handle JSONB fields
      if (['participants', 'invitedNoAnswer', 'roomIds', 'recordingMetadata'].includes(key)) {
        value = JSON.stringify(value);
      }
      
      values.push(value);
      setClauses.push(`${column} = $${values.length}`);
    }
  });

  if (setClauses.length === 0) {
    return getRecording(recordingId);
  }

  values.push(recordingId);
  const result = await pool.query(
    `
      UPDATE recordings
      SET ${setClauses.join(', ')},
          updated_at = NOW()
      WHERE recording_id = $${values.length}
      RETURNING *;
    `,
    values
  );

  return mapRecordingRow(result.rows[0]);
}

async function findRecordings(filter = {}) {
  const conditions = [];
  const values = [];
  let paramCount = 1;

  if (filter.sessionId) {
    conditions.push(`session_id = $${paramCount++}`);
    values.push(filter.sessionId);
  }

  if (filter.callType) {
    conditions.push(`call_type = $${paramCount++}`);
    values.push(filter.callType);
  }

  if (filter.recordingUserId) {
    conditions.push(`recording_user_id = $${paramCount++}`);
    values.push(filter.recordingUserId);
  }

  if (filter.lineId) {
    conditions.push(`line_id = $${paramCount++}`);
    values.push(filter.lineId);
  }

  if (filter.groupCallMode) {
    conditions.push(`group_call_mode = $${paramCount++}`);
    values.push(filter.groupCallMode);
  }

  if (filter.broadcastMode) {
    conditions.push(`broadcast_mode = $${paramCount++}`);
    values.push(filter.broadcastMode);
  }

  if (filter.uploaded !== undefined) {
    conditions.push(`uploaded = $${paramCount++}`);
    values.push(filter.uploaded);
  }

  if (filter.verintSynced !== undefined) {
    conditions.push(`verint_synced = $${paramCount++}`);
    values.push(filter.verintSynced);
  }

  if (filter.startTimeFrom) {
    conditions.push(`start_time >= $${paramCount++}`);
    values.push(filter.startTimeFrom);
  }

  if (filter.startTimeTo) {
    conditions.push(`start_time <= $${paramCount++}`);
    values.push(filter.startTimeTo);
  }

  if (filter.platform) {
    conditions.push(`platform = $${paramCount++}`);
    values.push(filter.platform);
  }

  const whereClause = conditions.length > 0 
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const result = await pool.query(
    `
      SELECT *
      FROM recordings
      ${whereClause}
      ORDER BY start_time DESC
      ${filter.limit ? `LIMIT $${paramCount++}` : ''}
    `,
    filter.limit ? [...values, filter.limit] : values
  );

  return result.rows.map(mapRecordingRow);
}

function mapRecordingRow(row) {
  if (!row) return null;

  return {
    recordingId: row.recording_id,
    sessionId: row.session_id,
    callType: row.call_type,
    groupCallMode: row.group_call_mode,
    broadcastMode: row.broadcast_mode,
    recordingUserId: row.recording_user_id,
    lineId: row.line_id,
    startTime: row.start_time,
    endTime: row.end_time,
    duration: row.duration,
    fileUrl: row.file_url,
    fileSize: row.file_size,
    audioFormat: row.audio_format,
    participants: Array.isArray(row.participants) 
      ? row.participants 
      : (row.participants ? JSON.parse(row.participants) : []),
    invitedNoAnswer: Array.isArray(row.invited_no_answer) 
      ? row.invited_no_answer 
      : (row.invited_no_answer ? JSON.parse(row.invited_no_answer) : []),
    topology: row.topology,
    roomIds: Array.isArray(row.room_ids) 
      ? row.room_ids 
      : (row.room_ids ? JSON.parse(row.room_ids) : []),
    videoWasEnabled: row.video_was_enabled,
    captureMethod: row.capture_method,
    platform: row.platform,
    uploaded: row.uploaded,
    verintSynced: row.verint_synced,
    recordingMetadata: row.recording_metadata || {},
    retentionUntil: row.retention_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = {
  createRecording,
  getRecording,
  updateRecording,
  findRecordings,
  mapRecordingRow,
};
