const crypto = require('crypto');
const { allocateSixDigitAor, pool } = require('../databaseService');
const { groupService } = require('../groupService');
const logger = require('../../utils/logger');
const {
  listAllPrivateWires,
  validateSubscriberIds,
  insertInternalWirePair,
  insertPrivateWire,
  getPrivateWireForUpdate,
  updatePrivateWire,
  getInternalWirePairByPairId,
  updateInternalWirePairShared,
  updateWireSubscriberId,
  updateWireLineLabel,
  getPrivateWireForLegacyMigration,
  getGroupSummaryById,
  updateLegacyBroadcastGroup,
  insertLegacyBroadcastGroup,
  markPrivateWireMigrated,
  getFullGroupById,
  getPrivateWiresByIds,
  deleteLineSessionsByWireIds,
  deletePrivateWiresByIds,
  getPrivateWireForDelete,
  deleteInternalWirePair,
  deletePrivateWireById,
  mapPrivateWireRow,
} = require('../../db/dealerboard/privateWires');
const {
  migrateAssignmentsToBroadcast,
  getAssignmentRefCounts,
  getAssignmentRefDetails,
} = require('../../db/dealerboard/buttonAssignments');
const {
  normalizeSbcDetails,
  validateSbcDetails,
  validatePrivateWirePayload,
  generateSudoLineReference,
  modeToSignallingType,
} = require('./validators');
const { extractSbcPayloadFromBody, hasSbcPayloadFields } = require('./sbcProfile');
const { LineOperationError } = require('./errors');

async function listPrivateWires() {
  const rows = await listAllPrivateWires();
  return { success: true, wires: rows.map(mapPrivateWireRow) };
}

