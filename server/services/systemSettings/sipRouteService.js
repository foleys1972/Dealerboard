const crypto = require('crypto');
const {
  listSipRoutes,
  getSipRouteById,
  upsertSipRoute,
  deleteSipRouteById,
  listRouteTrunks,
  replaceRouteTrunks,
  mapSipRouteRow,
} = require('../../db/systemSettings/sipRoutes');
const { getSipTrunkById } = require('../../db/systemSettings/sipTrunks');
const { SystemSettingsError } = require('./errors');
const { reloadDdiLinesForRoute } = require('../dealerboard/sipLineReloadService');

async function listSipRouteRecords(query = {}) {
  const activeOnly = query.activeOnly === true || query.activeOnly === 'true';
  const rows = await listSipRoutes({ activeOnly });
  const routes = [];
  for (const row of rows) {
    const trunks = await listRouteTrunks(row.id);
    routes.push(mapSipRouteRow(row, trunks));
  }
  return { success: true, routes };
}

async function getSipRouteRecord(id) {
  const routeId = String(id || '').trim();
  if (!routeId) throw new SystemSettingsError(400, 'id is required');
  const row = await getSipRouteById(routeId);
  if (!row) throw new SystemSettingsError(404, 'Route not found');
  const trunks = await listRouteTrunks(routeId);
  return { success: true, route: mapSipRouteRow(row, trunks) };
}

async function upsertSipRouteRecord(body) {
  const { id, name, failbackToPrimary, isActive, trunks } = body || {};
  const nm = String(name || '').trim();
  if (!nm) throw new SystemSettingsError(400, 'name is required');

  const routeId = id ? String(id) : crypto.randomUUID();
  await upsertSipRoute([
    routeId,
    nm,
    failbackToPrimary !== false,
    isActive !== undefined ? !!isActive : true,
  ]);

  if (Array.isArray(trunks)) {
    const entries = [];
    for (let i = 0; i < trunks.length; i += 1) {
      const trunkId = String(trunks[i]?.trunkId || trunks[i]?.id || '').trim();
      if (!trunkId) continue;
      const trunk = await getSipTrunkById(trunkId);
      if (!trunk) throw new SystemSettingsError(400, `Unknown trunk ${trunkId}`);
      entries.push({
        trunkId,
        priority: Number.isFinite(trunks[i]?.priority) ? trunks[i].priority : (1000 + i),
      });
    }
    await replaceRouteTrunks(routeId, entries);
  }

  reloadDdiLinesForRoute(routeId, 'sip_route_updated');
  return { success: true, id: routeId };
}

async function deleteSipRoute(id) {
  const routeId = String(id || '').trim();
  if (!routeId) throw new SystemSettingsError(400, 'id is required');
  reloadDdiLinesForRoute(routeId, 'sip_route_deleted');
  await deleteSipRouteById(routeId);
  return { success: true };
}

module.exports = {
  listSipRouteRecords,
  getSipRouteRecord,
  upsertSipRouteRecord,
  deleteSipRoute,
};
