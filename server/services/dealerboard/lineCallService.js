const logger = require('../../utils/logger');
const { applyDialPlan, normalizeDigits } = require('../dialPlanService');
const { getSIPGateway } = require('../sipService');
const { getSIPMatrixBridge } = require('../sipMatrixBridge');
const {
  privateWireExists,
  getPrivateWireForCall,
  getPrivateWireForSignal,
} = require('../../db/dealerboard/privateWires');
const {
  ddiLineExists,
  getActiveDdiLine,
  findInternalDdiByDigits,
} = require('../../db/dealerboard/ddiLines');
const {
  getActiveLineSessionUserIds,
  upsertActiveSession,
  createLineSession,
  setSessionSipCallId,
  getLatestUserSession,
  endActiveUserSession,
  endSessionById,
  getRemainingLineUserIds,
  endAllActiveSessionsForLine,
  getActiveLineSipCallId,
  setSessionLineSessionKey,
} = require('../../db/dealerboard/lineSessions');
const { getRemainingMonitorUserIds } = require('../../db/dealerboard/monitorSessions');
const {
  getSpeedDialForUser,
  resolveDdiLineForUser,
} = require('../../db/dealerboard/speedDials');
const {
  findActiveLineSipCall,
  resolveSharedSipCallId,
} = require('./lineCallAggregation');
const { ensureLineMediaRouter, scopeLineMediaGroupId } = require('./lineMediaService');
const { allocateCallMedia, getCallMediaSession } = require('../sip/sipLineMedia');
const { ensureMatrixRoomForLine } = require('./lineSessionService');
const { resolveOutgoingGatewayUri } = require('./sipRouteResolver');
const { openOrJoinSipLine, leaveSipLine, updateLineCallStatus } = require('./sipLineStateService');
const { LineOperationError } = require('./errors');
const { teardownConferenceForLine } = require('./lineMediaConferenceService');
const {
  callInternalPrivateWire,
  signalInternalPrivateWire,
  answerInternalIncomingLine,
  teardownInternalCallIfNeeded,
  findRingingInternalCallForLine,
  findActiveInternalCallForLine,
  getInternalCall,
  isInternalCallId,
} = require('./internalPrivateWireCallService');

function isInternalWireNotRoutable(wireInfo) {
  const isInternalWire = wireInfo?.metadata?.internalWire === true || wireInfo?.metadata?.internalWire === 'true';
  const uriAddr = (wireInfo.uri_address || '').toString().trim();
  const looksLikeInternalPlaceholder = /^sip:internal-/i.test(uriAddr) && /@internal$/i.test(uriAddr);
  return isInternalWire && looksLikeInternalPlaceholder;
}

function resolvePrivateWireCallMode(wireInfo, { autoRing, hoot }) {
  const st = String(wireInfo.signalling_type || '').trim().toUpperCase();
  const derivedHoot = st === 'NONE';
  const derivedAutoRing = st === 'AUTO_RINGDOWN';

  const shouldHoot = hoot === true || hoot === 'true' || derivedHoot || String(wireInfo.mode || '').toUpperCase() === 'HOOT';
  const shouldAutoRing = autoRing === true || autoRing === 'true' || derivedAutoRing || String(wireInfo.mode || '').toUpperCase() === 'ARD';

  if (shouldHoot) {
    return { immediate: true, mode: 'HOOT' };
  }
  if (shouldAutoRing) {
    return { autoRing: true, mode: 'ARD' };
  }
  return { immediate: true, mode: 'MRD' };
}

