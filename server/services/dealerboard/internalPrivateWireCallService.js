const crypto = require('crypto');
const logger = require('../../utils/logger');
const { LineOperationError } = require('./errors');
const { ensureLineMediaRouter, buildLineMediaGroupId } = require('./lineMediaService');
const { bridgeLinesForConference, teardownConferenceForLine } = require('./lineMediaConferenceService');
const {
  openOrJoinSipLine,
  updateLineCallStatus,
  publishLineIncoming,
  leaveSipLine,
  releaseLineCompletely,
} = require('./sipLineStateService');
const {
  upsertActiveSession,
  setSessionSipCallId,
  setSessionLineSessionKey,
  getLatestUserSession,
} = require('../../db/dealerboard/lineSessions');
const { resolveUserDbId } = require('../../db/dealerboard/helpers');
const { ensureMatrixRoomForLine } = require('./lineSessionService');

/** callId -> session */
const activeInternalCalls = new Map();

function parseWireMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }
  return metadata;
}

function resolvePeerLineId(wireInfo) {
  const metadata = parseWireMetadata(wireInfo?.metadata);
  const peerId = metadata?.peerId;
  return peerId ? String(peerId) : null;
}

function resolveInternalCallMode(wireInfo, { autoRing, hoot }) {
  const st = String(wireInfo.signalling_type || '').trim().toUpperCase();
  const derivedHoot = st === 'NONE';
  const derivedAutoRing = st === 'AUTO_RINGDOWN';

  const shouldHoot = hoot === true || hoot === 'true' || derivedHoot || String(wireInfo.mode || '').toUpperCase() === 'HOOT';
  const shouldAutoRing = autoRing === true || autoRing === 'true' || derivedAutoRing || String(wireInfo.mode || '').toUpperCase() === 'ARD';

  if (shouldHoot) return { mode: 'HOOT', connectNow: true };
  if (shouldAutoRing) return { mode: 'ARD', ringPeer: true, connectNow: false };
  return { mode: 'MRD', connectNow: true };
}

