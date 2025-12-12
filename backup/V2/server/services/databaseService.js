const { Pool } = require('pg');
const logger = require('../utils/logger');

const DEFAULT_CONFIG = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'trading_intercom',
  user: process.env.POSTGRES_USER || 'intercom_app',
  password: process.env.POSTGRES_PASSWORD || 'intercom',
  ssl: parseBoolean(process.env.POSTGRES_SSL || 'false') ? {
    rejectUnauthorized: false,
  } : undefined,
};

const pool = new Pool(DEFAULT_CONFIG);

pool.on('error', (error) => {
  logger.error('Unexpected Postgres error', error);
});

function parseBoolean(value) {
  if (!value) return false;
  return value === true || value.toString().toLowerCase() === 'true';
}

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        first_name TEXT,
        last_name TEXT,
        display_name TEXT,
        password TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        is_active BOOLEAN NOT NULL DEFAULT true,
        source TEXT DEFAULT 'local',
        settings JSONB NOT NULL DEFAULT '{}'::jsonb,
        capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT DEFAULT 'offline',
        status_message TEXT,
        extension TEXT,
        sip_uri TEXT,
        employee_id TEXT,
        department TEXT,
        location_id TEXT,
        last_login TIMESTAMPTZ,
        last_active TIMESTAMPTZ,
        matrix_user_id TEXT,
        last_matrix_sync TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT DEFAULT 'trading',
        call_mode TEXT DEFAULT 'conference',
        is_public BOOLEAN NOT NULL DEFAULT false,
        max_participants INTEGER NOT NULL DEFAULT 200,
        allow_recording BOOLEAN NOT NULL DEFAULT true,
        push_to_talk BOOLEAN NOT NULL DEFAULT false,
        created_by TEXT,
        sip_enabled BOOLEAN NOT NULL DEFAULT false,
        sip_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
        retention_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
        hoot_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        matrix_room_id TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'groups' AND column_name = 'call_mode'
        ) THEN
          ALTER TABLE groups ADD COLUMN call_mode TEXT DEFAULT 'conference';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'groups' AND column_name = 'hoot_config'
        ) THEN
          ALTER TABLE groups ADD COLUMN hoot_config JSONB NOT NULL DEFAULT '{}'::jsonb;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'location_id'
        ) THEN
          ALTER TABLE users ADD COLUMN location_id TEXT;
        END IF;
      END$$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS group_participants (
        group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (group_id, user_id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_groups_type ON groups(type);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_groups_call_mode ON groups(call_mode);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_group_participants_user ON group_participants(user_id);
    `);

    // Locations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        retention_days INTEGER NOT NULL DEFAULT 30,
        voice_retention_days INTEGER,
        messaging_retention_days INTEGER,
        data_retention_days INTEGER,
        legal_hold BOOLEAN NOT NULL DEFAULT false,
        sftp_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS subscribers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        server_url TEXT NOT NULL,
        server_id TEXT NOT NULL UNIQUE,
        location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
        connection_port INTEGER NOT NULL DEFAULT 3002,
        status TEXT NOT NULL DEFAULT 'disconnected',
        last_connected TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT true,
        auth_token TEXT NOT NULL,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Add new retention columns to locations table if they don't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'locations' AND column_name = 'voice_retention_days'
        ) THEN
          ALTER TABLE locations ADD COLUMN voice_retention_days INTEGER;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'locations' AND column_name = 'messaging_retention_days'
        ) THEN
          ALTER TABLE locations ADD COLUMN messaging_retention_days INTEGER;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'locations' AND column_name = 'data_retention_days'
        ) THEN
          ALTER TABLE locations ADD COLUMN data_retention_days INTEGER;
        END IF;
      END$$;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS direct_contacts (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        contact_user_id TEXT,
        display_name TEXT NOT NULL,
        uri TEXT,
        extension TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_direct_contacts_owner ON direct_contacts(owner_id);
    `);

    // System settings table for global configuration
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id TEXT PRIMARY KEY DEFAULT 'global',
        settings JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by TEXT
      );
    `);

    // Matrix chat rooms table (for standalone chat rooms, not tied to groups)
    await client.query(`
      CREATE TABLE IF NOT EXISTS matrix_chat_rooms (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
        created_by TEXT NOT NULL,
        members TEXT[] NOT NULL DEFAULT '{}',
        last_activity TIMESTAMPTZ,
        is_archived BOOLEAN NOT NULL DEFAULT false,
        archived_at TIMESTAMPTZ,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_matrix_chat_rooms_room_id ON matrix_chat_rooms(room_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_matrix_chat_rooms_created_by ON matrix_chat_rooms(created_by);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_matrix_chat_rooms_last_activity ON matrix_chat_rooms(last_activity);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_matrix_chat_rooms_is_archived ON matrix_chat_rooms(is_archived);
    `);

    await client.query('COMMIT');
    logger.info('Postgres database ready');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to initialize Postgres database', error);
    throw error;
  } finally {
    client.release();
  }
}

function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: row.display_name,
    password: row.password,
    role: row.role,
    isActive: row.is_active,
    source: row.source,
    settings: row.settings || {},
    capabilities: row.capabilities || {},
    status: row.status,
    statusMessage: row.status_message,
    extension: row.extension,
    sipUri: row.sip_uri,
    employeeId: row.employee_id,
    department: row.department,
    lastLogin: row.last_login,
    lastActive: row.last_active,
    matrixUserId: row.matrix_user_id,
    lastMatrixSync: row.last_matrix_sync,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapGroupRow(row, participants = []) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    callMode: row.call_mode || 'conference',
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

async function createUser(user) {
  const now = new Date();
  const result = await pool.query(
    `
      INSERT INTO users (
        id, username, email, first_name, last_name, display_name, password,
        role, is_active, source, settings, capabilities, status, status_message,
        extension, sip_uri, employee_id, department, last_login, last_active,
        matrix_user_id, last_matrix_sync, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, COALESCE($9, true), $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20,
        $21, $22, COALESCE($23, NOW()), $24
      )
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        display_name = EXCLUDED.display_name,
        password = EXCLUDED.password,
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active,
        source = EXCLUDED.source,
        settings = EXCLUDED.settings,
        capabilities = EXCLUDED.capabilities,
        status = EXCLUDED.status,
        status_message = EXCLUDED.status_message,
        extension = EXCLUDED.extension,
        sip_uri = EXCLUDED.sip_uri,
        employee_id = EXCLUDED.employee_id,
        department = EXCLUDED.department,
        last_login = EXCLUDED.last_login,
        last_active = EXCLUDED.last_active,
        matrix_user_id = EXCLUDED.matrix_user_id,
        last_matrix_sync = EXCLUDED.last_matrix_sync,
        updated_at = NOW()
      RETURNING *;
    `,
    [
      user.id,
      user.username,
      user.email,
      user.firstName,
      user.lastName,
      user.displayName,
      user.password,
      user.role || 'user',
      user.isActive,
      user.source || 'local',
      user.settings || {},
      user.capabilities || {},
      user.status || 'offline',
      user.statusMessage || null,
      user.extension || null,
      user.sipUri || null,
      user.employeeId || null,
      user.department || null,
      user.lastLogin || null,
      user.lastActive || null,
      user.matrixUserId || null,
      user.lastMatrixSync || null,
      user.createdAt || now,
      user.updatedAt || now,
    ]
  );

  return mapUserRow(result.rows[0]);
}

async function findUsers(filter = {}) {
  const conditions = [];
  const values = [];

  if (filter.id) {
    values.push(filter.id);
    conditions.push(`id = $${values.length}`);
  }
  if (filter.username) {
    values.push(filter.username);
    conditions.push(`username = $${values.length}`);
  }
  if (filter.role) {
    values.push(filter.role);
    conditions.push(`role = $${values.length}`);
  }
  if (typeof filter.isActive === 'boolean') {
    values.push(filter.isActive);
    conditions.push(`is_active = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `
      SELECT *
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
    `,
    values
  );

  return result.rows.map(mapUserRow);
}

