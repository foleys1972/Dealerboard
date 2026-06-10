import express from 'express';

import { pool } from '../lib/db.js';

export const queryRouter = express.Router();

queryRouter.get('/audit', async (req, res) => {
  const auth = req.sentinelAuth;

  const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);

  try {
    const result = await pool.query(
      `SELECT id, created_at, subscriber_id, payload
       FROM sentinel_audit_events
       WHERE tenant_id = $1
         AND location_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [auth.tenantId, auth.locationId, limit]
    );

    return res.json({ ok: true, items: result.rows });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'query_failed' });
  }
});