function buildInternalCallId(callerLineId, calleeLineId) {
  return `int-${String(callerLineId)}-${String(calleeLineId)}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

function getInternalCall(callId) {
  if (!callId) return null;
  return activeInternalCalls.get(String(callId)) || null;
}

function findRingingInternalCallForLine(lineId) {
  const id = String(lineId);
  for (const [callId, call] of activeInternalCalls.entries()) {
    if (call.calleeLineId === id && call.status === 'ringing') {
      return { callId, call };
    }
  }
  return null;
}

function findActiveInternalCallForLine(lineId) {
  const id = String(lineId);
  for (const [callId, call] of activeInternalCalls.entries()) {
    if ((call.callerLineId === id || call.calleeLineId === id) && call.status !== 'ended') {
      return { callId, call };
    }
  }
  return null;
}

const STALE_RINGING_MS = 3 * 60 * 1000;

function isStaleRingingInternalCall(call) {
  if (!call || call.status !== 'ringing') return false;
  const age = Date.now() - (call.createdAt || 0);
  return age > STALE_RINGING_MS;
}

async function clearStaleInternalCallForLine(lineId) {
  const existing = findActiveInternalCallForLine(lineId);
  if (!existing || !isStaleRingingInternalCall(existing.call)) {
    return false;
  }
  await teardownInternalCallIfNeeded(lineId, existing.callId);
  logger.info('Cleared stale internal wire ringing call', {
    lineId,
    callId: existing.callId,
    ageMs: Date.now() - (existing.call.createdAt || 0),
  });
  return true;
}

async function connectInternalPair(callId, callerLineId, calleeLineId) {
  const tryBridge = async () => {
    try {
      return await bridgeLinesForConference(callerLineId, calleeLineId);
    } catch (error) {
      logger.warn('Internal wire media bridge failed', {
        callId,
        callerLineId,
        calleeLineId,
        error: error?.message || error,
      });
      return null;
    }
  };

  // Clients attach MediaSoup producers asynchronously; retry so audio is not silent.
  let session = await tryBridge();
  for (const delayMs of [1500, 3500, 6000]) {
    if (session?.pipes?.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    session = await tryBridge();
  }

  updateLineCallStatus(callerLineId, callId, 'connected');
  updateLineCallStatus(calleeLineId, callId, 'connected');
}

async function callInternalPrivateWire({ lineId, userId, autoRing, hoot, wireInfo }) {
  const peerLineId = resolvePeerLineId(wireInfo);
  if (!peerLineId) {
    throw new LineOperationError(500, 'Internal wire is missing its peer line (re-create the internal pair).');
  }

  const resolvedUserId = await resolveUserDbId(userId);
  const callerLineId = String(lineId);
  const calleeLineId = String(peerLineId);
  const modeInfo = resolveInternalCallMode(wireInfo, { autoRing, hoot });

  await clearStaleInternalCallForLine(callerLineId);
  await clearStaleInternalCallForLine(calleeLineId);

  let existing = findActiveInternalCallForLine(callerLineId);
  if (existing?.call?.status === 'connected') {
    const sessionId = `active_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const { sessionId: activeSessionId } = await upsertActiveSession(callerLineId, resolvedUserId, sessionId);
    const mediaGroupId = await ensureLineMediaRouter(callerLineId);
    await setSessionSipCallId(activeSessionId, existing.callId);

    const lineState = openOrJoinSipLine({
      lineId: callerLineId,
      userId: resolvedUserId,
      dbSessionId: activeSessionId,
      mediaGroupId,
      uriAddress: wireInfo.uri_address,
      aor: wireInfo.aor,
      sipCallId: existing.callId,
      joinedExistingCall: true,
    });
    if (lineState?.lineSessionKey) {
      await setSessionLineSessionKey(activeSessionId, lineState.lineSessionKey);
    }

    return {
      success: true,
      message: 'Joined existing internal line',
      mediaGroupId,
      sipCallId: existing.callId,
      peerLineId: calleeLineId,
      joinedExistingCall: true,
      internalCall: true,
      sessionId: activeSessionId,
      lineSessionKey: lineState?.lineSessionKey || null,
    };
  }

  if (existing?.call?.status === 'ringing') {
    // Callee pressing the line button should answer, not start a conflicting /call.
    if (existing.call.calleeLineId === callerLineId) {
      return answerInternalIncomingLine({
        lineId: callerLineId,
        userId: resolvedUserId,
        sipCallId: existing.callId,
      });
    }
    if (existing.call.callerLineId !== callerLineId) {
      throw new LineOperationError(409, 'This line already has an active call.');
    }

    const callId = existing.callId;
    const peerMediaGroupId = await ensureLineMediaRouter(calleeLineId);
    if (modeInfo.ringPeer) {
      updateLineCallStatus(callerLineId, callId, 'connected');
      publishLineIncoming({
        lineId: calleeLineId,
        callId,
        sipCallId: callId,
        mediaGroupId: peerMediaGroupId || buildLineMediaGroupId(calleeLineId),
        status: 'ringing',
        internal: true,
        fromLineId: callerLineId,
      });
    }

    const sessionId = `active_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const { sessionId: activeSessionId } = await upsertActiveSession(callerLineId, resolvedUserId, sessionId);
    const mediaGroupId = await ensureLineMediaRouter(callerLineId);
    await setSessionSipCallId(activeSessionId, callId);

    const lineState = openOrJoinSipLine({
      lineId: callerLineId,
      userId: resolvedUserId,
      dbSessionId: activeSessionId,
      mediaGroupId,
      uriAddress: wireInfo.uri_address,
      aor: wireInfo.aor,
      sipCallId: callId,
      joinedExistingCall: true,
    });
    if (lineState?.lineSessionKey) {
      await setSessionLineSessionKey(activeSessionId, lineState.lineSessionKey);
    }

    return {
      success: true,
      message: modeInfo.ringPeer ? 'Internal line ringing far end' : 'Internal line active',
      ringing: !!modeInfo.ringPeer,
      lineMode: modeInfo.mode,
      mediaGroupId,
      sipCallId: callId,
      peerLineId: calleeLineId,
      joinedExistingCall: true,
      internalCall: true,
      sessionId: activeSessionId,
      lineSessionKey: lineState?.lineSessionKey || null,
    };
  }

  const sessionId = `active_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const { sessionId: activeSessionId } = await upsertActiveSession(callerLineId, resolvedUserId, sessionId);

  const mediaGroupId = await ensureLineMediaRouter(callerLineId);
  const peerMediaGroupId = await ensureLineMediaRouter(calleeLineId);

  let matrixRoomId = null;
  try {
    matrixRoomId = await ensureMatrixRoomForLine(callerLineId, resolvedUserId, 'active');
  } catch (error) {
    logger.warn('Matrix room unavailable for internal wire call', { lineId: callerLineId, error: error?.message || error });
  }

  const internalCallId = buildInternalCallId(callerLineId, calleeLineId);
  activeInternalCalls.set(internalCallId, {
    callerLineId,
    calleeLineId,
    status: modeInfo.connectNow ? 'connected' : 'ringing',
    mode: modeInfo.mode,
    createdAt: Date.now(),
  });

  const lineState = openOrJoinSipLine({
    lineId: callerLineId,
    userId: resolvedUserId,
    dbSessionId: activeSessionId,
    mediaGroupId,
    uriAddress: wireInfo.uri_address,
    aor: wireInfo.aor,
    sipCallId: internalCallId,
    joinedExistingCall: false,
  });
  await setSessionSipCallId(activeSessionId, internalCallId);
  if (lineState?.lineSessionKey) {
    await setSessionLineSessionKey(activeSessionId, lineState.lineSessionKey);
  }

  if (modeInfo.connectNow) {
    await connectInternalPair(internalCallId, callerLineId, calleeLineId);
    publishLineIncoming({
      lineId: calleeLineId,
      callId: internalCallId,
      sipCallId: internalCallId,
      mediaGroupId: peerMediaGroupId || buildLineMediaGroupId(calleeLineId),
      status: 'connected',
      internal: true,
      fromLineId: callerLineId,
      autoJoin: true,
    });
  } else if (modeInfo.ringPeer) {
    updateLineCallStatus(callerLineId, internalCallId, 'connected');
    publishLineIncoming({
      lineId: calleeLineId,
      callId: internalCallId,
      sipCallId: internalCallId,
      mediaGroupId: peerMediaGroupId || buildLineMediaGroupId(calleeLineId),
      status: 'ringing',
      internal: true,
      fromLineId: callerLineId,
    });
  }

  logger.info('Internal private wire call started', {
    callerLineId,
    calleeLineId,
    internalCallId,
    mode: modeInfo.mode,
  });

  return {
    success: true,
    message: modeInfo.ringPeer
      ? 'Internal line ringing far end'
      : (modeInfo.mode === 'HOOT' ? 'Hoot line connected' : 'Internal line connected'),
    ringing: !!modeInfo.ringPeer,
    lineMode: modeInfo.mode,
    matrixRoomId,
    mediaGroupId,
    sipCallId: internalCallId,
    peerLineId: calleeLineId,
    joinedExistingCall: false,
    internalCall: true,
    sessionId: activeSessionId,
    lineSessionKey: lineState?.lineSessionKey || null,
  };
}