async function bridgeSipCallToMediaGroup(lineId, sipCallId, mediaGroupId) {
  const sipGateway = getSIPGateway();
  const ua = sipGateway?.getUserAgent(lineId);
  if (!ua) return;

  const sipCall = ua.getCall(sipCallId);
  if (!sipCall) return;

  const bridge = getSIPMatrixBridge();
  const scopedRouterId = scopeLineMediaGroupId(lineId);

  if (!getCallMediaSession(sipCallId)) {
    try {
      await ensureLineMediaRouter(lineId);
      await allocateCallMedia({ lineId, callId: sipCallId, routerScopeId: scopedRouterId });
    } catch (error) {
      logger.warn('Could not ensure SIP call media before bridge', {
        lineId,
        sipCallId,
        error: error?.message || error,
      });
    }
  }

  const bridgeNow = async (call) => {
    await bridge.bridgeCallToMatrixRoom(lineId, sipCallId, scopedRouterId, {
      localSdp: call.localSdp,
      remoteSdp: call.remoteSdp,
      status: call.status,
    });
    logger.info('SIP call bridged to line media group', {
      callId: sipCallId,
      lineId,
      mediaGroupId,
      scopedRouterId,
      activated: Boolean(call.remoteSdp),
    });
  };

  if (sipCall.status === 'connected' && sipCall.remoteSdp) {
    await bridgeNow(sipCall);
    return;
  }

  const previousCallback = ua.onCallConnected;
  ua.onCallConnected = async (callId, callInfo) => {
    try {
      if (previousCallback) {
        await previousCallback(callId, callInfo);
      }
    } catch (error) {
      logger.warn('Prior onCallConnected handler failed', error?.message || error);
    }
    if (callId !== sipCallId) return;
    if (callInfo?.status === 'connected' && callInfo?.remoteSdp) {
      try {
        await bridgeNow(callInfo);
      } catch (error) {
        logger.error('Failed to bridge SIP call on connect:', error);
      }
    }
  };
}

async function prepareOutgoingSipCallMedia(lineId) {
  const sipGateway = getSIPGateway();
  const ua = sipGateway?.getUserAgent(lineId);
  if (!ua) return null;

  const callId = ua.generateCallId();
  const routerScopeId = scopeLineMediaGroupId(lineId);
  await ensureLineMediaRouter(lineId);
  await allocateCallMedia({ lineId, callId, routerScopeId });
  return callId;
}

async function placePrivateWireSipCall(lineId, wireInfo, callOptions) {
  const sipGateway = getSIPGateway();
  if (!sipGateway?.initialized) {
    logger.warn('SIP Gateway not available - call will be simulated');
    return null;
  }

  const options = resolvePrivateWireCallMode(wireInfo, callOptions);
  const callId = await prepareOutgoingSipCallMedia(lineId);
  if (!callId) return null;

  return sipGateway.makeCall(lineId, wireInfo.uri_address, { ...options, callId });
}

async function teardownSharedLineSipCall(lineId, sipCallId) {
  if (!sipCallId) return;

  try {
    const bridge = getSIPMatrixBridge();
    await bridge.endBridge(sipCallId);
  } catch (error) {
    logger.error(`Failed to end SIP-Matrix bridge for line ${lineId}:`, error);
  }

  try {
    const sipGateway = getSIPGateway();
    if (sipGateway?.initialized) {
      await sipGateway.endCall(lineId, sipCallId);
      logger.info(`Shared SIP call ended for line ${lineId}`, { sipCallId });
    }
  } catch (error) {
    logger.error(`Failed to end shared SIP call for line ${lineId}:`, error);
  }
}

async function acquireOrReuseLineSipCall({ lineId, wireInfo, callOptions, sipGateway }) {
  const dbSipCallId = await getActiveLineSipCallId(lineId);
  const { sipCallId: existingId, joinedExistingCall } = resolveSharedSipCallId(
    sipGateway,
    lineId,
    dbSipCallId
  );

  if (existingId && joinedExistingCall) {
    logger.info(`Reusing shared SIP call on line ${lineId}`, { sipCallId: existingId });
    return { sipCallId: existingId, joinedExistingCall: true };
  }

  const sipCallId = await placePrivateWireSipCall(lineId, wireInfo, callOptions);
  return { sipCallId, joinedExistingCall: false };
}

async function acquireOrReuseDdiSipCall({ lineId, sipGateway, makeCallFn }) {
  const dbSipCallId = await getActiveLineSipCallId(lineId);
  const { sipCallId: existingId, joinedExistingCall } = resolveSharedSipCallId(
    sipGateway,
    lineId,
    dbSipCallId
  );

  if (existingId && joinedExistingCall) {
    logger.info(`Reusing shared DDI SIP call on line ${lineId}`, { sipCallId: existingId });
    return { sipCallId: existingId, joinedExistingCall: true };
  }

  const sipCallId = await makeCallFn();
  return { sipCallId, joinedExistingCall: false };
}

