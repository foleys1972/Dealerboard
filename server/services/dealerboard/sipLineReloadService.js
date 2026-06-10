const logger = require('../../utils/logger');
const { getSIPGateway } = require('../sipService');
const {
  listActiveDdiLineIdsBySipRouteId,
  listActiveDdiLineIdsByTrunkId,
} = require('../../db/dealerboard/ddiLines');

function scheduleReloadLineIds(lineIds, reason) {
  const ids = Array.from(new Set((lineIds || []).map((id) => String(id)).filter(Boolean)));
  if (!ids.length) return;

  setImmediate(() => {
    reloadLineIds(ids, reason).catch((error) => {
      logger.warn('SIP line reload failed', {
        reason,
        lineIds: ids,
        error: error?.message || error,
      });
    });
  });
}

async function reloadLineIds(lineIds, reason = 'manual') {
  const gateway = getSIPGateway();
  if (!gateway?.initialized || !gateway.isEnabled) {
    return { reloaded: 0, skipped: lineIds?.length || 0, reason: 'sip_disabled' };
  }

  const ids = Array.from(new Set((lineIds || []).map((id) => String(id)).filter(Boolean)));
  let reloaded = 0;

  for (const lineId of ids) {
    try {
      const result = await gateway.reloadLine(lineId);
      if (result?.reloaded) reloaded += 1;
    } catch (error) {
      logger.warn('Failed to reload SIP UA for line', {
        lineId,
        reason,
        error: error?.message || error,
      });
    }
  }

  if (reloaded > 0) {
    logger.info('SIP line reload complete', { reason, reloaded, requested: ids.length });
  }

  return { reloaded, requested: ids.length, reason };
}

async function reloadDdiLine(lineId, reason = 'ddi_line_updated') {
  scheduleReloadLineIds([lineId], reason);
}

async function reloadDdiLinesForRoute(routeId, reason = 'sip_route_updated') {
  if (!routeId) return;
  const lineIds = await listActiveDdiLineIdsBySipRouteId(routeId);
  scheduleReloadLineIds(lineIds, reason);
}

async function reloadDdiLinesForTrunk(trunkId, reason = 'sip_trunk_updated') {
  if (!trunkId) return;
  const lineIds = await listActiveDdiLineIdsByTrunkId(trunkId);
  scheduleReloadLineIds(lineIds, reason);
}

module.exports = {
  scheduleReloadLineIds,
  reloadLineIds,
  reloadDdiLine,
  reloadDdiLinesForRoute,
  reloadDdiLinesForTrunk,
};
