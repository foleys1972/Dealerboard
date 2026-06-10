const { pool } = require('../pool');

async function listSipRoutes({ activeOnly = false } = {}) {
  const where = activeOnly ? 'WHERE r.is_active = true' : '';
  const result = await pool.query(
    `SELECT r.id, r.name, r.failback_to_primary, r.is_active, r.metadata, r.created_at, r.updated_at
     FROM sip_routes r
     ${where}
     ORDER BY r.name ASC, r.created_at ASC`,
  );
  return result.rows;
}

async function getSipRouteById(id) {
  const result = await pool.query(
    `SELECT id, name, failback_to_primary, is_active, metadata, created_at, updated_at
     FROM sip_routes WHERE id = $1`,
    [String(id)],
  );
  return result.rows[0] || null;
}

async function upsertSipRoute(values) {
  await pool.query(
    `INSERT INTO sip_routes (id, name, failback_to_primary, is_active, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       failback_to_primary = EXCLUDED.failback_to_primary,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()`,
    values,
  );
}

async function deleteSipRouteById(id) {
  await pool.query('DELETE FROM sip_routes WHERE id = $1', [String(id)]);
}

async function listRouteTrunks(routeId) {
  const result = await pool.query(
    `SELECT rt.route_id, rt.trunk_id, rt.priority,
            t.name, t.host, t.port, t.username, t.password, t.domain, t.label, t.is_active
     FROM sip_route_trunks rt
     INNER JOIN sip_trunks t ON t.id = rt.trunk_id
     WHERE rt.route_id = $1
     ORDER BY rt.priority ASC, t.name ASC`,
    [String(routeId)],
  );
  return result.rows;
}

async function replaceRouteTrunks(routeId, trunkEntries) {
  await pool.query('DELETE FROM sip_route_trunks WHERE route_id = $1', [String(routeId)]);
  for (const entry of trunkEntries || []) {
    await pool.query(
      `INSERT INTO sip_route_trunks (route_id, trunk_id, priority)
       VALUES ($1, $2, $3)`,
      [String(routeId), String(entry.trunkId), entry.priority ?? 1000],
    );
  }
}

function mapSipRouteRow(row, trunks = []) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name,
    failbackToPrimary: row.failback_to_primary !== false,
    isActive: row.is_active !== false,
    metadata: row.metadata || {},
    trunks: trunks.map((t) => ({
      trunkId: String(t.trunk_id),
      priority: t.priority,
      name: t.name,
      host: t.host,
      port: t.port,
      username: t.username || '',
      domain: t.domain || '',
      label: t.label || '',
      isActive: t.is_active !== false,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  listSipRoutes,
  getSipRouteById,
  upsertSipRoute,
  deleteSipRouteById,
  listRouteTrunks,
  replaceRouteTrunks,
  mapSipRouteRow,
};
