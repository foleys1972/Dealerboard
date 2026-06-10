const logger = require('../../utils/logger');
const { applyDialPlan, normalizeDigits } = require('../dialPlanService');
const { getSIPGateway } = require('../sipService');
const { findActiveLineSipCall } = require('./lineCallAggregation');
const { LineOperationError } = require('./errors');
const {
  privateWireExists,
  getPrivateWireForCall,
} = require('../../db/dealerboard/privateWires');
const {
  ddiLineExists,
  getActiveDdiLine,
} = require('../../db/dealerboard/ddiLines');
const { getLatestUserSession } = require('../../db/dealerboard/lineSessions');
const {
  bridgeLinesForConference,
  teardownConferenceForLine,
  getActiveConferenceForLine,
} = require('./lineMediaConferenceService');
const { getLineState, publishLineConferenceState } = require('./sipLineStateService');
const {
  resolveDdiLineReferUri,
  resolveBlindTransferReferUri,
} = require('./sipRouteResolver');

async function assertLineExists(lineId) {
  if (await privateWireExists(lineId)) return 'private_wire';
  if (await ddiLineExists(lineId)) return 'ddi';
  throw new LineOperationError(404, 'Line not found');
}

async function resolveActiveSipCallId(lineId, userId) {
  const session = await getLatestUserSession(lineId, userId);
  const sipGateway = getSIPGateway();
  const activeCall = findActiveLineSipCall(sipGateway, lineId);
  const sipCallId = session?.metadata?.sipCallId || activeCall?.callId || null;
  if (!sipCallId) {
    throw new LineOperationError(409, 'No active call on this line');
  }
  return { sipCallId, sipGateway, activeCall };
}

async function resolveReferTargetUri({ targetLineId, digits, sourceLineId, userId }) {
  if (targetLineId) {
    if (String(targetLineId) === String(sourceLineId)) {
      throw new LineOperationError(400, 'Transfer target must be a different line');
    }
    await assertLineExists(targetLineId);

    if (await privateWireExists(targetLineId)) {
      const wire = await getPrivateWireForCall(targetLineId);
      if (!wire?.uri_address) {
        throw new LineOperationError(400, 'Target line has no routable URI');
      }
      return wire.uri_address;
    }

    const ddiLine = await getActiveDdiLine(targetLineId);
    if (!ddiLine) {
      throw new LineOperationError(404, 'Target DDI line not found');
    }
    return resolveDdiLineReferUri(ddiLine);
  }

  const dialDigits = normalizeDigits(digits);
  if (!dialDigits) {
    throw new LineOperationError(400, 'Transfer requires targetLineId or dialed digits');
  }

  let sourceDdi = null;
  if (await ddiLineExists(sourceLineId)) {
    sourceDdi = await getActiveDdiLine(sourceLineId);
  }

  const referUri = await resolveBlindTransferReferUri({
    sourceDdi,
    digits: dialDigits,
    applyDialPlanFn: applyDialPlan,
  });
  if (referUri) return referUri;

  const domain = process.env.SIP_DOMAIN || 'localhost';
  return `sip:${dialDigits}@${domain}`;
}

async function transferLineCall({ lineId, userId, targetLineId, digits }) {
  await assertLineExists(lineId);
  const { sipCallId, sipGateway } = await resolveActiveSipCallId(lineId, userId);

  if (!sipGateway?.initialized) {
    throw new LineOperationError(503, 'SIP gateway not available');
  }

  const referToUri = await resolveReferTargetUri({
    targetLineId,
    digits,
    sourceLineId: lineId,
    userId,
  });

  await sipGateway.transferCall(lineId, sipCallId, referToUri);

  logger.info('Line call transfer initiated', {
    lineId,
    userId,
    sipCallId,
    referToUri,
    targetLineId: targetLineId || null,
  });

  return {
    success: true,
    message: targetLineId ? 'Call transfer initiated to target line' : 'Call transfer initiated',
    sipCallId,
    referToUri,
    targetLineId: targetLineId || null,
  };
}

async function conferenceLineCall({ lineId, userId, targetLineId }) {
  if (!targetLineId) {
    throw new LineOperationError(400, 'Conference requires targetLineId');
  }
  if (String(targetLineId) === String(lineId)) {
    throw new LineOperationError(400, 'Conference target must be a different line');
  }

  await assertLineExists(lineId);
  await assertLineExists(targetLineId);

  const sourceState = getLineState(lineId);
  const targetState = getLineState(targetLineId);
  const session = await getLatestUserSession(lineId, userId);

  if (!sourceState && !session?.metadata?.sipCallId) {
    await resolveActiveSipCallId(lineId, userId);
  }

  const bridge = await bridgeLinesForConference(lineId, targetLineId);

  publishLineConferenceState(lineId, targetLineId, {
    userId,
    pipeCount: bridge.pipes.length,
  });
  publishLineConferenceState(targetLineId, lineId, {
    userId,
    pipeCount: bridge.pipes.length,
  });

  logger.info('Line conference established', {
    lineId,
    targetLineId,
    userId,
    pipeCount: bridge.pipes.length,
    sourceStatus: sourceState?.status || null,
    targetStatus: targetState?.status || null,
  });

  return {
    success: true,
    message: 'Lines conferenced',
    sourceLineId: String(lineId),
    targetLineId: String(targetLineId),
    pipeCount: bridge.pipes.length,
    conferenceKey: bridge.key,
  };
}

async function endLineConference({ lineId, userId }) {
  await assertLineExists(lineId);
  const existing = getActiveConferenceForLine(lineId);
  if (!existing) {
    return { success: true, message: 'No active conference on this line' };
  }

  await teardownConferenceForLine(lineId);

  for (const partnerLineId of existing.lineIds) {
    if (String(partnerLineId) === String(lineId)) continue;
    publishLineConferenceState(partnerLineId, null, { userId, ended: true });
  }
  publishLineConferenceState(lineId, null, { userId, ended: true });

  return {
    success: true,
    message: 'Conference ended',
    lineId: String(lineId),
  };
}

module.exports = {
  transferLineCall,
  conferenceLineCall,
  endLineConference,
  resolveReferTargetUri,
};