async function createPrivateWire(body) {
  const {
    uriAddress,
    sbcDetails,
    sbcHost,
    sbcPort,
    sbcUsername,
    sbcPassword,
    sbcDomain,
    lineLabel,
    lineLabelA,
    lineLabelB,
    circuitNumber,
    mode,
    subscriberId,
    homeSubscriberId,
    secondarySubscriberId,
    internalWire,
    ringTimeout,
    externalCommunityId,
    externalCommunityName,
    isExternalCommunity,
  } = body;

  if (!lineLabel || !mode) {
    const hasPerEnd = (lineLabelA && String(lineLabelA).trim()) || (lineLabelB && String(lineLabelB).trim());
    const normalizedModeForCheck = String(mode || '').trim().toUpperCase();
    const isInternalCheck = internalWire === true || internalWire === 'true' || normalizedModeForCheck === 'INTERNAL';
    if (!isInternalCheck || !hasPerEnd) {
      throw new LineOperationError(400, 'Missing required fields');
    }
  }

  const normalizedMode = String(mode).trim().toUpperCase();
  const isInternal = internalWire === true || internalWire === 'true' || normalizedMode === 'INTERNAL';
  const internalSignallingMode = isInternal
    ? (['ARD', 'MRD', 'HOOT'].includes(normalizedMode) ? normalizedMode : 'ARD')
    : normalizedMode;

  if (!isInternal && !uriAddress) {
    throw new LineOperationError(400, 'Missing required fields');
  }

  if (isInternal) {
    if (!homeSubscriberId || !secondarySubscriberId) {
      throw new LineOperationError(400, 'Internal wire requires homeSubscriberId and secondarySubscriberId');
    }
    const found = await validateSubscriberIds([String(homeSubscriberId), String(secondarySubscriberId)]);
    const foundSet = new Set(found);
    const missing = [String(homeSubscriberId), String(secondarySubscriberId)].filter((id) => !foundSet.has(id));
    if (missing.length > 0) {
      throw new LineOperationError(400, `Unknown subscriber id(s): ${missing.join(', ')}`);
    }
  }

  const pwValidation = validatePrivateWirePayload({
    uriAddress,
    mode: internalSignallingMode,
    isExternalCommunity,
    externalCommunityId,
    externalCommunityName,
    isInternalWire: isInternal,
  });
  if (!pwValidation.ok) throw new LineOperationError(400, pwValidation.error);

  let normalizedSbc;
  try {
    normalizedSbc = normalizeSbcDetails(extractSbcPayloadFromBody(body));
  } catch (e) {
    throw new LineOperationError(400, e?.message || 'Invalid SBC details');
  }
  const sbcValidation = validateSbcDetails(normalizedSbc);
  if (!sbcValidation.ok) throw new LineOperationError(400, sbcValidation.error);

  const ringTimeoutSeconds = ringTimeout !== undefined && ringTimeout !== null
    ? Math.max(1, parseInt(ringTimeout, 10) || 30)
    : 30;

  if (isInternal) {
    const internalPairId = crypto.randomUUID();
    const idA = crypto.randomUUID();
    const idB = crypto.randomUUID();
    const aorA = await allocateSixDigitAor(pool);
    const aorB = await allocateSixDigitAor(pool);
    const sudoA = generateSudoLineReference();
    const sudoB = generateSudoLineReference();
    const metadataA = { internalWire: true, internalPairId, internalRole: 'A', peerId: idB };
    const metadataB = { internalWire: true, internalPairId, internalRole: 'B', peerId: idA };
    const uriA = `sip:internal-${internalPairId}-a@internal`;
    const uriB = `sip:internal-${internalPairId}-b@internal`;
    const labelA = (lineLabelA !== undefined && lineLabelA !== null && String(lineLabelA).trim())
      ? String(lineLabelA).trim()
      : (lineLabel ? String(lineLabel).trim() : '');
    const labelB = (lineLabelB !== undefined && lineLabelB !== null && String(lineLabelB).trim())
      ? String(lineLabelB).trim()
      : (lineLabel ? String(lineLabel).trim() : '');

    await insertInternalWirePair([
      idA, uriA, JSON.stringify({}), labelA, circuitNumber || null, internalSignallingMode,
      homeSubscriberId, ringTimeoutSeconds, aorA, homeSubscriberId, secondarySubscriberId,
      null, null, false, sudoA, JSON.stringify(metadataA), modeToSignallingType(internalSignallingMode),
      idB, uriB, JSON.stringify({}), labelB, circuitNumber || null, internalSignallingMode,
      secondarySubscriberId, ringTimeoutSeconds, aorB, homeSubscriberId, secondarySubscriberId,
      null, null, false, sudoB, JSON.stringify(metadataB), modeToSignallingType(internalSignallingMode),
    ]);

    return { success: true, internalPairId, ids: [idA, idB] };
  }

  const id = crypto.randomUUID();
  const sudoLineReference = generateSudoLineReference();
  const aor = await allocateSixDigitAor(pool);

  await insertPrivateWire([
    id,
    uriAddress,
    JSON.stringify(normalizedSbc || {}),
    lineLabel,
    circuitNumber || null,
    internalSignallingMode,
    subscriberId || null,
    ringTimeoutSeconds,
    aor,
    homeSubscriberId || null,
    secondarySubscriberId || null,
    externalCommunityId || null,
    externalCommunityName || null,
    isExternalCommunity || false,
    sudoLineReference,
    JSON.stringify({}),
    modeToSignallingType(internalSignallingMode),
  ]);

  return { success: true, id, sudoLineReference };
}