function scheduleDtmfOnConnect({ sipGateway, lineId, sipCallId, dialDigits, ua }) {
  if (!ua || !dialDigits) return;

  const originalCallback = ua.onCallConnected;
  ua.onCallConnected = async (callId, callInfo) => {
    if (originalCallback) {
      await originalCallback(callId, callInfo);
    }
    if (callId !== sipCallId || callInfo.status !== 'connected') return;
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      for (const d of String(dialDigits)) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        await sipGateway.sendDTMF(lineId, sipCallId, d);
      }
    } catch (error) {
      logger.error('DTMF send failed (onCallConnected)', error);
    }
  };

  setTimeout(async () => {
    try {
      const call = ua.getCall?.(sipCallId);
      if (!call || (call.status !== 'connected' && call.status !== 'ringing')) return;
      for (const d of String(dialDigits)) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        await sipGateway.sendDTMF(lineId, sipCallId, d);
      }
    } catch (error) {
      logger.error('DTMF send failed (fallback)', error);
    }
  }, 3000);
}

async function callPrivateWire({ lineId, userId, autoRing, hoot, digits }) {
  if (!(await privateWireExists(lineId))) {
    throw new LineOperationError(404, 'Private wire not found');
  }

  const wireInfo = await getPrivateWireForCall(lineId);
  if (!wireInfo) {
    throw new LineOperationError(404, 'Private wire not found');
  }

  const { resolveUserDbId } = require('../../db/dealerboard/helpers');
  const resolvedUserId = await resolveUserDbId(userId);

  if (isInternalWireNotRoutable(wireInfo)) {
    return callInternalPrivateWire({ lineId, userId: resolvedUserId, autoRing, hoot, wireInfo });
  }

  const sessionId = `active_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const { sessionId: activeSessionId } = await upsertActiveSession(lineId, resolvedUserId, sessionId);

  // Shared media router + optional Matrix room for coordination.
  const mediaGroupId = await ensureLineMediaRouter(lineId);
  let matrixRoomId = null;
  try {
    matrixRoomId = await ensureMatrixRoomForLine(lineId, userId, 'active');
  } catch (error) {
    logger.warn('Matrix room unavailable for dealerboard line', { lineId, error: error?.message || error });
  }
  const activeUsers = await getActiveLineSessionUserIds(lineId);

  const sipGateway = getSIPGateway();
  let sipCallId = null;
  let joinedExistingCall = false;

  let lineState = null;
  try {
    const acquired = await acquireOrReuseLineSipCall({
      lineId,
      wireInfo,
      callOptions: { autoRing, hoot },
      sipGateway,
    });
    sipCallId = acquired.sipCallId;
    joinedExistingCall = acquired.joinedExistingCall;

    if (sipCallId) {
      await setSessionSipCallId(activeSessionId, sipCallId);
      try {
        await bridgeSipCallToMediaGroup(lineId, sipCallId, mediaGroupId);
      } catch (error) {
        logger.error('Failed to bridge SIP call to line media group:', error);
      }
    }

    lineState = openOrJoinSipLine({
      lineId,
      userId,
      dbSessionId: activeSessionId,
      mediaGroupId,
      uriAddress: wireInfo.uri_address,
      aor: wireInfo.aor,
      sipCallId,
      joinedExistingCall,
    });
    if (lineState?.lineSessionKey) {
      await setSessionLineSessionKey(activeSessionId, lineState.lineSessionKey);
    }
  } catch (error) {
    logger.error(`SIP call initiation failed for line ${lineId}:`, error);
  }

  logger.info(`Call initiated on line ${lineId}`, {
    autoRing,
    hoot,
    digits,
    userId,
    matrixRoomId,
    mediaGroupId,
    sipCallId,
    joinedExistingCall,
    activeUsers: activeUsers.length,
  });

  return {
    success: true,
    message: joinedExistingCall ? 'Joined existing line call' : 'Call initiated',
    matrixRoomId,
    mediaGroupId,
    sipCallId,
    lineSessionKey: lineState?.lineSessionKey || null,
    joinedExistingCall,
    sharedLineCall: joinedExistingCall,
    activeUsers: activeUsers.length,
    sessionId: activeSessionId,
  };
}

async function callDdiLine({ lineId, userId, digits: rawDigits }) {
  const ddiLine = await getActiveDdiLine(lineId);
  if (!ddiLine) {
    throw new LineOperationError(404, 'Line not found');
  }

  const ddiLineId = String(ddiLine.id);
  let dialDigits = normalizeDigits(rawDigits);

  let matchedInternalDdi = null;
  if (dialDigits) {
    matchedInternalDdi = await findInternalDdiByDigits(dialDigits);
  }

  let dialPlanRouteId = null;
  if (!matchedInternalDdi) {
    const countryCode = ddiLine.country_code ? String(ddiLine.country_code).trim().toUpperCase() : null;
    if (countryCode && dialDigits) {
      const planned = await applyDialPlan({ countryCode, direction: 'outgoing', number: dialDigits });
      dialDigits = planned?.number || dialDigits;
      dialPlanRouteId = planned?.sipRouteId || null;
    }
  }

  const existingSession = await getLatestUserSession(ddiLineId, userId);
  let sipCallId = existingSession?.metadata?.sipCallId || null;
  let joinedExistingCall = false;
  const sessionId = existingSession?.id || `manualdial_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  if (!existingSession?.id) {
    await createLineSession({
      sessionId,
      lineId: ddiLineId,
      userId,
      metadata: { callType: 'manualDial' },
    });
  }

  const mediaGroupId = await ensureLineMediaRouter(ddiLineId);
  let matrixRoomId = null;
  try {
    matrixRoomId = await ensureMatrixRoomForLine(ddiLineId, userId, 'active');
  } catch (error) {
    logger.warn('Matrix room unavailable for DDI line', { lineId: ddiLineId, error: error?.message || error });
  }

  const sipGateway = getSIPGateway();
  if (!sipGateway?.initialized) {
    logger.warn('SIP Gateway not available - manual dial simulated');
    return {
      success: true,
      message: matchedInternalDdi ? 'Internal DDI dial simulated (SIP not available)' : 'Manual dial simulated (SIP not available)',
      digits: dialDigits,
      ddiLineId,
      routedToDdiLineId: matchedInternalDdi ? String(matchedInternalDdi.id) : undefined,
      sessionId,
    };
  }

  const gatewayUri = await resolveOutgoingGatewayUri({ row: ddiLine, sipRouteId: dialPlanRouteId });

  if (!sipCallId) {
    const acquired = await acquireOrReuseDdiSipCall({
      lineId: ddiLineId,
      sipGateway,
      makeCallFn: async () => {
        const outboundCallId = await prepareOutgoingSipCallMedia(ddiLineId);
        if (!outboundCallId) return null;

        if (matchedInternalDdi) {
          const targetConnection = matchedInternalDdi.connection_details || {};
          const sipDomain = process.env.SIP_DOMAIN || 'localhost';
          const targetUri = targetConnection.uri || `sip:${matchedInternalDdi.line_number}@${sipDomain}`;
          return sipGateway.makeCall(ddiLineId, targetUri, {
            autoAnswer: false,
            mode: 'DDI_INTERNAL',
            callId: outboundCallId,
          });
        }
        return sipGateway.makeCall(ddiLineId, gatewayUri, {
          autoAnswer: false,
          mode: 'DDI',
          callId: outboundCallId,
        });
      },
    });
    sipCallId = acquired.sipCallId;
    joinedExistingCall = acquired.joinedExistingCall;
    await setSessionSipCallId(sessionId, sipCallId);

    if (sipCallId && !joinedExistingCall) {
      try {
        await bridgeSipCallToMediaGroup(ddiLineId, sipCallId, mediaGroupId);
      } catch (error) {
        logger.error('Failed to bridge DDI SIP call to line media group:', error);
      }
    } else if (sipCallId && joinedExistingCall) {
      try {
        await bridgeSipCallToMediaGroup(ddiLineId, sipCallId, mediaGroupId);
      } catch (error) {
        logger.error('Failed to re-bridge shared DDI SIP call:', error);
      }
    }
  }

  if (!dialDigits) {
    logger.info('DDI dial tone call ready (no digits provided)', { ddiLineId, sipCallId, userId, joinedExistingCall });
    return {
      success: true,
      message: joinedExistingCall ? 'Joined existing DDI call' : 'Dial tone ready',
      ddiLineId,
      sipCallId,
      mediaGroupId,
      matrixRoomId,
      joinedExistingCall,
      sessionId,
    };
  }

  if (matchedInternalDdi) {
    const routedToDdiLineId = String(matchedInternalDdi.id);
    logger.info('Dial routed to internal DDI line', { ddiLineId, routedToDdiLineId, sipCallId, userId, digits: dialDigits });
    return {
      success: true,
      message: 'Dialing internal DDI line',
      ddiLineId,
      routedToDdiLineId,
      sipCallId,
      mediaGroupId,
      matrixRoomId,
      joinedExistingCall,
      sessionId,
      digits: dialDigits,
    };
  }

  const ua = sipGateway.getUserAgent(ddiLineId);
  scheduleDtmfOnConnect({ sipGateway, lineId: ddiLineId, sipCallId, dialDigits, ua });

  logger.info('Manual dial initiated on DDI line', { ddiLineId, sipCallId, userId, digits: dialDigits, joinedExistingCall });
  return {
    success: true,
    message: 'Dialing',
    ddiLineId,
    sipCallId,
    mediaGroupId,
    matrixRoomId,
    joinedExistingCall,
    sessionId,
    digits: dialDigits,
  };
}

