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
        call_mode TEXT DEFAULT 'REMAIN_GROUP' CHECK (call_mode IN ('FIRST_ANSWER', 'REMAIN_GROUP', 'conference', 'broadcast')),
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
          ALTER TABLE groups ADD COLUMN call_mode TEXT DEFAULT 'REMAIN_GROUP' CHECK (call_mode IN ('FIRST_ANSWER', 'REMAIN_GROUP', 'conference', 'broadcast'));
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
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'region'
        ) THEN
          ALTER TABLE users ADD COLUMN region TEXT CHECK (region IN ('US', 'UK', 'APAC'));
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
        region TEXT CHECK (region IN ('US', 'UK', 'APAC')),
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

    // Dealerboard tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS dealerboard_private_wires (
        id TEXT PRIMARY KEY,
        uri_address TEXT NOT NULL,
        sbc_details JSONB NOT NULL DEFAULT '{}'::jsonb,
        line_label TEXT NOT NULL,
        circuit_number TEXT,
        mode TEXT NOT NULL CHECK (mode IN ('ARD', 'MRD', 'HOOT', 'INTERCOM', 'GROUP', 'BROADCAST')),
        subscriber_id TEXT REFERENCES subscribers(id) ON DELETE SET NULL,
        external_community_id TEXT,
        external_community_name TEXT,
        is_external_community BOOLEAN NOT NULL DEFAULT false,
        sudo_line_reference TEXT UNIQUE NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Update mode constraint to include GROUP and BROADCAST if needed
    await client.query(`
      DO $$
      BEGIN
        -- Drop old constraint if it exists and doesn't include GROUP/BROADCAST
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'dealerboard_private_wires_mode_check'
        ) THEN
          ALTER TABLE dealerboard_private_wires 
          DROP CONSTRAINT IF EXISTS dealerboard_private_wires_mode_check;
        END IF;
        
        -- Add updated constraint with all modes
        ALTER TABLE dealerboard_private_wires 
        ADD CONSTRAINT dealerboard_private_wires_mode_check 
        CHECK (mode IN ('ARD', 'MRD', 'HOOT', 'INTERCOM', 'GROUP', 'BROADCAST'));
      EXCEPTION
        WHEN duplicate_object THEN
          -- Constraint already exists with correct values, ignore
          NULL;
      END$$;
    `);

    // Add new columns for line configuration (spec section 14.1)
    await client.query(`
      DO $$
      BEGIN
        -- Add line_type column (INTERCOM, GROUP, BROADCAST, ARD, MRD)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'line_type'
        ) THEN
          ALTER TABLE dealerboard_private_wires ADD COLUMN line_type TEXT CHECK (line_type IN ('INTERCOM', 'GROUP', 'BROADCAST', 'ARD', 'MRD'));
        END IF;
        
        -- Add group_mode column (FIRST_ANSWER, REMAIN_GROUP)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'group_mode'
        ) THEN
          ALTER TABLE dealerboard_private_wires ADD COLUMN group_mode TEXT CHECK (group_mode IN ('FIRST_ANSWER', 'REMAIN_GROUP'));
        END IF;
        
        -- Add broadcast_mode column (PTT, OPEN_MIC)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'broadcast_mode'
        ) THEN
          ALTER TABLE dealerboard_private_wires ADD COLUMN broadcast_mode TEXT CHECK (broadcast_mode IN ('PTT', 'OPEN_MIC'));
        END IF;
        
        -- Add call_timeout column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'call_timeout'
        ) THEN
          ALTER TABLE dealerboard_private_wires ADD COLUMN call_timeout INTEGER DEFAULT 30;
        END IF;
        
        -- Add ring_timeout column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'ring_timeout'
        ) THEN
          ALTER TABLE dealerboard_private_wires ADD COLUMN ring_timeout INTEGER DEFAULT 60;
        END IF;
        
        -- Add authorized_initiators column (JSONB array of user IDs)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'authorized_initiators'
        ) THEN
          ALTER TABLE dealerboard_private_wires ADD COLUMN authorized_initiators JSONB DEFAULT '[]'::jsonb;
        END IF;
        
        -- Add target_participants column (JSONB array of user IDs)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'target_participants'
        ) THEN
          ALTER TABLE dealerboard_private_wires ADD COLUMN target_participants JSONB DEFAULT '[]'::jsonb;
        END IF;
        
        -- Add priority column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'priority'
        ) THEN
          ALTER TABLE dealerboard_private_wires ADD COLUMN priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'urgent'));
        END IF;
        
        -- Add allow_video column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'allow_video'
        ) THEN
          ALTER TABLE dealerboard_private_wires ADD COLUMN allow_video BOOLEAN DEFAULT false;
        END IF;
        
        -- Add persistent_room_id column (for broadcasts)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'persistent_room_id'
        ) THEN
          ALTER TABLE dealerboard_private_wires ADD COLUMN persistent_room_id TEXT;
        END IF;
        
        -- Add recording_required column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'recording_required'
        ) THEN
          ALTER TABLE dealerboard_private_wires ADD COLUMN recording_required BOOLEAN DEFAULT true;
        END IF;
        
        -- Add retention_years column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'retention_years'
        ) THEN
          ALTER TABLE dealerboard_private_wires ADD COLUMN retention_years INTEGER DEFAULT 7;
        END IF;
      END$$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dealerboard_ddi_lines (
        id TEXT PRIMARY KEY,
        line_number TEXT NOT NULL,
        line_name TEXT NOT NULL,
        sbc_details JSONB NOT NULL DEFAULT '{}'::jsonb,
        connection_details JSONB NOT NULL DEFAULT '{}'::jsonb,
        subscriber_id TEXT REFERENCES subscribers(id) ON DELETE SET NULL,
        sudo_line_reference TEXT UNIQUE NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dealerboard_speed_dials (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        number TEXT NOT NULL,
        description TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dealerboard_button_assignments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        page_number INTEGER NOT NULL CHECK (page_number >= 1 AND page_number <= 10),
        button_number INTEGER NOT NULL CHECK (button_number >= 1 AND button_number <= 28),
        assignment_type TEXT NOT NULL CHECK (assignment_type IN ('line', 'speed_dial', 'privateWire', 'ddiLine', 'speedDial')),
        line_id TEXT REFERENCES dealerboard_private_wires(id) ON DELETE CASCADE,
        ddi_line_id TEXT REFERENCES dealerboard_ddi_lines(id) ON DELETE CASCADE,
        speed_dial_id TEXT REFERENCES dealerboard_speed_dials(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, page_number, button_number)
      );
    `);

    // Update constraint if it exists with old values
    await client.query(`
      DO $$
      BEGIN
        -- Try to alter the constraint if it exists
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'dealerboard_button_assignments_assignment_type_check'
        ) THEN
          ALTER TABLE dealerboard_button_assignments 
          DROP CONSTRAINT IF EXISTS dealerboard_button_assignments_assignment_type_check;
        END IF;
        
        ALTER TABLE dealerboard_button_assignments 
        ADD CONSTRAINT dealerboard_button_assignments_assignment_type_check 
        CHECK (assignment_type IN ('line', 'speed_dial', 'privateWire', 'ddiLine', 'speedDial'));
      EXCEPTION
        WHEN OTHERS THEN
          -- Constraint might not exist or already updated, ignore
          NULL;
      END$$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dealerboard_user_preferences (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        audible_ringing BOOLEAN NOT NULL DEFAULT true,
        button_colors JSONB NOT NULL DEFAULT '{}'::jsonb,
        preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
        default_ddi_line_id TEXT REFERENCES dealerboard_ddi_lines(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dealerboard_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dealerboard_group_members (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL REFERENCES dealerboard_groups(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(group_id, user_id)
      );
    `);

    // Matrix homeservers table (managed by subscribers)
    await client.query(`
      CREATE TABLE IF NOT EXISTS matrix_homeservers (
        id TEXT PRIMARY KEY,
        subscriber_id TEXT REFERENCES subscribers(id) ON DELETE CASCADE,
        region TEXT NOT NULL CHECK (region IN ('US', 'UK', 'APAC')),
        server_name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        federation_url TEXT,
        is_self_hosted BOOLEAN NOT NULL DEFAULT true,
        external_provider TEXT,
        location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        capacity INTEGER NOT NULL DEFAULT 1000,
        current_load INTEGER NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Matrix room assignments (which homeserver a room is on)
    await client.query(`
      CREATE TABLE IF NOT EXISTS matrix_room_assignments (
        room_id TEXT PRIMARY KEY,
        homeserver_id TEXT NOT NULL REFERENCES matrix_homeservers(id) ON DELETE CASCADE,
        region TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // User homeserver assignments
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_homeserver_assignments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        homeserver_id TEXT NOT NULL REFERENCES matrix_homeservers(id) ON DELETE CASCADE,
        is_primary BOOLEAN NOT NULL DEFAULT true,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, homeserver_id)
      );
    `);

    // Matrix room participants (cross-region tracking)
    await client.query(`
      CREATE TABLE IF NOT EXISTS matrix_room_participants (
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        homeserver_id TEXT NOT NULL REFERENCES matrix_homeservers(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (room_id, user_id)
      );
    `);

    // Orchestrator configuration
    await client.query(`
      CREATE TABLE IF NOT EXISTS orchestrator_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dealerboard_private_wires_subscriber ON dealerboard_private_wires(subscriber_id);
    `);

    // Add external community columns if they don't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'external_community_id'
        ) THEN
          ALTER TABLE dealerboard_private_wires ADD COLUMN external_community_id TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'external_community_name'
        ) THEN
          ALTER TABLE dealerboard_private_wires ADD COLUMN external_community_name TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'is_external_community'
        ) THEN
          ALTER TABLE dealerboard_private_wires ADD COLUMN is_external_community BOOLEAN NOT NULL DEFAULT false;
        END IF;
      END$$;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dealerboard_ddi_lines_subscriber ON dealerboard_ddi_lines(subscriber_id);
    `);

    // Line sessions for private wires (tracks who is monitoring or actively using which line)
    await client.query(`
      CREATE TABLE IF NOT EXISTS dealerboard_line_sessions (
        id TEXT PRIMARY KEY,
        private_wire_id TEXT NOT NULL REFERENCES dealerboard_private_wires(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_type TEXT NOT NULL CHECK (session_type IN ('monitor', 'active')),
        matrix_room_id TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMPTZ,
        last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(private_wire_id, user_id, session_type)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dealerboard_line_sessions_wire ON dealerboard_line_sessions(private_wire_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dealerboard_line_sessions_user ON dealerboard_line_sessions(user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dealerboard_line_sessions_room ON dealerboard_line_sessions(matrix_room_id) WHERE matrix_room_id IS NOT NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dealerboard_line_sessions_active ON dealerboard_line_sessions(private_wire_id, session_type, ended_at) WHERE ended_at IS NULL;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dealerboard_speed_dials_user ON dealerboard_speed_dials(user_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dealerboard_assignments_user ON dealerboard_button_assignments(user_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dealerboard_assignments_page ON dealerboard_button_assignments(user_id, page_number);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dealerboard_group_members_group ON dealerboard_group_members(group_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dealerboard_group_members_user ON dealerboard_group_members(user_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_matrix_homeservers_subscriber ON matrix_homeservers(subscriber_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_matrix_homeservers_region ON matrix_homeservers(region);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_matrix_room_assignments_homeserver ON matrix_room_assignments(homeserver_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_homeserver_assignments_user ON user_homeserver_assignments(user_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_homeserver_assignments_homeserver ON user_homeserver_assignments(homeserver_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_matrix_room_participants_room ON matrix_room_participants(room_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_matrix_room_participants_user ON matrix_room_participants(user_id);
    `);

    // Create call_sessions table (spec section 14.2)
    await client.query(`
      CREATE TABLE IF NOT EXISTS call_sessions (
        session_id TEXT PRIMARY KEY,
        line_id TEXT NOT NULL,
        line_type TEXT NOT NULL CHECK (line_type IN ('INTERCOM', 'GROUP', 'BROADCAST', 'ARD', 'MRD', 'ZOOM', 'TEAMS')),
        
        -- Group call specific
        group_mode TEXT CHECK (group_mode IN ('FIRST_ANSWER', 'REMAIN_GROUP')),
        first_answerer_user_id TEXT,
        
        -- Broadcast specific
        broadcast_activator_user_id TEXT,
        broadcast_room_id TEXT,
        
        -- Common
        initiator_user_id TEXT NOT NULL,
        start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        end_time TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'ended', 'cancelled', 'timeout')),
        
        topology_type TEXT CHECK (topology_type IN ('P2P', 'single-room', 'dual-room-bridge', 'broadcast')),
        
        participants JSONB DEFAULT '[]'::jsonb,
        invited_no_answer JSONB DEFAULT '[]'::jsonb,
        
        rooms JSONB DEFAULT '[]'::jsonb,
        bridges JSONB DEFAULT '[]'::jsonb,
        
        -- Metadata
        session_metadata JSONB DEFAULT '{}'::jsonb,
        
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_call_sessions_line_id ON call_sessions(line_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_call_sessions_initiator ON call_sessions(initiator_user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_call_sessions_start_time ON call_sessions(start_time);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_call_sessions_status ON call_sessions(status);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_call_sessions_line_type ON call_sessions(line_type);
    `);

    // Create recordings table (spec section 14.3)
    await client.query(`
      CREATE TABLE IF NOT EXISTS recordings (
        recording_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        call_type TEXT NOT NULL CHECK (call_type IN ('intercom', 'group-call', 'broadcast', 'ard', 'mrd', 'zoom', 'teams')),
        
        -- Group call specific
        group_call_mode TEXT CHECK (group_call_mode IN ('FIRST_ANSWER', 'REMAIN_GROUP')),
        
        -- Broadcast specific
        broadcast_mode TEXT CHECK (broadcast_mode IN ('PTT', 'OPEN_MIC')),
        
        recording_user_id TEXT NOT NULL,
        line_id TEXT,
        
        start_time TIMESTAMPTZ NOT NULL,
        end_time TIMESTAMPTZ,
        duration INTEGER,  -- seconds
        
        file_url TEXT NOT NULL,
        file_size BIGINT,
        audio_format TEXT,
        
        participants JSONB DEFAULT '[]'::jsonb,
        invited_no_answer JSONB DEFAULT '[]'::jsonb,  -- For group calls
        
        topology TEXT,
        room_ids JSONB DEFAULT '[]'::jsonb,
        
        video_was_enabled BOOLEAN DEFAULT false,
        capture_method TEXT CHECK (capture_method IN ('webrtc', 'getDisplayMedia')),
        
        platform TEXT CHECK (platform IN ('matrix', 'zoom', 'teams')),
        
        uploaded BOOLEAN DEFAULT false,
        verint_synced BOOLEAN DEFAULT false,
        
        -- Metadata
        recording_metadata JSONB DEFAULT '{}'::jsonb,
        
        -- Compliance
        retention_until TIMESTAMPTZ,
        
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_recordings_session_id ON recordings(session_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_recordings_recording_user ON recordings(recording_user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_recordings_start_time ON recordings(start_time);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_recordings_call_type ON recordings(call_type);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_recordings_uploaded ON recordings(uploaded);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_recordings_verint_synced ON recordings(verint_synced);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_recordings_retention_until ON recordings(retention_until);
    `);

    // Add default_ddi_line_id column to dealerboard_user_preferences if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_user_preferences' AND column_name = 'default_ddi_line_id'
        ) THEN
          ALTER TABLE dealerboard_user_preferences ADD COLUMN default_ddi_line_id TEXT REFERENCES dealerboard_ddi_lines(id) ON DELETE SET NULL;
        END IF;
      END$$;
    `);

    // Zoom integration tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS zoom_user_credentials (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        zoom_user_id TEXT,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        token_expires_at TIMESTAMPTZ NOT NULL,
        auth_type TEXT NOT NULL DEFAULT 'oauth' CHECK (auth_type IN ('oauth', 'direct')),
        api_key TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Add auth_type and api_key columns if they don't exist (for existing installations)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'zoom_user_credentials' AND column_name = 'auth_type'
        ) THEN
          ALTER TABLE zoom_user_credentials ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'oauth' CHECK (auth_type IN ('oauth', 'direct'));
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'zoom_user_credentials' AND column_name = 'api_key'
        ) THEN
          ALTER TABLE zoom_user_credentials ADD COLUMN api_key TEXT;
        END IF;
      END$$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS zoom_oauth_states (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        state_token TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS zoom_meetings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        zoom_meeting_id TEXT NOT NULL,
        topic TEXT,
        start_time TIMESTAMPTZ,
        duration INTEGER,
        join_url TEXT,
        start_url TEXT,
        password TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(zoom_meeting_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS zoom_matrix_bridges (
        id TEXT PRIMARY KEY,
        zoom_meeting_id TEXT NOT NULL,
        matrix_room_id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(zoom_meeting_id, matrix_room_id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_zoom_meetings_user ON zoom_meetings(user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_zoom_matrix_bridges_meeting ON zoom_matrix_bridges(zoom_meeting_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_zoom_matrix_bridges_room ON zoom_matrix_bridges(matrix_room_id);
    `);

    // Microsoft Teams integration tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS teams_user_credentials (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        teams_user_id TEXT,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        token_expires_at TIMESTAMPTZ NOT NULL,
        auth_type TEXT NOT NULL DEFAULT 'oauth' CHECK (auth_type IN ('oauth')),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS teams_oauth_states (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        state_token TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS teams_meetings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        teams_meeting_id TEXT NOT NULL,
        subject TEXT,
        start_time TIMESTAMPTZ,
        end_time TIMESTAMPTZ,
        join_url TEXT,
        join_web_url TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(teams_meeting_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS teams_matrix_bridges (
        id TEXT PRIMARY KEY,
        teams_meeting_id TEXT NOT NULL,
        matrix_room_id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(teams_meeting_id, matrix_room_id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_teams_meetings_user ON teams_meetings(user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_teams_matrix_bridges_meeting ON teams_matrix_bridges(teams_meeting_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_teams_matrix_bridges_room ON teams_matrix_bridges(matrix_room_id);
    `);

    // Add zoom_enabled and teams_enabled columns to users table
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'zoom_enabled'
        ) THEN
          ALTER TABLE users ADD COLUMN zoom_enabled BOOLEAN NOT NULL DEFAULT false;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'teams_enabled'
        ) THEN
          ALTER TABLE users ADD COLUMN teams_enabled BOOLEAN NOT NULL DEFAULT false;
        END IF;
      END$$;
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

// Helper function to parse JSONB fields safely
function parseJsonbField(value, fieldName) {
  try {
    if (!value) return {};
    if (typeof value === 'string') {
      return JSON.parse(value);
    }
    return value || {};
  } catch (e) {
    logger.warn(`Error parsing ${fieldName} JSONB:`, e);
    return {};
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
    // Handle JSONB fields - pg library should parse them, but ensure they're objects
    settings: parseJsonbField(row.settings, 'settings'),
    capabilities: parseJsonbField(row.capabilities, 'capabilities'),
    status: row.status,
    statusMessage: row.status_message,
    extension: row.extension,
    sipUri: row.sip_uri,
    employeeId: row.employee_id,
    department: row.department,
    // Convert zoom_enabled to boolean, defaulting to false if null/undefined
    zoomEnabled: row.zoom_enabled != null ? (row.zoom_enabled === true || row.zoom_enabled === 1 || row.zoom_enabled === 'true' || row.zoom_enabled === '1') : false,
    // Convert teams_enabled to boolean, defaulting to false if null/undefined
    teamsEnabled: row.teams_enabled != null ? (row.teams_enabled === true || row.teams_enabled === 1 || row.teams_enabled === 'true' || row.teams_enabled === '1') : false,
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

async function getUserByUsername(username) {
  if (!username) return null;
  
  const result = await pool.query(
    `
      SELECT *
      FROM users
      WHERE username = $1
      LIMIT 1
    `,
    [username]
  );

  return mapUserRow(result.rows[0]);
}

// Get user by either ID or username
async function getUserByIdOrUsername(identifier) {
  if (!identifier) {
    logger.warn('getUserByIdOrUsername called with null/undefined identifier');
    return null;
  }
  
  try {
    logger.info(`getUserByIdOrUsername: Looking up user with identifier: ${identifier}`);
    // Try by username first (more common), then by ID
    const result = await pool.query(
      `
        SELECT *
        FROM users
        WHERE username = $1 OR id = $1
        LIMIT 1
      `,
      [identifier]
    );

    if (!result.rows || result.rows.length === 0) {
      logger.warn(`getUserByIdOrUsername: No user found with identifier: ${identifier}`);
      return null;
    }

    logger.info(`getUserByIdOrUsername: Found user: ${result.rows[0].username} (DB ID: ${result.rows[0].id})`);
    const user = mapUserRow(result.rows[0]);
    if (!user) {
      logger.error(`getUserByIdOrUsername: mapUserRow returned null for identifier: ${identifier}`);
      return null;
    }
    return user;
  } catch (error) {
    logger.error(`getUserByIdOrUsername error for identifier "${identifier}":`, error);
    logger.error('Error message:', error.message);
    logger.error('Error stack:', error.stack);
    throw error;
  }
}

// Update user status (online/offline)
async function updateUserStatus(userIdOrUsername, status) {
  const client = await pool.connect();
  try {
    // Find user by ID or username
    const user = await getUserByIdOrUsername(userIdOrUsername);
    if (!user) {
      throw new Error(`User not found: ${userIdOrUsername}`);
    }
    
    await client.query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, user.id]
    );
    
    logger.info(`Updated user ${userIdOrUsername} status to ${status}`);
    return true;
  } catch (error) {
    logger.error('Failed to update user status:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function updateUser(userIdOrUsername, updates = {}) {
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
    zoomEnabled: 'zoom_enabled',
    teamsEnabled: 'teams_enabled',
  };

  const setClauses = [];
  const values = [];

  Object.entries(allowedFields).forEach(([key, column]) => {
    if (updates[key] !== undefined) {
      let value = updates[key];
      // Handle JSONB fields (settings, capabilities)
      if (column === 'settings' || column === 'capabilities') {
        if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        }
        values.push(value);
        setClauses.push(`${column} = $${values.length}::jsonb`);
      } else {
        values.push(value);
        setClauses.push(`${column} = $${values.length}`);
      }
    }
  });

  if (setClauses.length === 0) {
    return getUserByIdOrUsername(userIdOrUsername);
  }

  // First, get the user to find their actual database ID
  const user = await getUserByIdOrUsername(userIdOrUsername);
  if (!user) {
    throw new Error(`User not found: ${userIdOrUsername}`);
  }

  // Log what we're about to update
  logger.info(`updateUser: Updating user ${userIdOrUsername} (DB ID: ${user.id})`, {
    updateFields: Object.keys(updates).filter(key => updates[key] !== undefined),
    setClausesCount: setClauses.length,
    valuesCount: values.length
  });

  // Use the actual database ID for the UPDATE query
  values.push(user.id);
  const whereParamIndex = values.length;
  
  const query = `
    UPDATE users
    SET ${setClauses.join(', ')},
        updated_at = NOW()
    WHERE id = $${whereParamIndex}
    RETURNING *;
  `;
  
  try {
    logger.info(`updateUser: Executing query with ${values.length} parameters`);
    const result = await pool.query(query, values);
    
    if (!result.rows || result.rows.length === 0) {
      throw new Error(`User update failed: no rows returned for user ${userIdOrUsername} (DB ID: ${user.id})`);
    }
    
    logger.info(`updateUser: Successfully updated user ${userIdOrUsername}`);
    return mapUserRow(result.rows[0]);
  } catch (error) {
    // Log the actual SQL query and values for debugging
    logger.error('updateUser SQL error:', {
      query,
      values: values.map((v, i) => ({ 
        param: i + 1, 
        value: typeof v === 'object' ? JSON.stringify(v).substring(0, 100) : v,
        type: typeof v
      })),
      error: error.message,
      stack: error.stack,
      userIdOrUsername,
      userDbId: user.id,
      setClauses: setClauses,
      whereParamIndex: whereParamIndex
    });
    throw error;
  }
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

// ============================================================================
// Call Session Helper Functions
// ============================================================================

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

// ============================================================================
// Line Configuration Helper Functions
// ============================================================================

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

// ============================================================================
// Recording Helper Functions
// ============================================================================

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
  pool,
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
  // Call session functions
  createCallSession,
  getCallSession,
  updateCallSession,
  findCallSessions,
  // Line configuration functions
  getLineConfiguration,
  updateLineConfiguration,
  findLineConfigurations,
  // Recording functions
  createRecording,
  getRecording,
  updateRecording,
  findRecordings,
  getUserByUsername,
  getUserByIdOrUsername,
  updateUserStatus,
};