async function signalInternalPrivateWire({ lineId, wireInfo }) {
  const peerLineId = resolvePeerLineId(wireInfo);
  if (!peerLineId) {
    throw new LineOperationError(500, 'Internal wire is missing its peer line.');
  }

  const callerLineId = String(lineId);
  const calleeLineId = String(peerLineId);

  const activeInternal = findActiveInternalCallForLine(callerLineId);
  let callId;
  if (activeInternal) {
    callId = activeInternal.callId;
  } else {
    callId = buildInternalCallId(callerLineId, calleeLineId);
    activeInternalCalls.set(callId, {
      callerLineId,
      calleeLineId,
      status: 'ringing',
      mode: 'MRD',
      createdAt: Date.now(),
    });
  }

  const call = activeInternalCalls.get(callId);
  if (!call) {
    throw new LineOperationError(500, 'Internal call state lost');
  }
  call.status = 'ringing';
  activeInternalCalls.set(callId, call);

  const peerMediaGroupId = await ensureLineMediaRouter(calleeLineId);
  publishLineIncoming({
    lineId: calleeLineId,
    callId,
    sipCallId: callId,
    mediaGroupId: peerMediaGroupId || buildLineMediaGroupId(calleeLineId),
    status: 'ringing',
    internal: true,
    fromLineId: callerLineId,
  });
  updateLineCallStatus(callerLineId, callId, 'ringing');

  return { success: true, message: 'Ringing signal sent (internal)', sipCallId: callId, internalCall: true };
}

