const { pool } = require('../pool');

function mapHaSiteRow(row) {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active === true,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSubscriberEndpointRow(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    serverUrl: row.server_url,
    priority: row.priority,
    isActive: row.is_active,
    notes: row.notes,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function mapFailoverMappingRow(row) {
  return {
    sourceSiteId: row.source_site_id,
    targetSiteId: row.target_site_id,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
  };
}

async function listHaSites() {
  const result = await pool.query(
    `SELECT id, name, is_active, metadata, created_at, updated_at
     FROM ha_service_sites
     ORDER BY id ASC`
  );
  return result.rows;
}

async function getActiveFailoverMappingsForSite(siteId) {
  const result = await pool.query(
    `SELECT source_site_id, target_site_id
     FROM ha_site_failover
     WHERE revoked_at IS NULL AND (source_site_id = $1 OR target_site_id = $1)
     ORDER BY source_site_id ASC`,
    [siteId]
  );
  return result.rows;
}

async function deleteFailoverBySite(siteId) {
  await pool.query(
    `DELETE FROM ha_site_failover
     WHERE source_site_id = $1 OR target_site_id = $1`,
    [siteId]
  );
}

async function deleteSubscriberEndpointsBySite(siteId) {
  await pool.query(
    `DELETE FROM ha_site_subscriber_endpoints
     WHERE site_id = $1`,
    [siteId]
  );
}

async function deleteHaSite(siteId) {
  const result = await pool.query(
    `DELETE FROM ha_service_sites
     WHERE id = $1
     RETURNING id`,
    [siteId]
  );
  return result.rows[0] || null;
}

async function haSiteExists(id) {
  const result = await pool.query(
    `SELECT id FROM ha_service_sites WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows.length > 0;
}

async function insertHaSite(values) {
  const result = await pool.query(
    `INSERT INTO ha_service_sites (id, name, is_active, metadata, created_at, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, NOW(), NOW(), $5)
     RETURNING id, name, is_active, metadata, created_at, updated_at`,
    values
  );
  return result.rows[0];
}

async function updateHaSite(values) {
  const result = await pool.query(
    `UPDATE ha_service_sites
     SET name = COALESCE($2, name),
         is_active = COALESCE($3, is_active),
         metadata = COALESCE($4, metadata),
         updated_at = NOW(),
         updated_by = $5
     WHERE id = $1
     RETURNING id, name, is_active, metadata, created_at, updated_at`,
    values
  );
  return result.rows[0];
}

async function listSubscriberEndpoints(siteId) {
  const result = await pool.query(
    `SELECT id, site_id, server_url, priority, is_active, notes, created_at, created_by, updated_at, updated_by
     FROM ha_site_subscriber_endpoints
     WHERE site_id = $1
     ORDER BY priority ASC`,
    [siteId]
  );
  return result.rows;
}

async function insertSubscriberEndpoint(values) {
  const result = await pool.query(
    `INSERT INTO ha_site_subscriber_endpoints (id, site_id, server_url, priority, is_active, notes, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
     RETURNING id, site_id, server_url, priority, is_active, notes, created_at, created_by, updated_at, updated_by`,
    values
  );
  return result.rows[0];
}

async function updateSubscriberEndpoint(values) {
  const result = await pool.query(
    `UPDATE ha_site_subscriber_endpoints
     SET server_url = COALESCE($4, server_url),
         priority = COALESCE($5, priority),
         is_active = COALESCE($6, is_active),
         notes = COALESCE($7, notes),
         updated_at = NOW(),
         updated_by = $8
     WHERE site_id = $1 AND id = $2
     RETURNING id, site_id, server_url, priority, is_active, notes, created_at, created_by, updated_at, updated_by`,
    values
  );
  return result.rows[0] || null;
}

async function deleteSubscriberEndpoint(siteId, endpointId) {
  const result = await pool.query(
    `DELETE FROM ha_site_subscriber_endpoints
     WHERE site_id = $1 AND id = $2
     RETURNING id`,
    [siteId, endpointId]
  );
  return result.rows[0] || null;
}

async function listActiveFailoverMappings() {
  const result = await pool.query(
    `SELECT source_site_id, target_site_id, reason, created_at, updated_at, updated_by, revoked_at, revoked_by
     FROM ha_site_failover
     WHERE revoked_at IS NULL
     ORDER BY source_site_id ASC`
  );
  return result.rows;
}

async function revokeFailoverBySource(sourceSiteId, updatedBy) {
  await pool.query(
    `UPDATE ha_site_failover
     SET revoked_at = NOW(), revoked_by = $2
     WHERE source_site_id = $1 AND revoked_at IS NULL`,
    [sourceSiteId, updatedBy]
  );
}

async function insertFailoverMapping(values) {
  await pool.query(
    `INSERT INTO ha_site_failover (source_site_id, target_site_id, reason, created_at, updated_at, updated_by)
     VALUES ($1,$2,$3,NOW(),NOW(),$4)`,
    values
  );
}

async function revokeFailoverMapping(sourceSiteId, revokedBy) {
  const result = await pool.query(
    `UPDATE ha_site_failover
     SET revoked_at = NOW(), revoked_by = $2
     WHERE source_site_id = $1 AND revoked_at IS NULL
     RETURNING source_site_id`,
    [sourceSiteId, revokedBy]
  );
  return result.rows[0] || null;
}

module.exports = {
  mapHaSiteRow,
  mapSubscriberEndpointRow,
  mapFailoverMappingRow,
  listHaSites,
  getActiveFailoverMappingsForSite,
  deleteFailoverBySite,
  deleteSubscriberEndpointsBySite,
  deleteHaSite,
  haSiteExists,
  insertHaSite,
  updateHaSite,
  listSubscriberEndpoints,
  insertSubscriberEndpoint,
  updateSubscriberEndpoint,
  deleteSubscriberEndpoint,
  listActiveFailoverMappings,
  revokeFailoverBySource,
  insertFailoverMapping,
  revokeFailoverMapping,
};
