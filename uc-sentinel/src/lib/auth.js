import { pool } from './db.js';

export async function bearerAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const match = /^Bearer\s+(.+)$/.exec(header);

    if (!match) {
      return res.status(401).json({ ok: false, error: 'missing_bearer_token' });
    }

    const token = match[1];

    const result = await pool.query(
      `SELECT
         t.id AS token_id,
         t.subscriber_id,
         t.tenant_id,
         t.location_id,
         t.is_active,
         t.allowed_event_types
       FROM sentinel_subscriber_tokens t
       WHERE t.token = $1
       LIMIT 1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'invalid_token' });
    }

    const row = result.rows[0];
    if (!row.is_active) {
      return res.status(403).json({ ok: false, error: 'token_disabled' });
    }

    req.sentinelAuth = {
      tokenId: row.token_id,
      subscriberId: row.subscriber_id,
      tenantId: row.tenant_id,
      locationId: row.location_id,
      allowedEventTypes: Array.isArray(row.allowed_event_types) ? row.allowed_event_types : [],
    };

    return next();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'auth_error' });
  }
}