async function answerInternalIncomingLine({ lineId, userId, sipCallId }) {
  const resolvedUserId = await resolveUserDbId(userId);
  const lineIdStr = String(lineId);

  await clearStaleInternalCallForLine(lineIdStr);

  const resolved = sipCallId
    ? { callId: String(sipCallId), call: getInternalCall(sipCallId) }
    : findRingingInternalCallForLine(lineId);

  if (!resolved?.call) return null;
  if (resolved.call.calleeLineId !== lineIdStr) return null;
  if (resolved.call.status !== 'ringing') {
    throw new LineOperationError(409, 'Internal call is no longer ringing');
  }

  const callId = resolved.callId;
  const callerLineId = resolved.call.callerLineId;
  const calleeLineId = resolved.call.calleeLineId;

  resolved.call.status = 'connected';
  activeInternalCalls.set(callId, resolved.call);

  const sessionId = `active_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const { sessionId: activeSessionId } = await upsertActiveSession(calleeLineId, resolvedUserId, sessionId);
  const mediaGroupId = await ensureLineMediaRouter(calleeLineId);

  let matrixRoomId = null;
  try {
    matrixRoomId = await ensureMatrixRoomForLine(calleeLineId, resolvedUserId, 'active');
  } catch (error) {
    logger.warn('Matrix room unavailable when answering internal line', { lineId: calleeLineId, error: error?.message || error });
  }

  await setSessionSipCallId(activeSessionId, callId);

  const lineState = openOrJoinSipLine({
    lineId: calleeLineId,
    userId: resolvedUserId,
    dbSessionId: activeSessionId,
    mediaGroupId,
    sipCallId: callId,
    joinedExistingCall: false,
  });
  if (lineState?.lineSessionKey) {
    await setSessionLineSessionKey(activeSessionId, lineState.lineSessionKey);
  }

  await connectInternalPair(callId, callerLineId, calleeLineId);

  return {
    success: true,
    message: 'Internal call answered',
    matrixRoomId,
    mediaGroupId,
    sipCallId: callId,
    internalCall: true,
    sessionId: activeSessionId,
    lineSessionKey: lineState?.lineSessionKey || null,
  };
}

async function teardownInternalCallIfNeeded(lineId, sipCallId) {
  const call = getInternalCall(sipCallId);
  if (!call) return false;

  call.status = 'ended';
  activeInternalCalls.set(String(sipCallId), call);

  await teardownConferenceForLine(call.callerLineId);
  await teardownConferenceForLine(call.calleeLineId);

  updateLineCallStatus(call.callerLineId, sipCallId, 'ended');
  updateLineCallStatus(call.calleeLineId, sipCallId, 'ended');
  releaseLineCompletely(call.callerLineId, { sipCallId, reason: 'line_released' });
  releaseLineCompletely(call.calleeLineId, { sipCallId, reason: 'line_released' });

  activeInternalCalls.delete(String(sipCallId));
  logger.info('Internal wire call ended', { sipCallId, lineId });
  return true;
}

function isInternalCallId(callId) {
  return String(callId || '').startsWith('int-');
}

function collectInternalRingingLineIds(lineIds = []) {
  const wanted = new Set(lineIds.map(String));
  const ringing = new Set();
  for (const call of activeInternalCalls.values()) {
    if (call.status !== 'ringing') continue;
    if (wanted.has(String(call.calleeLineId))) {
      ringing.add(String(call.calleeLineId));
    }
  }
  return ringing;
}

module.exports = {
  callInternalPrivateWire,
  signalInternalPrivateWire,
  answerInternalIncomingLine,
  teardownInternalCallIfNeeded,
  findRingingInternalCallForLine,
  findActiveInternalCallForLine,
  getInternalCall,
  isInternalCallId,
  collectInternalRingingLineIds,
};
