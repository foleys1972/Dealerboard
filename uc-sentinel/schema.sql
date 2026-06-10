CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sentinel_subscriber_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  tenant_id UUID NOT NULL,
  location_id UUID NOT NULL,
  subscriber_id UUID NOT NULL,

  token TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  allowed_event_types TEXT[]
);

CREATE TABLE IF NOT EXISTS sentinel_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  tenant_id UUID NOT NULL,
  location_id UUID NOT NULL,
  subscriber_id UUID NOT NULL,
  token_id UUID NOT NULL REFERENCES sentinel_subscriber_tokens(id),

  event_type TEXT NOT NULL,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS sentinel_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  tenant_id UUID NOT NULL,
  location_id UUID NOT NULL,
  subscriber_id UUID NOT NULL,
  token_id UUID NOT NULL REFERENCES sentinel_subscriber_tokens(id),

  event_type TEXT NOT NULL,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS sentinel_health_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  tenant_id UUID NOT NULL,
  location_id UUID NOT NULL,
  subscriber_id UUID NOT NULL,
  token_id UUID NOT NULL REFERENCES sentinel_subscriber_tokens(id),

  event_type TEXT NOT NULL,
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS sentinel_audit_events_tenant_location_created_idx
  ON sentinel_audit_events (tenant_id, location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sentinel_alert_events_tenant_location_created_idx
  ON sentinel_alert_events (tenant_id, location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sentinel_health_events_tenant_location_created_idx
  ON sentinel_health_events (tenant_id, location_id, created_at DESC);
