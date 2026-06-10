import express from 'express';

import { pool } from '../lib/db.js';

export const ingestRouter = express.Router();

function isAllowed(req, eventType) {
  const allowed = req.sentinelAuth?.allowedEventTypes || [];
  if (!allowed.length) return true;
  return allowed.includes(eventType);
}

async function insertEvent({
  table,
  req,
  eventType,
  payload,
}) {
  const auth = req.sentinelAuth;

  const result = await pool.query(
    `INSERT INTO ${table}
      (tenant_id, location_id, subscriber_id, token_id, event_type, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, created_at`,
    [
      auth.tenantId,
      auth.locationId,
      auth.subscriberId,
      auth.tokenId,
      eventType,
      payload,
    ]
  );

  return result.rows[0];
}

ingestRouter.post('/audit', async (req, res) => {
  if (!isAllowed(req, 'audit')) {
    return res.status(403).json({ ok: false, error: 'event_type_not_allowed' });
  }

  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ ok: false, error: 'invalid_payload' });
  }

  try {
    const row = await insertEvent({
      table: 'sentinel_audit_events',
      req,
      eventType: 'audit',
      payload,
    });

    return res.json({ ok: true, id: row.id, createdAt: row.created_at });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'ingest_failed' });
  }
});

ingestRouter.post('/alerts', async (req, res) => {
  if (!isAllowed(req, 'alert')) {
    return res.status(403).json({ ok: false, error: 'event_type_not_allowed' });
  }

  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ ok: false, error: 'invalid_payload' });
  }

  try {
    const row = await insertEvent({
      table: 'sentinel_alert_events',
      req,
      eventType: 'alert',
      payload,
    });

    return res.json({ ok: true, id: row.id, createdAt: row.created_at });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'ingest_failed' });
  }
});

ingestRouter.post('/health', async (req, res) => {
  if (!isAllowed(req, 'health')) {
    return res.status(403).json({ ok: false, error: 'event_type_not_allowed' });
  }

  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ ok: false, error: 'invalid_payload' });
  }

  try {
    const row = await insertEvent({
      table: 'sentinel_health_events',
      req,
      eventType: 'health',
      payload,
    });

    return res.json({ ok: true, id: row.id, createdAt: row.created_at });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'ingest_failed' });
  }
});
