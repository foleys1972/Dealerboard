const { pool } = require('./pool');
const logger = require('../utils/logger');

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

    // Dial plan configuration (per country; incoming/outgoing)
    await client.query(`
      CREATE TABLE IF NOT EXISTS countries (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dial_plans (
        id TEXT PRIMARY KEY,
        country_code TEXT NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
        direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
        name TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 1000,
        is_active BOOLEAN NOT NULL DEFAULT true,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dial_plans_country_direction ON dial_plans(country_code, direction);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dial_plan_rules (
        id TEXT PRIMARY KEY,
        dial_plan_id TEXT NOT NULL REFERENCES dial_plans(id) ON DELETE CASCADE,
        pattern TEXT NOT NULL,
        delete_digits INTEGER NOT NULL DEFAULT 0,
        insert_prefix TEXT NOT NULL DEFAULT '',
        priority INTEGER NOT NULL DEFAULT 1000,
        is_active BOOLEAN NOT NULL DEFAULT true,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dial_plan_rules_plan ON dial_plan_rules(dial_plan_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sip_trunks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 5060,
        username TEXT,
        password TEXT,
        domain TEXT,
        label TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sip_routes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        failback_to_primary BOOLEAN NOT NULL DEFAULT true,
        is_active BOOLEAN NOT NULL DEFAULT true,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sip_route_trunks (
        route_id TEXT NOT NULL REFERENCES sip_routes(id) ON DELETE CASCADE,
        trunk_id TEXT NOT NULL REFERENCES sip_trunks(id) ON DELETE CASCADE,
        priority INTEGER NOT NULL DEFAULT 1000,
        PRIMARY KEY (route_id, trunk_id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sip_route_trunks_route ON sip_route_trunks(route_id, priority);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sub_tenants (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        data_region TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sites (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        sub_tenant_id TEXT NOT NULL REFERENCES sub_tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'tenant_id'
        ) THEN
          ALTER TABLE users ADD COLUMN tenant_id TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'sub_tenant_id'
        ) THEN
          ALTER TABLE users ADD COLUMN sub_tenant_id TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'site_id'
        ) THEN
          ALTER TABLE users ADD COLUMN site_id TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'is_public'
        ) THEN
          ALTER TABLE users ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'company_name'
        ) THEN
          ALTER TABLE users ADD COLUMN company_name TEXT;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'country'
        ) THEN
          ALTER TABLE users ADD COLUMN country TEXT;
        END IF;
      END$$;
    `);

    const defaultTenantId = process.env.DEFAULT_TENANT_ID || 'tenant-default';
    const defaultTenantSlug = process.env.DEFAULT_TENANT_SLUG || 'default';
    const defaultSubTenantId = process.env.DEFAULT_SUB_TENANT_ID || 'subtenant-default';
    const defaultSiteId = process.env.DEFAULT_SITE_ID || 'site-default';

    await client.query(
      `INSERT INTO tenants (id, slug, name) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING;`,
      [defaultTenantId, defaultTenantSlug, defaultTenantSlug]
    );

    await client.query(
      `INSERT INTO sub_tenants (id, tenant_id, name, data_region) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING;`,
      [defaultSubTenantId, defaultTenantId, 'Default', process.env.DEFAULT_DATA_REGION || null]
    );

    await client.query(
      `INSERT INTO sites (id, tenant_id, sub_tenant_id, name) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING;`,
      [defaultSiteId, defaultTenantId, defaultSubTenantId, 'Default']
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_relationships (
        id TEXT PRIMARY KEY,
        tenant_a_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
        tenant_b_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected')),
        requested_by_tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
        approved_by_tenant_a_at TIMESTAMPTZ,
        approved_by_tenant_b_at TIMESTAMPTZ,
        capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_a_id, tenant_b_id)
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
        timezone TEXT NOT NULL DEFAULT 'UTC',
        retention_days INTEGER NOT NULL DEFAULT 30,
        voice_retention_days INTEGER,
        voice_vox_silence_seconds INTEGER NOT NULL DEFAULT 10,
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriber_port_allocations (
        subscriber_id TEXT PRIMARY KEY REFERENCES subscribers(id) ON DELETE CASCADE,
        port INTEGER NOT NULL UNIQUE,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        assigned_by TEXT,
        notes TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS location_subscriber_assignments (
        location_id TEXT PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
        primary_subscriber_id TEXT REFERENCES subscribers(id) ON DELETE SET NULL,
        secondary_subscriber_id TEXT REFERENCES subscribers(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by TEXT,
        notes TEXT
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_location_subscriber_assignments_primary
      ON location_subscriber_assignments(primary_subscriber_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_location_subscriber_assignments_secondary
      ON location_subscriber_assignments(secondary_subscriber_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_travel_overrides (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        travel_location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
        starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        force_origin BOOLEAN NOT NULL DEFAULT false,
        reason TEXT,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMPTZ,
        revoked_by TEXT
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_travel_overrides_user_active
      ON user_travel_overrides(user_id, expires_at)
      WHERE revoked_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS publisher_leader_lock (
        lock_id TEXT PRIMARY KEY,
        leader_server_id TEXT NOT NULL,
        leader_name TEXT,
        lease_expires_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS uc_sentinel_outbox (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        event_type TEXT NOT NULL,
        payload JSONB NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_error TEXT
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_uc_sentinel_outbox_next_attempt
      ON uc_sentinel_outbox(next_attempt_at, created_at);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_subscriber_port_allocations_port
      ON subscriber_port_allocations(port);
    `);

    // Add new retention columns to locations table if they don't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'locations' AND column_name = 'region'
        ) THEN
          ALTER TABLE locations ADD COLUMN region TEXT;
        END IF;

        -- Ensure the region constraint exists (legacy DBs may not have it)
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'locations_region_check'
        ) THEN
          ALTER TABLE locations
            ADD CONSTRAINT locations_region_check
            CHECK (region IS NULL OR region IN ('US', 'UK', 'APAC'));
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'locations' AND column_name = 'voice_retention_days'
        ) THEN
          ALTER TABLE locations ADD COLUMN voice_retention_days INTEGER;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'locations' AND column_name = 'timezone'
        ) THEN
          ALTER TABLE locations ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';
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

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'locations' AND column_name = 'voice_vox_silence_seconds'
        ) THEN
          ALTER TABLE locations ADD COLUMN voice_vox_silence_seconds INTEGER NOT NULL DEFAULT 10;
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_settings (
        tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
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
        mode TEXT NOT NULL CHECK (mode IN ('ARD', 'MRD', 'HOOT', 'INTERNAL', 'INTERCOM', 'GROUP', 'BROADCAST')),
        signalling_type TEXT NOT NULL DEFAULT 'MANUAL_RINGDOWN' CHECK (signalling_type IN ('AUTO_RINGDOWN', 'MANUAL_RINGDOWN', 'NONE')),
        subscriber_id TEXT REFERENCES subscribers(id) ON DELETE SET NULL,
        aor TEXT UNIQUE,
        home_subscriber_id TEXT REFERENCES subscribers(id) ON DELETE SET NULL,
        secondary_subscriber_id TEXT REFERENCES subscribers(id) ON DELETE SET NULL,
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
        CHECK (mode IN ('ARD', 'MRD', 'HOOT', 'INTERNAL', 'INTERCOM', 'GROUP', 'BROADCAST'));
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
        -- Add signalling_type column (AUTO_RINGDOWN, MANUAL_RINGDOWN, NONE)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'signalling_type'
        ) THEN
          ALTER TABLE dealerboard_private_wires
            ADD COLUMN signalling_type TEXT NOT NULL DEFAULT 'MANUAL_RINGDOWN'
            CHECK (signalling_type IN ('AUTO_RINGDOWN', 'MANUAL_RINGDOWN', 'NONE'));
        END IF;

        -- Add aor column
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'aor'
        ) THEN
          ALTER TABLE dealerboard_private_wires ADD COLUMN aor TEXT UNIQUE;
        END IF;

        -- Add home_subscriber_id / secondary_subscriber_id
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'home_subscriber_id'
        ) THEN
          ALTER TABLE dealerboard_private_wires ADD COLUMN home_subscriber_id TEXT REFERENCES subscribers(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'dealerboard_private_wires' AND column_name = 'secondary_subscriber_id'
        ) THEN
          ALTER TABLE dealerboard_private_wires ADD COLUMN secondary_subscriber_id TEXT REFERENCES subscribers(id) ON DELETE SET NULL;
        END IF;

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
          ALTER TABLE dealerboard_private_wires ADD COLUMN ring_timeout INTEGER DEFAULT 30;
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

        -- Backfill signalling_type from existing mode for any rows that have not been set
        UPDATE dealerboard_private_wires
        SET signalling_type = CASE
          WHEN mode = 'ARD' THEN 'AUTO_RINGDOWN'
          WHEN mode = 'MRD' THEN 'MANUAL_RINGDOWN'
          WHEN mode IN ('HOOT', 'BROADCAST') THEN 'NONE'
          ELSE signalling_type
        END
        WHERE signalling_type IS NULL
           OR signalling_type NOT IN ('AUTO_RINGDOWN', 'MANUAL_RINGDOWN', 'NONE');
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
        aor TEXT UNIQUE,
        home_subscriber_id TEXT REFERENCES subscribers(id) ON DELETE SET NULL,
        secondary_subscriber_id TEXT REFERENCES subscribers(id) ON DELETE SET NULL,
        ring_timeout INTEGER DEFAULT 30,
        sudo_line_reference TEXT UNIQUE NOT NULL,
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
          WHERE table_name = 'dealerboard_ddi_lines' AND column_name = 'aor'
        ) THEN
          ALTER TABLE dealerboard_ddi_lines ADD COLUMN aor TEXT UNIQUE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'dealerboard_ddi_lines' AND column_name = 'home_subscriber_id'
        ) THEN
          ALTER TABLE dealerboard_ddi_lines ADD COLUMN home_subscriber_id TEXT REFERENCES subscribers(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'dealerboard_ddi_lines' AND column_name = 'secondary_subscriber_id'
        ) THEN
          ALTER TABLE dealerboard_ddi_lines ADD COLUMN secondary_subscriber_id TEXT REFERENCES subscribers(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'dealerboard_ddi_lines' AND column_name = 'ring_timeout'
        ) THEN
          ALTER TABLE dealerboard_ddi_lines ADD COLUMN ring_timeout INTEGER DEFAULT 30;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'dealerboard_ddi_lines' AND column_name = 'country_code'
        ) THEN
          ALTER TABLE dealerboard_ddi_lines ADD COLUMN country_code TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'dealerboard_ddi_lines' AND column_name = 'sip_route_id'
        ) THEN
          ALTER TABLE dealerboard_ddi_lines ADD COLUMN sip_route_id TEXT REFERENCES sip_routes(id) ON DELETE SET NULL;
        END IF;
      END$$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'dial_plan_rules' AND column_name = 'sip_route_id'
        ) THEN
          ALTER TABLE dial_plan_rules ADD COLUMN sip_route_id TEXT REFERENCES sip_routes(id) ON DELETE SET NULL;
        END IF;
      END$$;
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
        page_number INTEGER NOT NULL CHECK (page_number >= 0 AND page_number <= 10),
        button_number INTEGER NOT NULL CHECK (button_number >= 1 AND button_number <= 34),
        assignment_type TEXT NOT NULL CHECK (assignment_type IN ('line', 'speed_dial', 'privateWire', 'ddiLine', 'speedDial', 'broadcast', 'dialTone', 'groupCall', 'directContact', 'viewingKey', 'callForward')),
        line_id TEXT REFERENCES dealerboard_private_wires(id) ON DELETE CASCADE,
        ddi_line_id TEXT REFERENCES dealerboard_ddi_lines(id) ON DELETE CASCADE,
        speed_dial_id TEXT REFERENCES dealerboard_speed_dials(id) ON DELETE CASCADE,
        broadcast_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
        group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
        contact_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, page_number, button_number)
      );
    `);

    // Add broadcast_id/group_id/contact_user_id columns if they don't exist (legacy DBs)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_button_assignments' 
          AND column_name = 'broadcast_id'
        ) THEN
          ALTER TABLE dealerboard_button_assignments 
          ADD COLUMN broadcast_id TEXT REFERENCES groups(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_button_assignments' 
          AND column_name = 'group_id'
        ) THEN
          ALTER TABLE dealerboard_button_assignments 
          ADD COLUMN group_id TEXT REFERENCES groups(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'dealerboard_button_assignments' 
          AND column_name = 'contact_user_id'
        ) THEN
          ALTER TABLE dealerboard_button_assignments 
          ADD COLUMN contact_user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'dealerboard_button_assignments'
          AND column_name = 'metadata'
        ) THEN
          ALTER TABLE dealerboard_button_assignments
          ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
        END IF;
      END$$;
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
        CHECK (assignment_type IN ('line', 'speed_dial', 'privateWire', 'ddiLine', 'speedDial', 'broadcast', 'dialTone', 'groupCall', 'directContact', 'viewingKey', 'callForward'));
      EXCEPTION
        WHEN OTHERS THEN
          -- Constraint might not exist or already updated, ignore
          NULL;
      END$$;
    `);

    // Backfill / normalize AORs to 6-digit numeric AORs (easy to remember).
    // Preserve any previous value in metadata.legacyAor for backwards-compatible resolution.
    const needsAorPw = await client.query(
      `SELECT id, aor, metadata FROM dealerboard_private_wires
       WHERE aor IS NULL OR btrim(aor) = '' OR aor !~ '^[0-9]{6}$'`
    );
    for (const row of (needsAorPw.rows || [])) {
      const legacy = row.aor ? String(row.aor) : null;
      const nextAor = await allocateSixDigitAor(client);
      const meta = (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)) ? { ...row.metadata } : {};
      if (legacy && !/^\d{6}$/.test(legacy)) {
        meta.legacyAor = meta.legacyAor || legacy;
      }
      await client.query(
        `UPDATE dealerboard_private_wires SET aor = $1, metadata = $2, updated_at = NOW() WHERE id = $3`,
        [nextAor, meta, row.id]
      );
    }

    const needsAorDdi = await client.query(
      `SELECT id, aor, metadata FROM dealerboard_ddi_lines
       WHERE aor IS NULL OR btrim(aor) = '' OR aor !~ '^[0-9]{6}$'`
    );
    for (const row of (needsAorDdi.rows || [])) {
      const legacy = row.aor ? String(row.aor) : null;
      const nextAor = await allocateSixDigitAor(client);
      const meta = (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)) ? { ...row.metadata } : {};
      if (legacy && !/^\d{6}$/.test(legacy)) {
        meta.legacyAor = meta.legacyAor || legacy;
      }
      await client.query(
        `UPDATE dealerboard_ddi_lines SET aor = $1, metadata = $2, updated_at = NOW() WHERE id = $3`,
        [nextAor, meta, row.id]
      );
    }

    const needsAorBroadcastGroups = await client.query(
      `SELECT id, metadata FROM groups
       WHERE call_mode = 'broadcast'
         AND (
           (metadata->>'aor') IS NULL OR btrim(metadata->>'aor') = '' OR (metadata->>'aor') !~ '^[0-9]{6}$'
         )`
    );
    for (const row of (needsAorBroadcastGroups.rows || [])) {
      const meta = (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)) ? { ...row.metadata } : {};
      meta.legacyAor = meta.legacyAor || `BCAST:${row.id}`;
      meta.aor = await allocateSixDigitAor(client);
      await client.query(
        `UPDATE groups SET metadata = $1, updated_at = NOW() WHERE id = $2`,
        [meta, row.id]
      );
    }

    // Best-effort: relax legacy check constraints so Intercom can use page_number=0 and button_number up to 34.
    // Older DBs created inline checks with auto-generated names, so we search+drop by matching the constraint definition.
    await client.query(`
      DO $$
      DECLARE
        c RECORD;
      BEGIN
        FOR c IN
          SELECT conname
          FROM pg_constraint
          WHERE conrelid = 'dealerboard_button_assignments'::regclass
            AND contype = 'c'
            AND (
              pg_get_constraintdef(oid) ILIKE '%page_number%'
              OR pg_get_constraintdef(oid) ILIKE '%button_number%'
            )
        LOOP
          EXECUTE format('ALTER TABLE dealerboard_button_assignments DROP CONSTRAINT IF EXISTS %I', c.conname);
        END LOOP;

        ALTER TABLE dealerboard_button_assignments
          ADD CONSTRAINT dealerboard_button_assignments_page_number_check
          CHECK (page_number >= 0 AND page_number <= 10);

        ALTER TABLE dealerboard_button_assignments
          ADD CONSTRAINT dealerboard_button_assignments_button_number_check
          CHECK (button_number >= 1 AND button_number <= 34);
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END$$;
    `);

    // Backfill: if we previously stored groupCall ids into broadcast_id, migrate them to group_id.
    await client.query(`
      UPDATE dealerboard_button_assignments
      SET group_id = broadcast_id
      WHERE assignment_type = 'groupCall'
        AND group_id IS NULL
        AND broadcast_id IS NOT NULL;
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
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMPTZ,
        last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(private_wire_id, user_id, session_type)
      );
    `);

    await client.query(`
      ALTER TABLE dealerboard_line_sessions ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dealerboard_monitor_sessions (
        id TEXT PRIMARY KEY,
        private_wire_id TEXT NOT NULL REFERENCES dealerboard_private_wires(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        matrix_room_id TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dealerboard_monitor_sessions_active
      ON dealerboard_monitor_sessions(private_wire_id, ended_at) WHERE ended_at IS NULL;
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

    // User notifications (missed calls, system alerts, etc.)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT,
        message TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id_created_at
      ON user_notifications(user_id, created_at DESC);
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

    // ==================== HA SITES + FAILOVER ROUTING ====================
    await client.query(`
      CREATE TABLE IF NOT EXISTS ha_service_sites (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ha_site_failover (
        source_site_id TEXT PRIMARY KEY REFERENCES ha_service_sites(id) ON DELETE CASCADE,
        target_site_id TEXT NOT NULL REFERENCES ha_service_sites(id) ON DELETE RESTRICT,
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by TEXT,
        revoked_at TIMESTAMPTZ,
        revoked_by TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ha_site_subscriber_endpoints (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL REFERENCES ha_service_sites(id) ON DELETE CASCADE,
        server_url TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by TEXT,
        UNIQUE(site_id, priority)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ha_site_subscriber_endpoints_site ON ha_site_subscriber_endpoints(site_id);
    `);

    // Seed a default site to keep UI usable in greenfield installs.
    await client.query(`
      INSERT INTO ha_service_sites (id, name, is_active, metadata)
      VALUES ('default', 'Default', true, '{}'::jsonb)
      ON CONFLICT (id) DO NOTHING;
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

module.exports = { initializeDatabase };
