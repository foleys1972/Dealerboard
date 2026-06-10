const crypto = require('crypto');
const { allocateSixDigitAor, pool } = require('../databaseService');
const {
  listAllDdiLines,
  insertDdiLine,
  updateDdiLine,
  deleteDdiLineById,
  mapDdiLineRow,
} = require('../../db/dealerboard/ddiLines');
const { normalizeSbcDetails, validateSbcDetails, generateSudoLineReference } = require('./validators');
const { extractSbcPayloadFromBody, hasSbcPayloadFields } = require('./sbcProfile');
const { getSipRouteById } = require('../../db/systemSettings/sipRoutes');
const { LineOperationError } = require('./errors');
const { reloadDdiLine } = require('./sipLineReloadService');

async function listDdiLines() {
  const rows = await listAllDdiLines();
  return { success: true, lines: rows.map(mapDdiLineRow) };
}

async function createDdiLine(body) {
  const {
    lineNumber,
    lineName,
    countryCode,
    sbcDetails,
    sbcHost,
    sbcPort,
    sbcUsername,
    sbcPassword,
    sbcDomain,
    connectionDetails,
    subscriberId,
    ringTimeout,
    sipRouteId,
  } = body;

  if (!lineNumber || !lineName) {
    throw new LineOperationError(400, 'Missing required fields');
  }

  const id = crypto.randomUUID();
  const sudoLineReference = generateSudoLineReference();
  const aor = await allocateSixDigitAor(pool);

  const ringTimeoutSeconds = ringTimeout !== undefined && ringTimeout !== null
    ? Math.max(1, parseInt(ringTimeout, 10) || 30)
    : 30;

  let normalizedSbc = {};
  const routeId = sipRouteId ? String(sipRouteId).trim() : null;
  if (routeId) {
    const route = await getSipRouteById(routeId);
    if (!route) throw new LineOperationError(400, 'Invalid SIP route');
  }

  if (hasSbcPayloadFields(body)) {
    try {
      normalizedSbc = normalizeSbcDetails(extractSbcPayloadFromBody(body));
    } catch (e) {
      throw new LineOperationError(400, e?.message || 'Invalid SBC details');
    }
    const sbcValidation = validateSbcDetails(normalizedSbc);
    if (!sbcValidation.ok) {
      throw new LineOperationError(400, sbcValidation.error);
    }
  } else if (!routeId) {
    throw new LineOperationError(400, 'SBC details or SIP route is required');
  }

  const cc = countryCode !== undefined && countryCode !== null && String(countryCode).trim() !== ''
    ? String(countryCode).trim().toUpperCase()
    : null;

  await insertDdiLine([
    id,
    lineNumber,
    lineName,
    cc,
    JSON.stringify(normalizedSbc || {}),
    JSON.stringify(connectionDetails || {}),
    subscriberId || null,
    ringTimeoutSeconds,
    sudoLineReference,
    aor,
    routeId,
  ]);

  reloadDdiLine(id, 'ddi_line_created');
  return { success: true, id, sudoLineReference };
}

async function updateDdiLineRecord(id, body) {
  const {
    lineNumber,
    lineName,
    countryCode,
    sbcDetails,
    sbcHost,
    sbcPort,
    sbcUsername,
    sbcPassword,
    sbcDomain,
    connectionDetails,
    subscriberId,
    ringTimeout,
    isActive,
    sipRouteId,
  } = body;

  const updates = [];
  const values = [];
  let paramCount = 1;

  if (lineNumber !== undefined) {
    updates.push(`line_number = $${paramCount++}`);
    values.push(lineNumber);
  }
  if (lineName !== undefined) {
    updates.push(`line_name = $${paramCount++}`);
    values.push(lineName);
  }
  if (countryCode !== undefined) {
    const cc = countryCode !== null && String(countryCode).trim() !== ''
      ? String(countryCode).trim().toUpperCase()
      : null;
    updates.push(`country_code = $${paramCount++}`);
    values.push(cc);
  }
  if (hasSbcPayloadFields(body)) {
    let normalizedSbc;
    try {
      normalizedSbc = normalizeSbcDetails(extractSbcPayloadFromBody(body));
    } catch (e) {
      throw new LineOperationError(400, e?.message || 'Invalid SBC details');
    }
    const sbcValidation = validateSbcDetails(normalizedSbc);
    if (!sbcValidation.ok) {
      throw new LineOperationError(400, sbcValidation.error);
    }
    updates.push(`sbc_details = $${paramCount++}`);
    values.push(JSON.stringify(normalizedSbc));
  }
  if (connectionDetails !== undefined) {
    updates.push(`connection_details = $${paramCount++}`);
    values.push(JSON.stringify(connectionDetails));
  }
  if (subscriberId !== undefined) {
    updates.push(`subscriber_id = $${paramCount++}`);
    values.push(subscriberId);
  }
  if (ringTimeout !== undefined) {
    const ringTimeoutSeconds = ringTimeout !== null
      ? Math.max(1, parseInt(ringTimeout, 10) || 30)
      : null;
    updates.push(`ring_timeout = $${paramCount++}`);
    values.push(ringTimeoutSeconds);
  }
  if (sipRouteId !== undefined) {
    const routeId = sipRouteId ? String(sipRouteId).trim() : null;
    if (routeId) {
      const route = await getSipRouteById(routeId);
      if (!route) throw new LineOperationError(400, 'Invalid SIP route');
    }
    updates.push(`sip_route_id = $${paramCount++}`);
    values.push(routeId);
  }
  if (isActive !== undefined) {
    updates.push(`is_active = $${paramCount++}`);
    values.push(isActive);
  }

  if (updates.length === 0) {
    throw new LineOperationError(400, 'No updates provided');
  }

  updates.push('updated_at = NOW()');
  values.push(id);
  await updateDdiLine(id, updates, values);

  const sipAffecting = updates.some((clause) =>
    /sbc_details|connection_details|sip_route_id|is_active|line_number/.test(clause)
  );
  if (sipAffecting) {
    reloadDdiLine(id, 'ddi_line_updated');
  }

  return { success: true };
}

async function deleteDdiLine(id) {
  await deleteDdiLineById(id);
  return { success: true };
}

module.exports = {
  listDdiLines,
  createDdiLine,
  updateDdiLineRecord,
  deleteDdiLine,
};
