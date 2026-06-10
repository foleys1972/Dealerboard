const { pool } = require('./pool');
const logger = require('../utils/logger');
const { allocateSixDigitAor } = require('./aor');
const { normalizeCallModeForDb } = require('../utils/groupCallMode');
const { getUserByIdOrUsername } = require('./users');

function mapGroupRow(row, participants = []) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    callMode: row.call_mode || 'REMAIN_GROUP',
    isPublic: row.is_public,
    maxParticipants: row.max_participants,
    allowRecording: row.allow_recording,
    pushToTalk: row.push_to_talk,
    createdBy: row.created_by,
    sipEnabled: row.sip_enabled,
    sipNumbers: row.sip_numbers || [],
    retentionPolicy: row.retention_policy || {},
    hootConfig: row.hoot_config || {},
    matrixRoomId: row.matrix_room_id,
    isActive: row.is_active,
    metadata: row.metadata || {},
    participants,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDirectContactRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    contactUserId: row.contact_user_id,
    displayName: row.display_name,
    uri: row.uri,
    extension: row.extension,
    metadata: row.metadata || {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getParticipantsForGroups(groupIds) {
  if (!groupIds || groupIds.length === 0) {
    return new Map();
  }

  const result = await pool.query(
    `
      SELECT group_id, user_id
      FROM group_participants
      WHERE group_id = ANY($1)
      ORDER BY joined_at ASC
    `,
    [groupIds]
  );

  const participantMap = new Map();
  for (const row of result.rows) {
    if (!participantMap.has(row.group_id)) {
      participantMap.set(row.group_id, []);
    }
    participantMap.get(row.group_id).push(row.user_id);
  }

  return participantMap;
}

async function createGroup(group) {
  const now = new Date();
  group.callMode = normalizeCallModeForDb(group.callMode);

  // For broadcast groups, allocate a 6-digit internal AOR (easy to remember).
  // Keep a legacy "BCAST:<id>" string for backwards-compatible resolution if needed.
  const callMode = String(group.callMode || '').toLowerCase();
  if (callMode === 'broadcast') {
    const meta = (group.metadata && typeof group.metadata === 'object' && !Array.isArray(group.metadata))
      ? { ...group.metadata }
      : {};

    if (!meta.aor || !/^\d{6}$/.test(String(meta.aor))) {
      meta.legacyAor = meta.legacyAor || `BCAST:${group.id}`;
      meta.aor = await allocateSixDigitAor(pool);
    }

    group.metadata = meta;
  }

  const result = await pool.query(
    `
      INSERT INTO groups (
        id, name, description, type, call_mode, is_public, max_participants, allow_recording,
        push_to_talk, created_by, sip_enabled, sip_numbers, retention_policy,
        hoot_config, matrix_room_id, is_active, metadata, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, COALESCE($6, false), COALESCE($7, 200), COALESCE($8, true),
        COALESCE($9, false), $10, COALESCE($11, false), $12, $13,
        $14, $15, COALESCE($16, true), COALESCE($17, '{}'::jsonb), COALESCE($18, NOW()), COALESCE($19, NOW())
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        type = EXCLUDED.type,
        call_mode = EXCLUDED.call_mode,
        is_public = EXCLUDED.is_public,
        max_participants = EXCLUDED.max_participants,
        allow_recording = EXCLUDED.allow_recording,
        push_to_talk = EXCLUDED.push_to_talk,
        created_by = EXCLUDED.created_by,
        sip_enabled = EXCLUDED.sip_enabled,
        sip_numbers = EXCLUDED.sip_numbers,
        retention_policy = EXCLUDED.retention_policy,
        hoot_config = EXCLUDED.hoot_config,
        matrix_room_id = EXCLUDED.matrix_room_id,
        is_active = EXCLUDED.is_active,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *;
    `,
    [
      group.id,
      group.name,
      group.description || '',
      group.type || 'trading',
      group.callMode || 'REMAIN_GROUP',
      group.isPublic,
      group.maxParticipants,
      group.allowRecording,
      group.pushToTalk,
      group.createdBy,
      group.sipEnabled,
      group.sipNumbers || [],
      group.retentionPolicy || {},
      group.hootConfig || {},
      group.matrixRoomId || null,
      group.isActive,
      group.metadata || {},
      group.createdAt || now,
      group.updatedAt || now,
    ]
  );

  if (Array.isArray(group.participants) && group.participants.length > 0) {
    const values = [];
    const inserts = [];
    group.participants.forEach((participantId, index) => {
      values.push(group.id, participantId);
      inserts.push(`($${values.length - 1}, $${values.length})`);
    });

    await pool.query(
      `
        INSERT INTO group_participants (group_id, user_id)
        VALUES ${inserts.join(', ')}
        ON CONFLICT DO NOTHING
      `,
      values
    );
  }

  const participants = Array.isArray(group.participants) ? group.participants : [];
  return mapGroupRow(result.rows[0], participants);
}

async function findGroups(filter = {}) {
  const conditions = [];
  const values = [];

  if (filter.id) {
    values.push(filter.id);
    conditions.push(`id = $${values.length}`);
  }
  if (filter.createdBy) {
    values.push(filter.createdBy);
    conditions.push(`created_by = $${values.length}`);
  }
  if (typeof filter.isActive === 'boolean') {
    values.push(filter.isActive);
    conditions.push(`is_active = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `
      SELECT *
      FROM groups
      ${whereClause}
      ORDER BY created_at DESC
    `,
    values
  );

  const groupRows = result.rows;
  const participantMap = await getParticipantsForGroups(groupRows.map((group) => group.id));

  return groupRows.map((row) => mapGroupRow(row, participantMap.get(row.id) || []));
}

async function getGroupById(groupId) {
  const result = await pool.query(
    `
      SELECT *
      FROM groups
      WHERE id = $1
      LIMIT 1
    `,
    [groupId]
  );

  const participants = await getParticipantsForGroups([groupId]);
  return mapGroupRow(result.rows[0], participants.get(groupId) || []);
}

async function updateGroup(groupId, updates = {}) {
  const allowedFields = {
    name: 'name',
    description: 'description',
    type: 'type',
    callMode: 'call_mode',
    isPublic: 'is_public',
    maxParticipants: 'max_participants',
    allowRecording: 'allow_recording',
    pushToTalk: 'push_to_talk',
    createdBy: 'created_by',
    sipEnabled: 'sip_enabled',
    sipNumbers: 'sip_numbers',
    retentionPolicy: 'retention_policy',
    hootConfig: 'hoot_config',
    matrixRoomId: 'matrix_room_id',
    isActive: 'is_active',
    metadata: 'metadata',
  };

  const setClauses = [];
  const values = [];

  Object.entries(allowedFields).forEach(([key, column]) => {
    if (updates[key] !== undefined) {
      const value = key === 'callMode' ? normalizeCallModeForDb(updates[key]) : updates[key];
      values.push(value);
      setClauses.push(`${column} = $${values.length}`);
    }
  });

  if (setClauses.length === 0) {
    return getGroupById(groupId);
  }

  values.push(groupId);
  const result = await pool.query(
    `
      UPDATE groups
      SET ${setClauses.join(', ')},
          updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING *;
    `,
    values
  );

  const participants = await getParticipantsForGroups([groupId]);
  return mapGroupRow(result.rows[0], participants.get(groupId) || []);
}

async function addUserToGroup(groupId, userId) {
  await pool.query(
    `
      INSERT INTO group_participants (group_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `,
    [groupId, userId]
  );
}

async function removeUserFromGroup(groupId, userId) {
  await pool.query(
    `
      DELETE FROM group_participants
      WHERE group_id = $1 AND user_id = $2
    `,
    [groupId, userId]
  );
}

async function createDirectContact(contact) {
  const now = new Date();

  const owner = await getUserByIdOrUsername(contact.ownerId);
  if (!owner?.id) {
    throw new Error(`Direct contact owner not found: ${contact.ownerId}`);
  }

  let contactUserId = contact.contactUserId || null;
  if (contactUserId) {
    const contactUser = await getUserByIdOrUsername(contactUserId);
    if (contactUser?.id) {
      contactUserId = contactUser.id;
    }
  }

  const result = await pool.query(
    `
      INSERT INTO direct_contacts (
        id, owner_id, contact_user_id, display_name, uri, extension,
        metadata, created_by, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, COALESCE($9, NOW()), COALESCE($10, NOW())
      )
      RETURNING *;
    `,
    [
      contact.id,
      owner.id,
      contactUserId || null,
      contact.displayName,
      contact.uri || null,
      contact.extension || null,
      contact.metadata || {},
      contact.createdBy || contact.ownerId,
      contact.createdAt || now,
      contact.updatedAt || now,
    ]
  );

  return mapDirectContactRow(result.rows[0]);
}

async function findDirectContacts(ownerId) {
  const owner = await getUserByIdOrUsername(ownerId);
  if (!owner?.id) {
    return [];
  }
  const result = await pool.query(
    `
      SELECT *
      FROM direct_contacts
      WHERE owner_id = $1
      ORDER BY display_name ASC
    `,
    [owner.id]
  );

  return result.rows.map(mapDirectContactRow);
}

async function getDirectContactById(contactId) {
  const result = await pool.query(
    `
      SELECT *
      FROM direct_contacts
      WHERE id = $1
      LIMIT 1
    `,
    [contactId]
  );

  return mapDirectContactRow(result.rows[0]);
}

async function deleteDirectContact(contactId) {
  await pool.query(
    `
      DELETE FROM direct_contacts
      WHERE id = $1
    `,
    [contactId]
  );
}

module.exports = {
  mapGroupRow,
  mapDirectContactRow,
  getParticipantsForGroups,
  createGroup,
  findGroups,
  getGroupById,
  updateGroup,
  addUserToGroup,
  removeUserFromGroup,
  createDirectContact,
  findDirectContacts,
  getDirectContactById,
  deleteDirectContact,
};