async function signalPrivateWire({ lineId, userId }) {
  const wireInfo = await getPrivateWireForSignal(lineId);
  if (!wireInfo) {
    throw new LineOperationError(404, 'Private wire not found');
  }

  if (isInternalWireNotRoutable(wireInfo)) {
    return signalInternalPrivateWire({ lineId, wireInfo });
  }

  const signallingType = (wireInfo.signalling_type || '').toString().trim();
  if (signallingType === 'AUTO_RINGDOWN') {
    throw new LineOperationError(
      400,
      'This line is AUTO_RINGDOWN; signalling is automatic and cannot be triggered manually.'
    );
  }
  if (signallingType === 'NONE') {
    throw new LineOperationError(
      400,
      'This line does not support signalling (HOOT/BROADCAST / shout-down).'
    );
  }
  if (signallingType !== 'MANUAL_RINGDOWN') {
    throw new LineOperationError(400, 'Unknown signalling_type for line.');
  }

  const sipGateway = getSIPGateway();
  if (sipGateway?.initialized) {
    const activeCall = findActiveLineSipCall(sipGateway, lineId);
    if (activeCall) {
      logger.info(`MRD signal skipped — line ${lineId} already has active SIP call`, {
        userId,
        sipCallId: activeCall.callId,
        status: activeCall.status,
      });
      return {
        success: true,
        message: 'Line already active',
        sipCallId: activeCall.callId,
        joinedExistingCall: true,
      };
    }

    await sipGateway.sendRingingSignal(lineId, wireInfo.uri_address);
    logger.info(`Ringing signal sent for line ${lineId}`, { userId });
    return { success: true, message: 'Ringing signal sent' };
  }

  logger.warn('SIP Gateway not available - signal simulated');
  return { success: true, message: 'Signal simulated (SIP not available)' };
}

