const { getSIPGateway } = require('../sipService');
const { resolveUserDbId } = require('../../db/dealerboard/helpers');
const {
  listActiveLinesForCatalog: listActivePrivateWires,
  findPrivateWireByAor,
  findPrivateWireByAorOrLegacy,
  privateWireExists,
  updatePrivateWireCallForward,
} = require('../../db/dealerboard/privateWires');
const {
  listActiveLinesForCatalog: listActiveDdiLines,
  findDdiLineByAor,
  findDdiLineByAorOrLegacy,
  ddiLineExists,
  updateDdiLineCallForward,
} = require('../../db/dealerboard/ddiLines');
const {
  findBroadcastByAorMetadata,
  findBroadcastById,
  findBroadcastByLegacyAor,
} = require('../../db/dealerboard/broadcastGroups');
const { getLineAssignmentsForUser } = require('../../db/dealerboard/buttonAssignments');
const { getActiveSessionUsersByLineIds } = require('../../db/dealerboard/lineSessions');
const { isAdminRole } = require('./validators');
const { LineOperationError } = require('./errors');
const { collectInternalRingingLineIds } = require('./internalPrivateWireCallService');
const { getPrivateWireForCall } = require('../../db/dealerboard/privateWires');

function isInternalWireRow(wireInfo) {
  const metadata = wireInfo?.metadata;
  const parsed = typeof metadata === 'string'
    ? (() => { try { return JSON.parse(metadata); } catch { return {}; } })()
    : (metadata || {});
  const internal = parsed?.internalWire === true || parsed?.internalWire === 'true';
  const uriAddr = String(wireInfo?.uri_address || '').trim();
  return internal && /^sip:internal-/i.test(uriAddr) && /@internal$/i.test(uriAddr);
}

function mapDisplayMode(row) {
  const st = (row.signalling_type || '').toString().trim().toUpperCase();
  if (st === 'AUTO_RINGDOWN') return 'ARD';
  if (st === 'MANUAL_RINGDOWN') return 'MRD';
  if (st === 'NONE') return 'HOOT';
  const legacy = (row.mode || '').toString().trim().toUpperCase();
  return legacy || null;
}

function mapPrivateWireCatalogRow(row) {
  return {
    id: row.id,
    aor: row.aor || null,
    name: row.name,
    label: row.label,
    type: row.type,
    mode: mapDisplayMode(row),
    sudoLineReference: row.sudo_line_reference,
    isActive: row.is_active,
    callForward: row.metadata?.callForward || {},
  };
}

function mapDdiCatalogRow(row) {
  return {
    id: row.id,
    aor: row.aor || null,
    name: row.name,
    label: row.label,
    type: row.type,
    mode: null,
    sudoLineReference: row.sudo_line_reference,
    isActive: row.is_active,
    callForward: row.connection_details?.callForward || {},
  };
}

function mapBroadcastResolve(row, aorOverride) {
  return {
    success: true,
    kind: 'broadcast',
    id: row.id,
    aor: aorOverride ?? ((row.metadata && row.metadata.aor) ? String(row.metadata.aor) : `BCAST:${row.id}`),
    name: row.name || `Broadcast ${row.id}`,
  };
}

function mapPrivateWireResolve(row) {
  return {
    success: true,
    kind: 'privateWire',
    id: row.id,
    aor: row.aor,
    name: row.line_label || `Private Wire ${row.id}`,
  };
}

function mapDdiResolve(row) {
  return {
    success: true,
    kind: 'ddiLine',
    id: row.id,
    aor: row.aor,
    name: row.line_name || `DDI ${row.id}`,
  };
}

async function getAvailableLines() {
  const [privateWires, ddiLines] = await Promise.all([
    listActivePrivateWires(),
    listActiveDdiLines(),
  ]);

  return {
    success: true,
    lines: [
      ...privateWires.map(mapPrivateWireCatalogRow),
      ...ddiLines.map(mapDdiCatalogRow),
    ],
  };
}