async function updatePrivateWireRecord(id, body) {
  const existing = await getPrivateWireForUpdate(id);
  if (!existing) throw new LineOperationError(404, 'Private wire not found');

  const {
    uriAddress,
    sbcDetails,
    sbcHost,
    sbcPort,
    sbcUsername,
    sbcPassword,
    sbcDomain,
    lineLabel,
    circuitNumber,
    mode,
    subscriberId,
    homeSubscriberId,
    secondarySubscriberId,
    internalWire,
    ringTimeout,
    isActive,
    externalCommunityId,
    externalCommunityName,
    isExternalCommunity,
  } = body;

  const incomingMode = mode !== undefined && mode !== null ? String(mode).trim().toUpperCase() : undefined;
  const effectiveMode = incomingMode !== undefined
    ? incomingMode
    : (existing.mode ? String(existing.mode).trim().toUpperCase() : existing.mode);
  const isInternal = internalWire === true || internalWire === 'true' || effectiveMode === 'INTERNAL';
  const existingPairId = existing?.metadata?.internalPairId;

  if (isInternal || existingPairId) {
    throw new LineOperationError(400, 'Internal wires are mirrored. Update using PUT /api/dealerboard/private-wires/pair/:pairId');
  }

  const pwValidation = validatePrivateWirePayload({
    uriAddress: uriAddress !== undefined ? uriAddress : existing.uri_address,
    mode: effectiveMode,
    isExternalCommunity: isExternalCommunity !== undefined ? isExternalCommunity : existing.is_external_community,
    externalCommunityId: externalCommunityId !== undefined ? externalCommunityId : existing.external_community_id,
    externalCommunityName: externalCommunityName !== undefined ? externalCommunityName : existing.external_community_name,
  });
  if (!pwValidation.ok) throw new LineOperationError(400, pwValidation.error);

  const updates = [];
  const values = [];
  let paramCount = 1;

  const pushUpdate = (column, value) => {
    updates.push(`${column} = $${paramCount++}`);
    values.push(value);
  };

  if (uriAddress !== undefined) pushUpdate('uri_address', uriAddress);
  if (hasSbcPayloadFields(body)) {
    let normalizedSbc;
    try {
      normalizedSbc = normalizeSbcDetails(extractSbcPayloadFromBody(body));
    } catch (e) {
      throw new LineOperationError(400, e?.message || 'Invalid SBC details');
    }
    const sbcValidation = validateSbcDetails(normalizedSbc);
    if (!sbcValidation.ok) throw new LineOperationError(400, sbcValidation.error);
    pushUpdate('sbc_details', JSON.stringify(normalizedSbc));
  }
  if (lineLabel !== undefined) pushUpdate('line_label', lineLabel);
  if (circuitNumber !== undefined) pushUpdate('circuit_number', circuitNumber);
  if (incomingMode !== undefined) {
    if (!['ARD', 'MRD', 'HOOT', 'INTERNAL', 'INTERCOM', 'GROUP', 'BROADCAST'].includes(incomingMode)) {
      throw new LineOperationError(400, 'Invalid mode');
    }
    pushUpdate('mode', incomingMode);
  }
  if (subscriberId !== undefined) pushUpdate('subscriber_id', subscriberId);
  if (homeSubscriberId !== undefined) pushUpdate('home_subscriber_id', homeSubscriberId);
  if (secondarySubscriberId !== undefined) pushUpdate('secondary_subscriber_id', secondarySubscriberId);
  if (isInternal && (uriAddress === undefined || uriAddress === null || String(uriAddress).trim() === '')) {
    pushUpdate('uri_address', `sip:internal-${id}@internal`);
  }
  if (ringTimeout !== undefined) {
    const ringTimeoutSeconds = ringTimeout !== null ? Math.max(1, parseInt(ringTimeout, 10) || 30) : null;
    pushUpdate('ring_timeout', ringTimeoutSeconds);
  }
  if (externalCommunityId !== undefined) pushUpdate('external_community_id', externalCommunityId);
  if (externalCommunityName !== undefined) pushUpdate('external_community_name', externalCommunityName);
  if (isExternalCommunity !== undefined) pushUpdate('is_external_community', isExternalCommunity);
  if (isActive !== undefined) pushUpdate('is_active', isActive);

  if (updates.length === 0) throw new LineOperationError(400, 'No updates provided');

  updates.push('updated_at = NOW()');
  values.push(id);
  await updatePrivateWire(id, updates, values);

  return { success: true };
}