async function endLineCall({ lineId, userId }) {
  const { resolveUserDbId } = require('../../db/dealerboard/helpers');
  const resolvedUserId = await resolveUserDbId(userId);

  const session = await getLatestUserSession(lineId, resolvedUserId);
  let sipCallId = session?.metadata?.sipCallId || null;

  const internalMatch = findActiveInternalCallForLine(lineId);
  if (!sipCallId && internalMatch?.callId) {
    sipCallId = internalMatch.callId;
  }

  const internalCall = sipCallId ? getInternalCall(sipCallId) : internalMatch?.call;
  const isInternalPairCall = Boolean(internalCall && internalCall.status !== 'ended');

  await endActiveUserSession(lineId, resolvedUserId, 'active');
  leaveSipLine(lineId, resolvedUserId);

  try {
    await teardownConferenceForLine(lineId);
  } catch (error) {
    logger.warn('Failed to tear down line conference', { lineId, error: error?.message || error });
  }

  if (isInternalPairCall && sipCallId) {
    await endAllActiveSessionsForLine(internalCall.callerLineId);
    await endAllActiveSessionsForLine(internalCall.calleeLineId);
    await teardownInternalCallIfNeeded(lineId, sipCallId);

    return {
      success: true,
      remainingUsers: 0,
      lineReleased: true,
      internalCallEnded: true,
    };
  }

  const remainingUsers = await getRemainingLineUserIds(lineId);

  // Only tear down the shared SBC leg when the last trader leaves the circuit.
  if (remainingUsers.length === 0) {
    if (sipCallId && isInternalCallId(sipCallId)) {
      await teardownInternalCallIfNeeded(lineId, sipCallId);
    } else {
      const sipGateway = getSIPGateway();
      const activeCall = findActiveLineSipCall(sipGateway, lineId);
      const callToEnd = activeCall?.callId || sipCallId;
      await teardownSharedLineSipCall(lineId, callToEnd);
    }
  }

  const monitorUsers = await getRemainingMonitorUserIds(lineId);
  const allRemainingUsers = new Set([...remainingUsers, ...monitorUsers]);

  return {
    success: true,
    remainingUsers: allRemainingUsers.size,
    lineReleased: remainingUsers.length === 0,
  };
}