async function resolveAor(aorRaw) {
  const aor = aorRaw !== undefined && aorRaw !== null ? String(aorRaw).trim() : '';
  if (!aor) throw new LineOperationError(400, 'aor is required');

  if (/^\d{6}$/.test(aor)) {
    const pw = await findPrivateWireByAor(aor);
    if (pw) return mapPrivateWireResolve(pw);

    const ddi = await findDdiLineByAor(aor);
    if (ddi) return mapDdiResolve(ddi);

    const broadcast = await findBroadcastByAorMetadata(aor);
    if (broadcast) return mapBroadcastResolve(broadcast, aor);

    throw new LineOperationError(404, 'AOR not found');
  }

  const upper = aor.toUpperCase();
  const broadcastPrefix = upper.startsWith('BCAST:')
    ? 'BCAST:'
    : (upper.startsWith('BROADCAST:') ? 'BROADCAST:' : null);

  if (broadcastPrefix) {
    const groupId = aor.slice(broadcastPrefix.length).trim();
    if (!groupId) throw new LineOperationError(400, 'Invalid broadcast AOR');

    const group = await findBroadcastById(groupId);
    if (!group) throw new LineOperationError(404, 'Broadcast group not found');

    return mapBroadcastResolve(group);
  }

  const pw = await findPrivateWireByAorOrLegacy(aor);
  if (pw) return mapPrivateWireResolve(pw);

  const ddi = await findDdiLineByAorOrLegacy(aor);
  if (ddi) return mapDdiResolve(ddi);

  const legacyBroadcast = await findBroadcastByLegacyAor(aor);
  if (legacyBroadcast) {
    return mapBroadcastResolve(
      legacyBroadcast,
      (legacyBroadcast.metadata && legacyBroadcast.metadata.aor) ? String(legacyBroadcast.metadata.aor) : aor
    );
  }

  throw new LineOperationError(404, 'AOR not found');
}

