/**
 * Logical SIP line state for dealerboard buttons.
 *
 * These are SIP registrations / dialogs via SBC — not electrical circuits.
 * One dealerboard lineId + button maps to one logical SIP identity (AOR/URI).
 * Primary and secondary SBC paths are alternate routes to the SAME line;
 * user-visible state (button, busy, media) stays on lineId regardless of SBC path.
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const { buildLineMediaGroupId } = require('./lineMediaService');

/** lineId -> logical state */
const activeLines = new Map();

/** sipCallId -> lineId (for leg migration lookups) */
const sipCallToLine = new Map();

let emitLineEvent = null;

function setLineEventEmitter(fn) {
  emitLineEvent = typeof fn === 'function' ? fn : null;
}

function publish(eventName, payload) {
  try {
    emitLineEvent?.(eventName, payload);
  } catch (error) {
    logger.warn('sipLineState publish failed', error?.message || error);
  }
}

function getLineState(lineId) {
  return activeLines.get(String(lineId)) || null;
}

function buildLineSessionKey(lineId) {
  return `sip-line:${String(lineId)}:${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Open or join logical SIP line state when a user activates a dealerboard button.
 */
function openOrJoinSipLine({
  lineId,
  userId,
  dbSessionId,
  mediaGroupId,
  uriAddress,
  aor,
  sipCallId,
  joinedExistingCall,
}) {
  const id = String(lineId);
  let state = activeLines.get(id);

  if (!state) {
    state = {
      lineId: id,
      lineSessionKey: buildLineSessionKey(id),
      mediaGroupId: mediaGroupId || buildLineMediaGroupId(id),
      uriAddress: uriAddress || null,
      aor: aor || null,
      sipCallId: sipCallId || null,
      sbcRole: 'primary',
      sbcHost: null,
      status: sipCallId ? 'initiating' : 'idle',
      userIds: new Set(),
      dbSessionIds: new Set(),
      createdAt: new Date().toISOString(),
    };
    activeLines.set(id, state);
  }

  if (userId) state.userIds.add(String(userId));
  if (dbSessionId) state.dbSessionIds.add(String(dbSessionId));
  if (mediaGroupId) state.mediaGroupId = mediaGroupId;
  if (uriAddress) state.uriAddress = uriAddress;
  if (aor) state.aor = aor;
  if (sipCallId) {
    if (state.sipCallId && state.sipCallId !== sipCallId) {
      sipCallToLine.delete(state.sipCallId);
    }
    state.sipCallId = sipCallId;
    sipCallToLine.set(sipCallId, id);
  }

  publish('line-sip-state', toPublicState(state, {
    reason: joinedExistingCall ? 'joined_existing' : 'call_started',
    userId,
  }));

  return state;
}

function updateLineCallStatus(lineId, sipCallId, status) {
  const state = activeLines.get(String(lineId));
  if (!state) return null;

  state.status = status || state.status;
  if (sipCallId) {
    if (state.sipCallId && state.sipCallId !== sipCallId) {
      sipCallToLine.delete(state.sipCallId);
    }
    state.sipCallId = sipCallId;
    sipCallToLine.set(sipCallId, String(lineId));
  }

  publish('line-sip-state', toPublicState(state, { reason: 'status_changed' }));
  return state;
}

/**
 * SBC path changed (primary ↔ secondary) — same logical SIP line, same button.
 */
function notifySbcPathChange(lineId, { sbcRole, sbcHost, reason }) {
  const state = activeLines.get(String(lineId));
  if (!state) return null;

  state.sbcRole = sbcRole || state.sbcRole;
  state.sbcHost = sbcHost || state.sbcHost;

  publish('line-sip-state', toPublicState(state, {
    reason: reason || 'sbc_path_changed',
    sbcFailover: sbcRole === 'secondary',
  }));

  logger.info('SIP line SBC path changed (logical line unchanged)', {
    lineId,
    lineSessionKey: state.lineSessionKey,
    sbcRole: state.sbcRole,
    sbcHost: state.sbcHost,
    status: state.status,
  });

  return state;
}

/**
 * SIP dialog Call-ID changed after SBC failover — migrate state, keep lineId/button.
 */
async function migrateSipCallLeg(lineId, oldSipCallId, newSipCallId, deps = {}) {
  const id = String(lineId);
  const state = activeLines.get(id);
  if (!state) return null;

  const oldId = oldSipCallId ? String(oldSipCallId) : state.sipCallId;
  const newId = String(newSipCallId);

  if (oldId) sipCallToLine.delete(oldId);
  sipCallToLine.set(newId, id);
  state.sipCallId = newId;

  if (typeof deps.updateDbSessions === 'function') {
    try {
      await deps.updateDbSessions(id, oldId, newId);
    } catch (error) {
      logger.error('Failed to update DB sessions after SIP leg migration', error);
    }
  }

  if (typeof deps.rebridgeMedia === 'function') {
    try {
      await deps.rebridgeMedia(id, newId, state.mediaGroupId);
    } catch (error) {
      logger.error('Failed to re-bridge media after SIP leg migration', error);
    }
  }

  publish('line-sip-state', toPublicState(state, {
    reason: 'sip_leg_migrated',
    previousSipCallId: oldId,
    sipCallId: newId,
  }));

  logger.info('SIP call leg migrated on same logical line', {
    lineId: id,
    lineSessionKey: state.lineSessionKey,
    oldSipCallId: oldId,
    newSipCallId: newId,
  });

  return state;
}

function resolveLineIdFromSipCallId(sipCallId) {
  return sipCallToLine.get(String(sipCallId)) || null;
}

function leaveSipLine(lineId, userId) {
  const id = String(lineId);
  const state = activeLines.get(id);
  if (!state) return null;

  if (userId) state.userIds.delete(String(userId));

  if (state.userIds.size === 0) {
    if (state.sipCallId) sipCallToLine.delete(state.sipCallId);
    activeLines.delete(id);
    publish('line-sip-state', {
      lineId: id,
      lineSessionKey: state.lineSessionKey,
      status: 'idle',
      reason: 'line_released',
    });
    return null;
  }

  publish('line-sip-state', toPublicState(state, { reason: 'user_left', userId }));
  return state;
}

/** Force idle/ended for a logical line and notify all clients (internal wires, remote hang-up). */
function releaseLineCompletely(lineId, extra = {}) {
  const id = String(lineId);
  const state = activeLines.get(id);
  if (state?.sipCallId) sipCallToLine.delete(state.sipCallId);
  if (state) activeLines.delete(id);

  publish('line-sip-state', {
    lineId: id,
    lineSessionKey: state?.lineSessionKey || null,
    mediaGroupId: state?.mediaGroupId || null,
    sipCallId: state?.sipCallId || extra.sipCallId || null,
    status: 'ended',
    reason: extra.reason || 'line_released',
    timestamp: new Date().toISOString(),
  });
}

function toPublicState(state, extra = {}) {
  return {
    lineId: state.lineId,
    lineSessionKey: state.lineSessionKey,
    mediaGroupId: state.mediaGroupId,
    uriAddress: state.uriAddress,
    aor: state.aor,
    sipCallId: state.sipCallId,
    sbcRole: state.sbcRole,
    sbcHost: state.sbcHost,
    status: state.status,
    activeUsers: state.userIds.size,
    ...extra,
    timestamp: new Date().toISOString(),
  };
}

function getAllActiveLineStates() {
  return Array.from(activeLines.values()).map((s) => toPublicState(s));
}

function publishLineConferenceState(lineId, partnerLineId, extra = {}) {
  const state = activeLines.get(String(lineId));
  publish('line-sip-state', {
    lineId: String(lineId),
    lineSessionKey: state?.lineSessionKey || null,
    mediaGroupId: state?.mediaGroupId || null,
    status: partnerLineId ? 'conferenced' : (state?.status || 'idle'),
    conferencePartnerLineId: partnerLineId ? String(partnerLineId) : null,
    ...extra,
    timestamp: new Date().toISOString(),
  });
}

function publishLineIncoming(payload) {
  const body = {
    ...payload,
    timestamp: new Date().toISOString(),
  };
  publish('line-sip-incoming', body);

  // Mirror incoming ring on line-sip-state so dealerboard clients keep button ringing
  // in sync (polling + state handlers rely on status=ringing for the callee lineId).
  const lineId = payload?.lineId;
  const status = String(payload?.status || 'ringing').toLowerCase();
  if (lineId && (status === 'ringing' || status === 'incoming')) {
    publish('line-sip-state', {
      lineId: String(lineId),
      lineSessionKey: null,
      mediaGroupId: payload?.mediaGroupId || null,
      sipCallId: payload?.sipCallId || payload?.callId || null,
      status: 'ringing',
      reason: 'incoming_call',
      fromLineId: payload?.fromLineId || null,
      internal: payload?.internal === true,
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = {
  setLineEventEmitter,
  getLineState,
  openOrJoinSipLine,
  updateLineCallStatus,
  notifySbcPathChange,
  migrateSipCallLeg,
  resolveLineIdFromSipCallId,
  leaveSipLine,
  releaseLineCompletely,
  getAllActiveLineStates,
  publishLineConferenceState,
  publishLineIncoming,
};
