/**
 * Line-level SIP call aggregation for dealerboard circuits.
 *
 * One private wire / DDI line = one SIP registration (AOR) and ideally one
 * active SIP dialog shared by all traders on that circuit. Multiple users
 * joining the same line reuse the existing call leg instead of placing new INVITEs.
 */

const REUSABLE_SIP_STATUSES = ['connected', 'ringing', 'incoming', 'initiating'];

function parseSharedRoomMinUsers() {
  const parsed = parseInt(process.env.DEALERBOARD_SHARED_ROOM_MIN_USERS || '1', 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

const MIN_USERS_FOR_SHARED_ROOM = parseSharedRoomMinUsers();

function normalizeCallStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function isReusableSipCallStatus(status) {
  return REUSABLE_SIP_STATUSES.includes(normalizeCallStatus(status));
}

/**
 * Find the active SIP call on a line's user agent, preferring connected calls.
 */
function findActiveLineSipCall(sipGateway, lineId) {
  if (!sipGateway?.initialized) {
    return null;
  }

  const ua = sipGateway.getUserAgent(lineId);
  if (!ua) {
    return null;
  }

  const calls = ua.getActiveCalls?.() || [];
  for (const preferredStatus of REUSABLE_SIP_STATUSES) {
    const match = calls.find((call) => normalizeCallStatus(call?.status) === preferredStatus);
    if (match?.callId) {
      return match;
    }
  }

  return null;
}

function resolveSharedSipCallId(sipGateway, lineId, fallbackSipCallId = null) {
  const activeCall = findActiveLineSipCall(sipGateway, lineId);
  if (activeCall?.callId) {
    return { sipCallId: activeCall.callId, joinedExistingCall: true, activeCall };
  }

  if (fallbackSipCallId) {
    return { sipCallId: fallbackSipCallId, joinedExistingCall: false, activeCall: null };
  }

  return { sipCallId: null, joinedExistingCall: false, activeCall: null };
}

module.exports = {
  MIN_USERS_FOR_SHARED_ROOM,
  REUSABLE_SIP_STATUSES,
  isReusableSipCallStatus,
  findActiveLineSipCall,
  resolveSharedSipCallId,
};