async function getBusyStatus({ requestingUserIdRaw, targetUserIdRaw, requesterRole }) {
  const targetUserIdRawEffective = (isAdminRole(requesterRole) && targetUserIdRaw)
    ? String(targetUserIdRaw)
    : String(requestingUserIdRaw);

  const requestingUserId = await resolveUserDbId(requestingUserIdRaw);
  const targetUserId = await resolveUserDbId(targetUserIdRawEffective);

  if (!isAdminRole(requesterRole) && targetUserId !== String(requestingUserId)) {
    throw new LineOperationError(403, 'Access denied');
  }

  const assignedRows = await getLineAssignmentsForUser(targetUserId);
  const lineIds = Array.from(new Set(
    assignedRows
      .map((r) => r.ddi_line_id || r.line_id)
      .filter(Boolean)
      .map(String)
  ));

  const privateLineIds = new Set();
  const busyLineIds = new Set();
  const ringingLineIds = new Set();
  const disconnectedLineIds = new Set();

  const sessionUsersByLine = await getActiveSessionUsersByLineIds(lineIds);
  for (const [lineId, userIds] of sessionUsersByLine.entries()) {
    if (userIds.has(String(targetUserId))) {
      privateLineIds.add(lineId);
    }
  }

  const sipEnabled = process.env.SIP_ENABLED === 'true';
  const sipGateway = getSIPGateway();
  const internalWireCache = new Map();

  if (sipEnabled && sipGateway && sipGateway.initialized) {
    for (const lineId of lineIds) {
      try {
        let wireInfo = internalWireCache.get(lineId);
        if (wireInfo === undefined) {
          wireInfo = await getPrivateWireForCall(lineId);
          internalWireCache.set(lineId, wireInfo || null);
        }
        const isInternalWire = wireInfo && isInternalWireRow(wireInfo);

        const ua = sipGateway.getUserAgent(lineId);
        if (!isInternalWire && (!ua || ua.registered !== true)) {
          disconnectedLineIds.add(lineId);
        }

        const calls = ua?.getActiveCalls?.() || [];
        let lineConnected = false;
        let lineRinging = false;

        for (const call of calls) {
          if (!call) continue;
          const st = String(call.status || '').toLowerCase();
          if (st === 'connected') lineConnected = true;
          if (st === 'ringing' || st === 'incoming') lineRinging = true;
        }

        if (lineRinging) ringingLineIds.add(lineId);
        if (lineConnected && !privateLineIds.has(lineId)) busyLineIds.add(lineId);
      } catch {
        disconnectedLineIds.add(lineId);
      }
    }
  }

  for (const lineId of collectInternalRingingLineIds(lineIds)) {
    ringingLineIds.add(lineId);
  }

  // Session-only busy (no SIP call yet, or DDI): other users on line, not this user.
  for (const [lineId, userIds] of sessionUsersByLine.entries()) {
    if (userIds.size === 0) continue;
    if (privateLineIds.has(lineId)) continue;
    if (userIds.size > 0) busyLineIds.add(lineId);
  }

  const privateButtons = [];
  const busyButtons = [];
  const ringingButtons = [];
  const disconnectedButtons = [];

  for (const r of assignedRows) {
    const lid = r.ddi_line_id || r.line_id;
    if (!lid) continue;
    const lineId = String(lid);
    const button = { pageNumber: r.page_number, buttonNumber: r.button_number };

    if (privateLineIds.has(lineId)) privateButtons.push(button);
    if (busyLineIds.has(lineId)) busyButtons.push(button);
    if (ringingLineIds.has(lineId)) ringingButtons.push(button);
    if (disconnectedLineIds.has(lineId)) disconnectedButtons.push(button);
  }

  return {
    success: true,
    privateLines: Array.from(privateLineIds),
    busyLines: Array.from(busyLineIds),
    ringingLines: Array.from(ringingLineIds),
    disconnectedLines: Array.from(disconnectedLineIds),
    privateButtons,
    busyButtons,
    ringingButtons,
    disconnectedButtons,
  };
}

async function updateCallForward(body, requesterRole) {
  if (!isAdminRole(requesterRole)) {
    throw new LineOperationError(403, 'Admin access required');
  }

  const { lineId, lineType, enabled, forwardToUri } = body || {};

  if (!lineId || !lineType) {
    throw new LineOperationError(400, 'lineId and lineType are required');
  }

  const lt = String(lineType);
  if (!['privateWire', 'ddiLine'].includes(lt)) {
    throw new LineOperationError(400, 'Invalid lineType (must be privateWire or ddiLine)');
  }

  const isEnabled = enabled === true || enabled === 'true';
  const target = forwardToUri !== undefined && forwardToUri !== null ? String(forwardToUri).trim() : '';

  if (isEnabled) {
    if (!target) {
      throw new LineOperationError(400, 'forwardToUri is required when enabled');
    }
    if (target.toLowerCase().includes(':') && !target.toLowerCase().startsWith('sip:')) {
      throw new LineOperationError(400, 'forwardToUri must be a sip: URI (or an E.164 number without a scheme)');
    }
  }

  const payload = {
    enabled: isEnabled,
    forwardToUri: isEnabled ? target : null,
    updatedAt: new Date().toISOString(),
  };

  if (lt === 'privateWire') {
    if (!(await privateWireExists(String(lineId)))) {
      throw new LineOperationError(404, 'Private wire not found');
    }
    await updatePrivateWireCallForward(lineId, payload);
  } else {
    if (!(await ddiLineExists(String(lineId)))) {
      throw new LineOperationError(404, 'DDI line not found');
    }
    await updateDdiLineCallForward(lineId, payload);
  }

  return { success: true, callForward: payload };
}

module.exports = {
  getAvailableLines,
  resolveAor,
  getBusyStatus,
  updateCallForward,
};
