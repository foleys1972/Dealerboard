const logger = require('../../utils/logger');
const {
  getActiveMonitorSession,
  createMonitorSession,
  endMonitorSession,
  getActiveMonitorSessions,
  findMonitorMatrixRoomId,
  setMonitorSessionsMatrixRoomId,
  countActiveMonitorSessions,
} = require('../../db/dealerboard/monitorSessions');
const {
  getPrivateWireLineInfo,
  getMatrixRoomHomeserverId,
  findExistingMatrixRoomId,
} = require('../../db/dealerboard/lineSessions');
const { LineOperationError } = require('./errors');
const { buildLineMediaGroupId, ensureLineMediaRouter } = require('./lineMediaService');

const MIN_USERS_FOR_MONITOR_ROOM = Math.max(
  1,
  parseInt(process.env.DEALERBOARD_MONITOR_ROOM_MIN_USERS || '1', 10) || 1
);

async function ensureMonitorMatrixRoom(lineId, userId, monitoringUserIds) {
  const { matrixService } = require('../matrixService');
  const { getOrchestratorService } = require('../orchestratorService');

  let matrixRoomId = await findMonitorMatrixRoomId(lineId);

  if (matrixRoomId) {
    const matrixUserId = await matrixService.getMatrixUserId(userId);
    if (matrixUserId) {
      await matrixService.joinRoom(matrixRoomId, userId);
    }
    return matrixRoomId;
  }

  const lineInfo = await getPrivateWireLineInfo(lineId);
  if (!lineInfo) {
    return null;
  }

  const roomName = `Monitor: ${lineInfo.line_label}`;
  const roomTopic = `Monitoring session for ${lineInfo.line_label} (${lineInfo.mode} mode)`;

  const matrixUserIds = [];
  for (const uid of monitoringUserIds) {
    const muid = await matrixService.getMatrixUserId(uid);
    if (muid) {
      matrixUserIds.push(muid);
    }
  }

  const monitorGroupId = `monitor_${lineId}_${Date.now()}`;
  matrixRoomId = await matrixService.createGroupRoom(monitorGroupId, {
    name: roomName,
    description: roomTopic,
    members: matrixUserIds,
    participants: monitoringUserIds,
  });

  const roomAssignment = await getMatrixRoomHomeserverId(matrixRoomId);
  const homeserverId = roomAssignment?.homeserver_id;

  await setMonitorSessionsMatrixRoomId(lineId, matrixRoomId);

  if (homeserverId) {
    const orchestratorService = getOrchestratorService();
    for (const uid of monitoringUserIds) {
      await orchestratorService.trackParticipant(matrixRoomId, uid, homeserverId);
    }
  }

  logger.info('Created Matrix room for monitor session', {
    lineId,
    matrixRoomId,
    monitoringUsers: monitoringUserIds.length,
    homeserverId,
  });

  return matrixRoomId;
}

async function toggleMonitor({ lineId, userId, enabled }) {
  const mediaGroupId = buildLineMediaGroupId(lineId);

  if (enabled) {
    try {
      await ensureLineMediaRouter(lineId);
    } catch (error) {
      logger.warn('Failed to ensure line media router for monitor', { lineId, error: error?.message || error });
    }

    const existingSession = await getActiveMonitorSession(lineId, userId);
    if (existingSession) {
      return {
        success: true,
        message: 'Already monitoring this line',
        sessionId: existingSession.id,
        matrixRoomId: existingSession.matrix_room_id,
        mediaGroupId,
        monitoringUsers: null,
      };
    }

    const sessionId = `monitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await createMonitorSession(sessionId, lineId, userId);

    const activeSessions = await getActiveMonitorSessions(lineId);
    const monitoringUsers = activeSessions.map((row) => row.user_id);

    let matrixRoomId = null;
    try {
      // Monitors join the active call's shared room when one exists.
      matrixRoomId = await findExistingMatrixRoomId(lineId);
      if (matrixRoomId) {
        const { matrixService } = require('../matrixService');
        const matrixUserId = await matrixService.getMatrixUserId(userId);
        if (matrixUserId) {
          await matrixService.joinRoom(matrixRoomId, userId);
        }
      } else if (monitoringUsers.length >= MIN_USERS_FOR_MONITOR_ROOM) {
        matrixRoomId = await ensureMonitorMatrixRoom(lineId, userId, monitoringUsers);
      }
    } catch (error) {
      logger.error('Failed to create/join Matrix room for monitor session:', error);
    }

    return {
      success: true,
      sessionId,
      matrixRoomId,
      mediaGroupId,
      monitoringUsers: monitoringUsers.length,
    };
  }

  await endMonitorSession(lineId, userId);
  const remainingMonitors = await countActiveMonitorSessions(lineId);

  return {
    success: true,
    remainingMonitors,
    mediaGroupId,
  };
}

module.exports = {
  MIN_USERS_FOR_MONITOR_ROOM,
  toggleMonitor,
};