async function updateInternalWirePair(pairId, body) {
  const { lineLabel, lineLabelA, lineLabelB, homeSubscriberId, secondarySubscriberId, isActive, mode } = body || {};

  if (!pairId) throw new LineOperationError(400, 'Missing pairId');
  if (!homeSubscriberId || !secondarySubscriberId) {
    throw new LineOperationError(400, 'Internal wire requires homeSubscriberId and secondarySubscriberId');
  }

  const existing = await getInternalWirePairByPairId(pairId);
  if (existing.length === 0) throw new LineOperationError(404, 'Internal wire pair not found');

  const rowA = existing.find((r) => (r.metadata?.internalRole || '') === 'A') || existing[0];
  const rowB = existing.find((r) => (r.metadata?.internalRole || '') === 'B') || existing[1];
  if (!rowA || !rowB) throw new LineOperationError(400, 'Internal wire pair is incomplete');

  const desiredA =
    (lineLabelA !== undefined ? String(lineLabelA || '').trim() : '') ||
    (lineLabel !== undefined ? String(lineLabel || '').trim() : '');
  const desiredB =
    (lineLabelB !== undefined ? String(lineLabelB || '').trim() : '') ||
    (lineLabel !== undefined ? String(lineLabel || '').trim() : '');

  const updates = [];
  const values = [];
  let idx = 1;

  if (mode !== undefined && mode !== null) {
    const incomingMode = String(mode).trim().toUpperCase();
    if (!['ARD', 'MRD', 'HOOT', 'INTERNAL'].includes(incomingMode)) {
      throw new LineOperationError(400, 'Invalid mode for internal wire (must be ARD, MRD, HOOT)');
    }
    updates.push(`mode = $${idx++}`);
    values.push(incomingMode === 'INTERNAL' ? 'ARD' : incomingMode);
  }
  if (isActive !== undefined) {
    updates.push(`is_active = $${idx++}`);
    values.push(Boolean(isActive));
  }

  updates.push(`home_subscriber_id = $${idx++}`);
  values.push(homeSubscriberId);
  updates.push(`secondary_subscriber_id = $${idx++}`);
  values.push(secondarySubscriberId);
  updates.push('updated_at = NOW()');

  await updateInternalWirePairShared(pairId, updates, values);
  await updateWireSubscriberId(rowA.id, homeSubscriberId);
  await updateWireSubscriberId(rowB.id, secondarySubscriberId);

  if (lineLabel !== undefined || lineLabelA !== undefined) {
    await updateWireLineLabel(rowA.id, desiredA);
  }
  if (lineLabel !== undefined || lineLabelB !== undefined) {
    await updateWireLineLabel(rowB.id, desiredB);
  }

  return { success: true };
}

function cacheMigratedGroup(groupRow) {
  const current = groupService.activeGroups.get(groupRow.id);
  if (!current) {
    const hootConfig = groupService.normalizeHootConfig(groupRow.hoot_config || {});
    groupService.activeGroups.set(groupRow.id, {
      id: groupRow.id,
      name: groupRow.name,
      description: groupRow.description,
      type: groupRow.type,
      callMode: groupRow.call_mode || 'broadcast',
      isPublic: groupRow.is_public,
      maxParticipants: groupRow.max_participants,
      allowRecording: groupRow.allow_recording,
      pushToTalk: groupRow.push_to_talk,
      createdBy: groupRow.created_by,
      sipEnabled: groupRow.sip_enabled,
      sipNumbers: groupRow.sip_numbers || [],
      retentionPolicy: groupRow.retention_policy || {},
      hootConfig,
      matrixRoomId: groupRow.matrix_room_id,
      isActive: groupRow.is_active,
      metadata: groupRow.metadata || {},
      participants: new Set(),
      currentSpeaker: null,
      audioLevels: new Map(),
      hootState: groupService.createInitialHootState(),
      recording: null,
      broadcastQueue: [],
      lastActivity: new Date(),
    });
  } else {
    current.metadata = groupRow.metadata || {};
    current.name = groupRow.name;
    current.callMode = groupRow.call_mode || current.callMode;
  }
}

