const { pool } = require('./pool');

async function getLineConfiguration(lineId) {
  const result = await pool.query(
    `
      SELECT *
      FROM dealerboard_private_wires
      WHERE id = $1
      LIMIT 1
    `,
    [lineId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapLineConfigurationRow(result.rows[0]);
}

async function updateLineConfiguration(lineId, config = {}) {
  const allowedFields = {
    lineType: 'line_type',
    groupMode: 'group_mode',
    broadcastMode: 'broadcast_mode',
    callTimeout: 'call_timeout',
    ringTimeout: 'ring_timeout',
    authorizedInitiators: 'authorized_initiators',
    targetParticipants: 'target_participants',
    priority: 'priority',
    allowVideo: 'allow_video',
    persistentRoomId: 'persistent_room_id',
    recordingRequired: 'recording_required',
    retentionYears: 'retention_years',
    lineLabel: 'line_label',
    isActive: 'is_active',
    metadata: 'metadata'
  };

  const setClauses = [];
  const values = [];

  Object.entries(allowedFields).forEach(([key, column]) => {
    if (config[key] !== undefined) {
      let value = config[key];
      
      // Handle JSONB fields
      if (['authorizedInitiators', 'targetParticipants', 'metadata'].includes(key)) {
        value = JSON.stringify(value);
      }
      
      values.push(value);
      setClauses.push(`${column} = $${values.length}`);
    }
  });

  if (setClauses.length === 0) {
    return getLineConfiguration(lineId);
  }

  values.push(lineId);
  const result = await pool.query(
    `
      UPDATE dealerboard_private_wires
      SET ${setClauses.join(', ')},
          updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING *;
    `,
    values
  );

  return mapLineConfigurationRow(result.rows[0]);
}

async function findLineConfigurations(filter = {}) {
  const conditions = [];
  const values = [];
  let paramCount = 1;

  if (filter.lineType) {
    conditions.push(`line_type = $${paramCount++}`);
    values.push(filter.lineType);
  }

  if (filter.groupMode) {
    conditions.push(`group_mode = $${paramCount++}`);
    values.push(filter.groupMode);
  }

  if (filter.broadcastMode) {
    conditions.push(`broadcast_mode = $${paramCount++}`);
    values.push(filter.broadcastMode);
  }

  if (filter.isActive !== undefined) {
    conditions.push(`is_active = $${paramCount++}`);
    values.push(filter.isActive);
  }

  if (filter.subscriberId) {
    conditions.push(`subscriber_id = $${paramCount++}`);
    values.push(filter.subscriberId);
  }

  const whereClause = conditions.length > 0 
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const result = await pool.query(
    `
      SELECT *
      FROM dealerboard_private_wires
      ${whereClause}
      ORDER BY created_at DESC
      ${filter.limit ? `LIMIT $${paramCount++}` : ''}
    `,
    filter.limit ? [...values, filter.limit] : values
  );

  return result.rows.map(mapLineConfigurationRow);
}

function mapLineConfigurationRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    uriAddress: row.uri_address,
    sbcDetails: row.sbc_details || {},
    lineLabel: row.line_label,
    circuitNumber: row.circuit_number,
    mode: row.mode,
    subscriberId: row.subscriber_id,
    externalCommunityId: row.external_community_id,
    externalCommunityName: row.external_community_name,
    isExternalCommunity: row.is_external_community,
    sudoLineReference: row.sudo_line_reference,
    isActive: row.is_active,
    // New fields from spec
    lineType: row.line_type,
    groupMode: row.group_mode,
    broadcastMode: row.broadcast_mode,
    callTimeout: row.call_timeout,
    ringTimeout: row.ring_timeout,
    authorizedInitiators: Array.isArray(row.authorized_initiators) 
      ? row.authorized_initiators 
      : (row.authorized_initiators ? JSON.parse(row.authorized_initiators) : []),
    targetParticipants: Array.isArray(row.target_participants) 
      ? row.target_participants 
      : (row.target_participants ? JSON.parse(row.target_participants) : []),
    priority: row.priority,
    allowVideo: row.allow_video,
    persistentRoomId: row.persistent_room_id,
    recordingRequired: row.recording_required,
    retentionYears: row.retention_years,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = {
  getLineConfiguration,
  updateLineConfiguration,
  findLineConfigurations,
  mapLineConfigurationRow,
};
