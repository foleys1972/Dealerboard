CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Ingestion auth tokens (subscriber/node -> reporting server)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reporting_ingest_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  tenant_id TEXT,
  location_id TEXT,
  subscriber_id TEXT,

  token TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  allowed_event_types TEXT[]
);

-- ---------------------------------------------------------------------------
-- Calls (call logging)
-- Key: call_reference (should be callId / instant-* id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reporting_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  tenant_id TEXT,
  location_id TEXT,
  subscriber_id TEXT,
  token_id UUID REFERENCES reporting_ingest_tokens(id),

  call_reference TEXT NOT NULL UNIQUE,

  initiator_user_id TEXT,
  direction TEXT,
  line_id TEXT,
  session_id TEXT,
  group_id TEXT,

  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_ms BIGINT,

  expected_recording_count INTEGER NOT NULL DEFAULT 1,

  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS reporting_calls_tenant_location_time_idx
  ON reporting_calls (tenant_id, location_id, started_at DESC NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS reporting_calls_call_reference_idx
  ON reporting_calls (call_reference);

-- ---------------------------------------------------------------------------
-- Recordings (recording assurance)
-- Key: recording_reference (recordingId or stable unique id from sender)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reporting_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  tenant_id TEXT,
  location_id TEXT,
  subscriber_id TEXT,
  token_id UUID REFERENCES reporting_ingest_tokens(id),

  recording_reference TEXT NOT NULL UNIQUE,
  call_reference TEXT,

  storage_uri TEXT,
  sha256 TEXT,
  size_bytes BIGINT,
  codec TEXT,
  sample_rate INTEGER,

  recorded_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('expected', 'present', 'missing', 'corrupt', 'archived')),

  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS reporting_recordings_call_reference_idx
  ON reporting_recordings (call_reference);

-- ---------------------------------------------------------------------------
-- Reconciliation / audit timeline (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reporting_reconciliation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  tenant_id TEXT,
  location_id TEXT,
  subscriber_id TEXT,
  token_id UUID REFERENCES reporting_ingest_tokens(id),

  call_reference TEXT,
  recording_reference TEXT,

  type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS reporting_reconciliation_events_call_reference_idx
  ON reporting_reconciliation_events (call_reference, created_at DESC);