async function endPrivateWireCall({ lineId, userId }) {
  return endLineCall({ lineId, userId });
}

async function sendDtmf({ lineId, userId, digit, callId }) {
  if (!digit) {
    throw new LineOperationError(400, 'Digit required');
  }

  const session = await getLatestUserSession(lineId, userId);
  const sipGateway = getSIPGateway();
  const sharedCall = findActiveLineSipCall(sipGateway, lineId);
  const sipCallId = callId || session?.metadata?.sipCallId || sharedCall?.callId;

  if (!sipCallId) {
    throw new LineOperationError(400, 'No active call found. Please initiate a call first.');
  }

  if (sipGateway?.initialized) {
    await sipGateway.sendDTMF(lineId, sipCallId, digit);
    logger.info(`DTMF digit ${digit} sent for line ${lineId}`, { userId, sipCallId });
    return { success: true, message: `DTMF digit ${digit} sent` };
  }

  logger.warn('SIP Gateway not available - DTMF simulated');
  return { success: true, message: `DTMF digit ${digit} simulated (SIP not available)` };
}

async function callSpeedDial({ speedDialId, userId }) {
  const speedDial = await getSpeedDialForUser(speedDialId, userId);
  if (!speedDial) {
    throw new LineOperationError(404, 'Speed dial not found');
  }

  const targetNumber = speedDial.number;
  if (!targetNumber || targetNumber.trim() === '') {
    throw new LineOperationError(400, 'Speed dial number is empty');
  }

  const { ddiLine, source } = await resolveDdiLineForUser(userId);
  if (!ddiLine) {
    throw new LineOperationError(
      400,
      'No DDI line available. Please assign a DDI line to a button or set a default DDI line in your preferences.'
    );
  }

  const ddiLineId = ddiLine.id;
  logger.info(`Using ${source} DDI line for speed dial`, { userId, ddiLineId });

  let dialDigits = normalizeDigits(targetNumber);
  const dialCountryCode = ddiLine.country_code || ddiLine.countryCode || null;
  let dialPlanRouteId = null;
  if (dialCountryCode) {
    const planned = await applyDialPlan({ countryCode: dialCountryCode, direction: 'outgoing', number: dialDigits });
    dialDigits = planned?.number || dialDigits;
    dialPlanRouteId = planned?.sipRouteId || null;
  }

  const sessionId = `speeddial_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await createLineSession({
    sessionId,
    lineId: ddiLineId,
    userId,
    metadata: {
      speedDialId,
      speedDialName: speedDial.name,
      targetNumber,
      callType: 'speedDial',
    },
  });

  try {
    const sipGateway = getSIPGateway();
    if (!sipGateway?.initialized) {
      logger.warn('SIP Gateway not available - speed dial call simulated');
      return {
        success: true,
        message: `Speed dial call to ${speedDial.name} (${targetNumber}) simulated (SIP not available)`,
        speedDialId,
        speedDialName: speedDial.name,
        targetNumber,
        ddiLineId,
        sessionId,
      };
    }

    const gatewayUri = await resolveOutgoingGatewayUri({ row: ddiLine, sipRouteId: dialPlanRouteId });

    const existingSession = await getLatestUserSession(ddiLineId, userId);
    let sipCallId = existingSession?.metadata?.sipCallId || null;
    let joinedExistingCall = false;

    if (!sipCallId) {
      const acquired = await acquireOrReuseDdiSipCall({
        lineId: ddiLineId,
        sipGateway,
        makeCallFn: async () => {
          const outboundCallId = await prepareOutgoingSipCallMedia(ddiLineId);
          if (!outboundCallId) return null;
          return sipGateway.makeCall(ddiLineId, gatewayUri, {
            autoAnswer: false,
            mode: 'DDI',
            callId: outboundCallId,
          });
        },
      });
      sipCallId = acquired.sipCallId;
      joinedExistingCall = acquired.joinedExistingCall;
      await setSessionSipCallId(sessionId, sipCallId);
    } else {
      joinedExistingCall = true;
    }

    if (joinedExistingCall || sipCallId) {
      setTimeout(async () => {
        try {
          for (const d of String(dialDigits)) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            await sipGateway.sendDTMF(ddiLineId, sipCallId, d);
          }
          logger.info(`Speed dial number ${targetNumber} dialed on shared DDI call`, {
            speedDialId,
            ddiLineId,
            sipCallId,
            joinedExistingCall,
          });
        } catch (error) {
          logger.error('Failed to send DTMF digits on shared call:', error);
        }
      }, joinedExistingCall ? 100 : 500);
    }

    if (!joinedExistingCall) {
      const ua = sipGateway.getUserAgent(ddiLineId);
      if (ua) {
        const originalCallback = ua.onCallConnected;
        ua.onCallConnected = async (callId, callInfo) => {
          if (originalCallback) {
            await originalCallback(callId, callInfo);
          }
          if (callId !== sipCallId || callInfo.status !== 'connected') return;
          try {
            await new Promise((resolve) => setTimeout(resolve, 500));
            for (const d of String(dialDigits)) {
              await new Promise((resolve) => setTimeout(resolve, 200));
              await sipGateway.sendDTMF(ddiLineId, sipCallId, d);
            }
            logger.info(`Speed dial number ${targetNumber} dialed via DDI line ${ddiLineId}`, {
              speedDialId,
              speedDialName: speedDial.name,
              ddiLineId,
              sipCallId,
              userId,
            });
          } catch (error) {
            logger.error('Failed to send DTMF digits for speed dial:', error);
          }
        };
      }

      setTimeout(async () => {
        try {
          const uaRef = sipGateway.getUserAgent(ddiLineId);
          const call = uaRef?.getCall(sipCallId);
          if (call && (call.status === 'connected' || call.status === 'ringing')) {
            for (const d of String(dialDigits)) {
              await new Promise((resolve) => setTimeout(resolve, 200));
              await sipGateway.sendDTMF(ddiLineId, sipCallId, d);
            }
            logger.info(`Speed dial number ${targetNumber} dialed (fallback)`, {
              speedDialId,
              ddiLineId,
              sipCallId,
            });
          }
        } catch (error) {
          logger.error('Failed to send DTMF digits (fallback):', error);
        }
      }, 3000);
    }

    logger.info('Speed dial call initiated', {
      speedDialId,
      speedDialName: speedDial.name,
      targetNumber,
      ddiLineId,
      sipCallId,
      joinedExistingCall,
      userId,
    });

    return {
      success: true,
      message: joinedExistingCall
        ? `Joined shared line — dialing ${speedDial.name} (${targetNumber})`
        : `Calling ${speedDial.name} (${targetNumber})`,
      speedDialId,
      speedDialName: speedDial.name,
      targetNumber,
      ddiLineId,
      sipCallId,
      joinedExistingCall,
      sessionId,
    };
  } catch (error) {
    await endSessionById(sessionId);
    throw error;
  }
}

function findRingingSipCallId(sipGateway, lineId, sipCallIdHint) {
  if (sipCallIdHint && isInternalCallId(sipCallIdHint)) {
    return String(sipCallIdHint);
  }
  const internal = findRingingInternalCallForLine(lineId);
  if (internal) return internal.callId;

  if (sipCallIdHint) return String(sipCallIdHint);
  const ua = sipGateway?.getUserAgent(lineId);
  const calls = ua?.getActiveCalls?.() || [];
  const match = calls.find((call) => {
    const st = String(call?.status || '').toLowerCase();
    return st === 'ringing' || st === 'incoming';
  });
  return match?.callId ? String(match.callId) : null;
}

async function answerIncomingLine({ lineId, userId, sipCallId }) {
  const exists = (await privateWireExists(lineId)) || (await ddiLineExists(lineId));
  if (!exists) {
    throw new LineOperationError(404, 'Line not found');
  }

  const internalResult = await answerInternalIncomingLine({ lineId, userId, sipCallId });
  if (internalResult) {
    return internalResult;
  }

  const sipGateway = getSIPGateway();
  if (!sipGateway?.initialized) {
    throw new LineOperationError(503, 'SIP gateway not available');
  }

  const resolvedCallId = findRingingSipCallId(sipGateway, lineId, sipCallId);
  if (!resolvedCallId) {
    throw new LineOperationError(409, 'No ringing call on this line');
  }

  const ua = sipGateway.getUserAgent(lineId);
  if (!ua?.answerIncomingCall) {
    throw new LineOperationError(503, 'SIP user agent not available for line');
  }

  const routerScopeId = scopeLineMediaGroupId(lineId);
  await ensureLineMediaRouter(lineId);
  await allocateCallMedia({ lineId, callId: resolvedCallId, routerScopeId });

  await ua.answerIncomingCall(resolvedCallId);

  const sessionId = `active_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const { sessionId: activeSessionId } = await upsertActiveSession(lineId, userId, sessionId);

  const mediaGroupId = await ensureLineMediaRouter(lineId);
  let matrixRoomId = null;
  try {
    matrixRoomId = await ensureMatrixRoomForLine(lineId, userId, 'active');
  } catch (error) {
    logger.warn('Matrix room unavailable when answering incoming line', { lineId, error: error?.message || error });
  }

  await setSessionSipCallId(activeSessionId, resolvedCallId);
  try {
    await bridgeSipCallToMediaGroup(lineId, resolvedCallId, mediaGroupId);
  } catch (error) {
    logger.error('Failed to bridge answered SIP call to line media group:', error);
  }

  let wireInfo = null;
  if (await privateWireExists(lineId)) {
    wireInfo = await getPrivateWireForCall(lineId);
  }

  const lineState = openOrJoinSipLine({
    lineId,
    userId,
    dbSessionId: activeSessionId,
    mediaGroupId,
    uriAddress: wireInfo?.uri_address || null,
    aor: wireInfo?.aor || null,
    sipCallId: resolvedCallId,
    joinedExistingCall: false,
  });
  if (lineState?.lineSessionKey) {
    await setSessionLineSessionKey(activeSessionId, lineState.lineSessionKey);
  }
  updateLineCallStatus(lineId, resolvedCallId, 'connected');

  return {
    success: true,
    message: 'Incoming call answered',
    matrixRoomId,
    mediaGroupId,
    sipCallId: resolvedCallId,
    lineSessionKey: lineState?.lineSessionKey || null,
    sessionId: activeSessionId,
  };
}

async function endLegacyLine({ lineId, userId }) {
  if (await privateWireExists(lineId)) {
    return { forwardTo: `/private-wires/${lineId}/end` };
  }
  if (await ddiLineExists(lineId)) {
    if (userId) {
      return endLineCall({ lineId, userId });
    }
    logger.info(`DDI call ended on line ${lineId}`);
    return { success: true, message: 'DDI call ended' };
  }
  throw new LineOperationError(404, 'Line not found');
}

module.exports = {
  callPrivateWire,
  callDdiLine,
  signalPrivateWire,
  endPrivateWireCall,
  endLineCall,
  sendDtmf,
  callSpeedDial,
  answerIncomingLine,
  endLegacyLine,
  privateWireExists,
  ddiLineExists,
  bridgeSipCallToMediaGroup,
};