async function getUserById(userId) {
  const result = await pool.query(
    `
      SELECT *
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  return mapUserRow(result.rows[0]);
}

async function updateUser(userId, updates = {}) {
  const allowedFields = {
    username: 'username',
    email: 'email',
    firstName: 'first_name',
    lastName: 'last_name',
    displayName: 'display_name',
    password: 'password',
    role: 'role',
    isActive: 'is_active',
    source: 'source',
    settings: 'settings',
    capabilities: 'capabilities',
    status: 'status',
    statusMessage: 'status_message',
    extension: 'extension',
    sipUri: 'sip_uri',
    employeeId: 'employee_id',
    department: 'department',
    lastLogin: 'last_login',
    lastActive: 'last_active',
    matrixUserId: 'matrix_user_id',
    lastMatrixSync: 'last_matrix_sync',
  };

  const setClauses = [];
  const values = [];

  Object.entries(allowedFields).forEach(([key, column]) => {
    if (updates[key] !== undefined) {
      values.push(updates[key]);
      setClauses.push(`${column} = $${values.length}`);
    }
  });

  if (setClauses.length === 0) {
    return getUserById(userId);
  }

  values.push(userId);
  const result = await pool.query(
    `
      UPDATE users
      SET ${setClauses.join(', ')},
          updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING *;
    `,
    values
  );

  return mapUserRow(result.rows[0]);
}

async function deleteUser(userId) {
  await pool.query(
    `
      DELETE FROM users
      WHERE id = $1
    `,
    [userId]
  );
}

async function createGroup(group) {
  const now = new Date();
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
      group.callMode || 'conference',
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
      values.push(updates[key]);
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
      contact.ownerId,
      contact.contactUserId || null,
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
  const result = await pool.query(
    `
      SELECT *
      FROM direct_contacts
      WHERE owner_id = $1
      ORDER BY display_name ASC
    `,
    [ownerId]
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
  initializeDatabase,
  createUser,
  findUsers,
  getUserById,
  updateUser,
  deleteUser,
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

