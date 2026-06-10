const { setupSocketHandlers } = require('../socketHandlers');
const { groupService } = require('../services/groupService');
const { setupAudioRecording } = require('../services/audioRecordingService');
const { initializeRetentionPolicyService } = require('../services/retentionPolicyService');
const { startArchiveRetryLoop } = require('../services/recordingArchiveService');
const { startRecordingReconcileLoop } = require('../services/recordingReconcileService');
const {
  wireSipLineState,
  onSbcPathChanged,
  onSipLegReplaced,
} = require('../services/sipLineStateWiring');
const logger = require('../utils/logger');

function wireSocketAndSip(server) {
  const authRoutesModule = require('../routes/authRoutes');
  if (authRoutesModule.setSocketIO) {
    authRoutesModule.setSocketIO(server.io);
  }

  server.setupWebSocketMonitoring();

  const socketHandler = setupSocketHandlers(server.io, {
    groupService,
    mediaSoupWorker: server.mediaSoupWorker,
    matrixClient: server.matrixClient,
    sipGateway: server.sipGateway,
    redisClient: server.redisClient,
    audioRoutingService: require('../services/audioRoutingService'),
    recordingService: require('../services/audioRecordingService'),
  });
  server.app.locals.socketHandler = socketHandler;

  wireSipLineState(server.io);

  try {
    if (server.sipGateway && socketHandler && typeof socketHandler.handleSipIncomingCall === 'function') {
      server.sipGateway.setGlobalIncomingCallCallback(async (lineId, callId, call) => {
        try {
          await socketHandler.handleSipIncomingCall(lineId, callId, call);
        } catch (e) {
          logger.warn('handleSipIncomingCall failed', e?.message || e);
        }
      });
    }

    if (server.sipGateway && socketHandler && typeof socketHandler.handleSipCallEnded === 'function') {
      server.sipGateway.setGlobalCallEndedCallback(async (lineId, callId, call) => {
        try {
          await socketHandler.handleSipCallEnded(lineId, callId, call);
        } catch (e) {
          logger.warn('handleSipCallEnded failed', e?.message || e);
        }
      });
    }

    if (server.sipGateway && socketHandler && typeof socketHandler.handleSipCallStateChanged === 'function') {
      server.sipGateway.setGlobalCallStateChangedCallback(async (lineId, callId, call) => {
        try {
          await socketHandler.handleSipCallStateChanged(lineId, callId, call);
        } catch (e) {
          logger.warn('handleSipCallStateChanged failed', e?.message || e);
        }
      });
    }

    if (server.sipGateway) {
      server.sipGateway.setGlobalSbcPathChangedCallback(async (lineId, ua) => {
        try {
          await onSbcPathChanged(lineId, ua);
        } catch (e) {
          logger.warn('onSbcPathChanged failed', e?.message || e);
        }
      });

      server.sipGateway.setGlobalSipLegReplacedCallback(async (lineId, oldCallId, newCallId) => {
        try {
          await onSipLegReplaced(lineId, oldCallId, newCallId);
        } catch (e) {
          logger.warn('onSipLegReplaced failed', e?.message || e);
        }
      });
    }
  } catch (error) {
    logger.warn('Failed to wire SIP callbacks to socket handler:', error?.message || error);
  }

  if (server.app.locals.subscriberAudioRouting) {
    socketHandler.subscriberAudioRouting = server.app.locals.subscriberAudioRouting;
  }

  const { matrixService } = require('../services/matrixService');
  if (matrixService && server.io) {
    matrixService.setSocketIO(server.io);
    logger.info('Matrix service Socket.IO instance configured for real-time updates');
    server.setupScheduledArchiving();
  }
}

async function initBackgroundJobs(server) {
  try {
    await setupAudioRecording(server.mediaSoupWorker);
  } catch (error) {
    logger.warn('Audio recording setup failed:', error.message);
  }

  try {
    await initializeRetentionPolicyService();
    logger.info('Retention policy service initialized');
  } catch (error) {
    logger.warn('Retention policy service initialization failed:', error.message);
  }

  try {
    const { audioRecordingService } = require('../services/audioRecordingService');
    startArchiveRetryLoop({ recordingDir: audioRecordingService.recordingDir });
  } catch (e) {
    logger.warn(`Failed to start archive retry loop: ${e.message}`);
  }

  try {
    const { audioRecordingService } = require('../services/audioRecordingService');
    startRecordingReconcileLoop({ recordingDir: audioRecordingService.recordingDir });
  } catch (e) {
    logger.warn(`Failed to start recording reconcile loop: ${e.message}`);
  }
}

module.exports = { wireSocketAndSip, initBackgroundJobs };
