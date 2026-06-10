const crypto = require('crypto');
const {
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
} = require('../../db/platformAdmin/haSites');
const { PlatformAdminError } = require('./errors');

function mapPgDuplicateError(error) {
  if (error && (error.code === '23505' || error.code === 23505)) {
    throw new PlatformAdminError(409, 'Duplicate priority for this site (priority must be unique per site)');
  }
  throw error;
}

async function listSites() {
  const rows = await listHaSites();
  return { success: true, sites: rows.map(mapHaSiteRow) };
}

function getHaStatus(subscriberHaService) {
  if (!subscriberHaService || typeof subscriberHaService.getStatus !== 'function') {
    return { success: true, status: { enabled: false, reason: 'subscriberHaService not initialized' } };
  }
  return { success: true, status: subscriberHaService.getStatus() };
}

async function deleteSite(siteId, { force, updatedBy }) {
  const id = String(siteId || '').trim();
  if (!id) throw new PlatformAdminError(400, 'siteId is required');

  const mappings = await getActiveFailoverMappingsForSite(id);
  if (!force && mappings.length > 0) {
    throw new PlatformAdminError(
      409,
      'Site is referenced by active failover mappings. Revoke mappings first or use force=true.',
      undefined,
      { mappings: mappings.map((r) => ({ sourceSiteId: r.source_site_id, targetSiteId: r.target_site_id })) }
    );
  }

  await deleteFailoverBySite(id);
  await deleteSubscriberEndpointsBySite(id);

  const deleted = await deleteHaSite(id);
  if (!deleted) throw new PlatformAdminError(404, 'Site not found');

  return { success: true, deleted: { siteId: id, deletedBy: updatedBy } };
}

async function upsertSite(body, updatedBy) {
  const id = body?.id ? String(body.id).trim() : '';
  if (!id) throw new PlatformAdminError(400, 'id is required');

  const name = body?.name !== undefined ? String(body.name || '').trim() : null;
  const isActive = body?.isActive !== undefined ? (body.isActive === true) : null;
  const metadata = body?.metadata !== undefined ? (body.metadata || {}) : null;

  if (!(await haSiteExists(id))) {
    const row = await insertHaSite([
      id,
      name || id,
      isActive === null ? true : isActive,
      metadata ? JSON.stringify(metadata) : JSON.stringify({}),
      updatedBy,
    ]);
    return { status: 201, body: { success: true, site: mapHaSiteRow(row) } };
  }

  const row = await updateHaSite([
    id,
    name,
    isActive,
    metadata ? JSON.stringify(metadata) : null,
    updatedBy,
  ]);
  return { status: 200, body: { success: true, site: mapHaSiteRow(row) } };
}

async function listSiteSubscriberEndpoints(siteId) {
  const id = String(siteId || '').trim();
  if (!id) throw new PlatformAdminError(400, 'siteId is required');

  const rows = await listSubscriberEndpoints(id);
  return { success: true, siteId: id, endpoints: rows.map(mapSubscriberEndpointRow) };
}

async function createSubscriberEndpoint(siteId, body, updatedBy) {
  const id = String(siteId || '').trim();
  if (!id) throw new PlatformAdminError(400, 'siteId is required');

  const serverUrl = body?.serverUrl ? String(body.serverUrl).trim() : '';
  const priority = body?.priority !== undefined ? Number(body.priority) : 0;
  const isActive = body?.isActive !== undefined ? (body.isActive === true) : true;
  const notes = body?.notes !== undefined ? String(body.notes || '') : null;

  if (!serverUrl) throw new PlatformAdminError(400, 'serverUrl is required');
  if (!Number.isFinite(priority)) throw new PlatformAdminError(400, 'priority must be a number');

  const endpointId = `ha_site_ep_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  try {
    const row = await insertSubscriberEndpoint([
      endpointId, id, serverUrl, priority, isActive, notes, updatedBy,
    ]);
    return { status: 201, body: { success: true, endpoint: mapSubscriberEndpointRow(row) } };
  } catch (error) {
    mapPgDuplicateError(error);
  }
}

async function updateSubscriberEndpointRecord(siteId, endpointId, body, updatedBy) {
  const sid = String(siteId || '').trim();
  const eid = String(endpointId || '').trim();
  if (!sid) throw new PlatformAdminError(400, 'siteId is required');
  if (!eid) throw new PlatformAdminError(400, 'endpointId is required');

  const serverUrl = body?.serverUrl !== undefined ? String(body.serverUrl || '').trim() : null;
  const priority = body?.priority !== undefined ? Number(body.priority) : null;
  const isActive = body?.isActive !== undefined ? (body.isActive === true) : null;
  const notes = body?.notes !== undefined ? String(body.notes || '') : null;
  if (priority !== null && !Number.isFinite(priority)) {
    throw new PlatformAdminError(400, 'priority must be a number');
  }

  try {
    const row = await updateSubscriberEndpoint([
      sid, eid, null, serverUrl, priority, isActive, notes, updatedBy,
    ]);
    if (!row) throw new PlatformAdminError(404, 'Endpoint not found');
    return { success: true, endpoint: mapSubscriberEndpointRow(row) };
  } catch (error) {
    if (error instanceof PlatformAdminError) throw error;
    mapPgDuplicateError(error);
  }
}

async function deleteSubscriberEndpointRecord(siteId, endpointId) {
  const sid = String(siteId || '').trim();
  const eid = String(endpointId || '').trim();
  if (!sid) throw new PlatformAdminError(400, 'siteId is required');
  if (!eid) throw new PlatformAdminError(400, 'endpointId is required');

  const deleted = await deleteSubscriberEndpoint(sid, eid);
  if (!deleted) throw new PlatformAdminError(404, 'Endpoint not found');
  return { success: true };
}

async function listFailoverMappings() {
  const rows = await listActiveFailoverMappings();
  return { success: true, mappings: rows.map(mapFailoverMappingRow) };
}

async function setFailoverMapping(body, updatedBy) {
  const sourceSiteId = body?.sourceSiteId ? String(body.sourceSiteId).trim() : '';
  const targetSiteId = body?.targetSiteId ? String(body.targetSiteId).trim() : '';
  const reason = body?.reason !== undefined ? String(body.reason || '') : null;

  if (!sourceSiteId) throw new PlatformAdminError(400, 'sourceSiteId is required');
  if (!targetSiteId) throw new PlatformAdminError(400, 'targetSiteId is required');
  if (sourceSiteId === targetSiteId) {
    throw new PlatformAdminError(400, 'sourceSiteId and targetSiteId must be different');
  }

  await revokeFailoverBySource(sourceSiteId, updatedBy);
  await insertFailoverMapping([sourceSiteId, targetSiteId, reason, updatedBy]);

  return {
    status: 201,
    body: {
      success: true,
      mapping: { sourceSiteId, targetSiteId, reason, updatedBy },
    },
  };
}

async function revokeFailoverMappingBySource(sourceSiteId, revokedBy) {
  const id = sourceSiteId ? String(sourceSiteId).trim() : '';
  if (!id) throw new PlatformAdminError(400, 'sourceSiteId is required');

  const revoked = await revokeFailoverMapping(id, revokedBy);
  if (!revoked) throw new PlatformAdminError(404, 'Mapping not found');
  return { success: true };
}

module.exports = {
  listSites,
  getHaStatus,
  deleteSite,
  upsertSite,
  listSiteSubscriberEndpoints,
  createSubscriberEndpoint,
  updateSubscriberEndpointRecord,
  deleteSubscriberEndpointRecord,
  listFailoverMappings,
  setFailoverMapping,
  revokeFailoverMappingBySource,
};
