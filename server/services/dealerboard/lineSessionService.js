const logger = require('../../utils/logger');
const { getSIPGateway } = require('../sipService');
const { getSIPMatrixBridge } = require('../sipMatrixBridge');
const {
  getActiveLineUserIds,
  findExistingMatrixRoomId,
  updateLineSessionMatrixRoomId,
  updateAllLineSessionsMatrixRoomId,
  getPrivateWireLineInfo,
  getMatrixRoomHomeserverId,
} = require('../../db/dealerboard/lineSessions');
const { MIN_USERS_FOR_SHARED_ROOM, isReusableSipCallStatus } = require('./lineCallAggregation');
const { scopeLineMediaGroupId } = require('./lineMediaService');

async function bridgeActiveSIPCallsToLineMedia(lineId) {
  const matrixRoomId = scopeLineMediaGroupId(lineId);
  try {
    const sipGateway = getSIPGateway();
    if (!sipGateway || !sipGateway.initialized) {
      return;
    }

    const ua = sipGateway.getUserAgent(lineId);
    if (!ua) {
      return;
    }

    const activeCalls = ua.getActiveCalls();
    const bridge = getSIPMatrixBridge();

    for (const call of activeCalls) {
      if (!call.callId || !isReusableSipCallStatus(call.status)) {
        continue;
      }
      try {
        await bridge.bridgeCallToMatrixRoom(lineId, call.callId, matrixRoomId, {
          localSdp: call.localSdp,
          remoteSdp: call.remoteSdp,
          status: call.status,
        });
        logger.info('Bridged active SIP call to line media router', {
          callId: call.callId,
          lineId,
          scopedRouterId: matrixRoomId,
          status: call.status,
        });
      } catch (error) {
        logger.error('Failed to bridge active SIP call:', error);
      }
    }

    sipGateway.setCallConnectedCallback(lineId, async (callId, call) => {
      if (call.status === 'connected') {
        try {
          await bridge.bridgeCallToMatrixRoom(lineId, callId, matrixRoomId, {
            localSdp: call.localSdp,
            remoteSdp: call.remoteSdp,
            status: call.status,
          });
          logger.info('Auto-bridged newly connected SIP call to line media router', {
            callId,
            lineId,
            scopedRouterId: matrixRoomId,
          });
        } catch (error) {
          logger.error('Failed to auto-bridge SIP call:', error);
        }
      }
    });
  } catch (error) {
    logger.error('Failed to bridge active SIP calls to line media router:', error);
  }
}

async function bridgeActiveSIPCallsToMatrixRoom(lineId, _matrixRoomId) {
  await bridgeActiveSIPCallsToLineMedia(lineId);
}

async function ensureMatrixRoomForLine(lineId, userId, sessionType = 'active') {
  try {
    const { matrixService } = require('../matrixService');
    const { getOrchestratorService } = require('../orchestratorService');

    const activeUsers = await getActiveLineUserIds(lineId);
    let matrixRoomId = null;

    if (activeUsers.length >= MIN_USERS_FOR_SHARED_ROOM) {
      matrixRoomId = await findExistingMatrixRoomId(lineId);

      if (matrixRoomId) {
        const matrixUserId = await matrixService.getMatrixUserId(userId);
        if (matrixUserId) {
          await matrixService.joinRoom(matrixRoomId, userId);
        }
        await updateLineSessionMatrixRoomId(lineId, userId, matrixRoomId, sessionType);
      } else {
        const lineInfo = await getPrivateWireLineInfo(lineId);
        if (lineInfo) {
          const roomName = `${lineInfo.line_label}`;
          const roomTopic = `Communication room for ${lineInfo.line_label} (${lineInfo.mode} mode)`;

          const matrixUserIds = [];
          for (const uid of activeUsers) {
            const muid = await matrixService.getMatrixUserId(uid);
            if (muid) {
              matrixUserIds.push(muid);
            }
          }

          const monitorGroupId = `line_${lineId}_${Date.now()}`;
          matrixRoomId = await matrixService.createGroupRoom(monitorGroupId, {
            name: roomName,
            description: roomTopic,
            members: matrixUserIds,
            participants: activeUsers,
          });

          const roomAssignment = await getMatrixRoomHomeserverId(matrixRoomId);
          const homeserverId = roomAssignment?.homeserver_id;

          await updateAllLineSessionsMatrixRoomId(lineId, matrixRoomId);

          if (homeserverId) {
            const orchestratorService = getOrchestratorService();
            for (const uid of activeUsers) {
              await orchestratorService.trackParticipant(matrixRoomId, uid, homeserverId);
            }
          }

          await bridgeActiveSIPCallsToLineMedia(lineId);

          logger.info('Created Matrix room for line usage', {
            lineId,
            matrixRoomId,
            activeUsers: activeUsers.length,
            homeserverId,
          });
        }
      }
    }

    return matrixRoomId;
  } catch (error) {
    logger.error('Failed to ensure Matrix room for line:', error);
    return null;
  }
}

module.exports = {
  MIN_USERS_FOR_SHARED_ROOM,
  bridgeActiveSIPCallsToMatrixRoom,
  bridgeActiveSIPCallsToLineMedia,
  ensureMatrixRoomForLine,
};
