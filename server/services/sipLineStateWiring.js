/**
 * Wire logical SIP line state to Socket.IO and SBC failover events.
 */
const logger = require('../utils/logger');
const {
  setLineEventEmitter,
  openOrJoinSipLine,
  updateLineCallStatus,
  notifySbcPathChange,
  migrateSipCallLeg,
  leaveSipLine,
} = require('./dealerboard/sipLineStateService');
const { replaceActiveLineSipCallId } = require('../db/dealerboard/lineSessions');

function wireSipLineState(io) {
  setLineEventEmitter((eventName, payload) => {
    try {
      // Line events must reach every connected dealerboard/intercom client.
      // Clients filter by assigned lineId; previously events went to a non-existent
      // "global-presence" room while clients only join "presence:all" (admins only).
      io.emit(eventName, payload);
    } catch (error) {
      logger.warn('sipLineState socket emit failed', error?.message || error);
    }
  });
}

async function onSipLineCallStarted(params) {
  return openOrJoinSipLine(params);
}

async function onSipLineCallStatus(lineId, sipCallId, status) {
  return updateLineCallStatus(lineId, sipCallId, status);
}

async function onSbcPathChanged(lineId, ua) {
  return notifySbcPathChange(lineId, {
    sbcRole: ua?._activeEndpointRole || ua?.getSbcEndpointStatus?.()?.activeRole,
    sbcHost: ua?.sbcHost,
    reason: 'sbc_failover',
  });
}

async function onSipLegReplaced(lineId, oldSipCallId, newSipCallId) {
  return migrateSipCallLeg(lineId, oldSipCallId, newSipCallId, {
    updateDbSessions: replaceActiveLineSipCallId,
    rebridgeMedia: async (lid, newId, mediaGroupId) => {
      const { bridgeSipCallToMediaGroup } = require('./dealerboard/lineCallService');
      await bridgeSipCallToMediaGroup(lid, newId, mediaGroupId);
    },
  });
}

function onSipLineUserLeft(lineId, userId) {
  return leaveSipLine(lineId, userId);
}

module.exports = {
  wireSipLineState,
  onSipLineCallStarted,
  onSipLineCallStatus,
  onSbcPathChanged,
  onSipLegReplaced,
  onSipLineUserLeft,
};