async function migrateLegacyPrivateWires(ids, createdBy) {
  if (!ids.length) throw new LineOperationError(400, 'id or ids is required');

  await groupService.initialize();
  const results = [];

  for (const idRaw of ids) {
    const wireId = String(idRaw);
    const row = await getPrivateWireForLegacyMigration(wireId);

    if (!row) {
      results.push({ id: wireId, ok: false, error: 'Not found' });
      continue;
    }

    const mode = String(row.mode || '').toUpperCase();
    const meta = (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata))
      ? { ...row.metadata }
      : {};

    if (mode !== 'BROADCAST') {
      results.push({ id: wireId, ok: false, error: `Unsupported legacy mode ${mode}` });
      continue;
    }

    const legacyAor = String(meta.legacyAor || `LINE:${row.id}`);
    const existingGroup = await getGroupSummaryById(wireId);
    let groupMeta;

    if (existingGroup) {
      groupMeta = (existingGroup.metadata && typeof existingGroup.metadata === 'object' && !Array.isArray(existingGroup.metadata))
        ? { ...existingGroup.metadata }
        : {};
      groupMeta.legacyAor = groupMeta.legacyAor || legacyAor;
      if (!groupMeta.aor || !/^\d{6}$/.test(String(groupMeta.aor))) {
        groupMeta.aor = await allocateSixDigitAor(pool);
      }
      await updateLegacyBroadcastGroup(wireId, row.line_label || null, groupMeta);
    } else {
      groupMeta = { aor: await allocateSixDigitAor(pool), legacyAor };
      await insertLegacyBroadcastGroup({
        groupId: wireId,
        name: row.line_label || 'Legacy Broadcast',
        createdBy: createdBy || 'admin',
        metadata: groupMeta,
      });
    }

    await migrateAssignmentsToBroadcast(wireId, wireId);

    meta.migrated = true;
    meta.migratedToGroupId = wireId;
    meta.legacyAor = meta.legacyAor || legacyAor;
    await markPrivateWireMigrated(wireId, meta);

    const groupRow = await getFullGroupById(wireId);
    if (groupRow) cacheMigratedGroup(groupRow);

    results.push({ id: wireId, ok: true, migratedToGroupId: wireId, aor: String(groupMeta.aor) });
  }

  return { success: true, results };
}

async function deleteLegacyPrivateWires(ids, force = false) {
  if (!ids.length) throw new LineOperationError(400, 'id or ids is required');

  const idList = ids.map(String);
  const rows = await getPrivateWiresByIds(idList);
  const foundIds = new Set(rows.map((r) => r.id));
  const missing = idList.filter((x) => !foundIds.has(x));
  if (missing.length > 0) {
    throw new LineOperationError(404, 'Some ids were not found', undefined, { missing });
  }

  const nonLegacy = rows.filter((r) => !['INTERCOM', 'GROUP', 'BROADCAST'].includes(String(r.mode || '').toUpperCase()));
  if (nonLegacy.length > 0) {
    throw new LineOperationError(400, 'Refusing to delete non-legacy private wire rows');
  }

  const refs = await getAssignmentRefCounts(idList);
  const referenced = refs.filter((r) => (r.cnt || 0) > 0);
  if (referenced.length > 0 && !force) {
    const refDetails = await getAssignmentRefDetails(idList);
    const err = new LineOperationError(
      400,
      'Legacy rows are still referenced by button assignments. Migrate first or use force=true.'
    );
    err.extra = {
      referenced: referenced.map((r) => ({ id: r.line_id, assignments: r.cnt })),
      referencedDetails: refDetails,
    };
    throw err;
  }

  await deleteLineSessionsByWireIds(idList);
  const deleted = await deletePrivateWiresByIds(idList);
  return { success: true, deleted };
}

async function deletePrivateWire(id) {
  const existing = await getPrivateWireForDelete(id);
  if (!existing) throw new LineOperationError(404, 'Private wire not found');

  const pairId = existing?.metadata?.internalPairId;
  if (pairId) {
    await deleteInternalWirePair(pairId);
  } else {
    await deletePrivateWireById(id);
  }

  return { success: true };
}

module.exports = {
  listPrivateWires,
  createPrivateWire,
  updatePrivateWireRecord,
  updateInternalWirePair,
  migrateLegacyPrivateWires,
  deleteLegacyPrivateWires,
  deletePrivateWire,
};
