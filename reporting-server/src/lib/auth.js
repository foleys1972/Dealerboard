import { pool } from './db.js';

function parseBearer(req) {
  const h = req.headers?.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] ? m[1].trim() : null;
}

export async function bearerAuth(req, res, next) {
  try {
    const token = parseBearer(req);
    if (!token) {
      return res.status(401).json({ ok: false, error: 'missing_bearer_token' });
    }

    const result = await pool.query(
      `
        SELECT id, tenant_id, location_id, subscriber_id, token, is_active, allowed_event_types
        FROM reporting_ingest_tokens
        WHERE token = $1
        LIMIT 1
      `,
      [token]
    );

    const row = result.rows[0];
    if (!row || row.is_active !== true) {
      return res.status(403).json({ ok: false, error: 'invalid_token' });
    }

    req.reportingAuth = {
      tokenId: row.id,
      tenantId: row.tenant_id || null,
      locationId: row.location_id || null,
      subscriberId: row.subscriber_id || null,
      allowedEventTypes: Array.isArray(row.allowed_event_types) ? row.allowed_event_types : [],
    };

    return next();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'auth_failed' });
  }
}

export function isAllowed(req, eventType) {
  const allowed = req.reportingAuth?.allowedEventTypes || [];
  if (!allowed.length) return true;
  return allowed.includes(eventType);
}


