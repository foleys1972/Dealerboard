const logger = require('../utils/logger');
const {
  allocateCallMedia,
  activateCallMedia,
  releaseCallMedia,
  getCallMediaSession,
} = require('./sip/sipLineMedia');
const { syncLineCallAudio } = require('./sip/sipLineAudioBridge');

/**
 * Bridge SIP RTP to the line MediaSoup router (dealerboard-line:{lineId} scope).
 * Media allocation must happen before the SIP INVITE/answer SDP is sent.
 */
class SIPMatrixBridge {
  constructor() {
    this.activeBridges = new Map();
  }

  async bridgeCallToMatrixRoom(lineId, callId, routerScopeId, sipCallInfo = {}) {
    try {
      if (this.activeBridges.has(callId)) {
        return this.activeBridges.get(callId);
      }

      let session = getCallMediaSession(callId);
      if (!session) {
        await allocateCallMedia({
          lineId,
          callId,
          routerScopeId,
        });
        session = getCallMediaSession(callId);
      }

      const remoteSdp = sipCallInfo.remoteSdp || null;
      if (remoteSdp) {
        await activateCallMedia(callId, remoteSdp);
        try {
          await syncLineCallAudio(callId);
        } catch (audioError) {
          logger.warn('SIP line audio sync failed after media activation', {
            callId,
            lineId,
            error: audioError?.message || audioError,
          });
        }
      }

      const bridgeInfo = {
        callId,
        lineId,
        routerScopeId,
        session,
        producer: session?.producer || null,
        isActive: true,
        createdAt: new Date(),
      };

      this.activeBridges.set(callId, bridgeInfo);

      logger.info('SIP call bridged to line media router', {
        callId,
        lineId,
        routerScopeId,
        producerId: bridgeInfo.producer?.id || null,
        hasRemoteSdp: Boolean(remoteSdp),
      });

      return bridgeInfo;
    } catch (error) {
      logger.error('Failed to bridge SIP call to line media router:', error);
      throw error;
    }
  }

  async endBridge(callId) {
    try {
      await releaseCallMedia(callId);
      this.activeBridges.delete(callId);
      logger.info(`Bridge ended for call ${callId}`);
    } catch (error) {
      logger.error(`Error ending bridge for call ${callId}:`, error);
    }
  }

  getBridge(callId) {
    return this.activeBridges.get(callId) || null;
  }

  getAllBridges() {
    return Array.from(this.activeBridges.values());
  }
}

let sipMatrixBridgeInstance = null;

function getSIPMatrixBridge() {
  if (!sipMatrixBridgeInstance) {
    sipMatrixBridgeInstance = new SIPMatrixBridge();
  }
  return sipMatrixBridgeInstance;
}

module.exports = {
  getSIPMatrixBridge,
  SIPMatrixBridge,
};
