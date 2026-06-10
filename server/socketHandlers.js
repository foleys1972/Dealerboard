const logger = require('./utils/logger');

const { attachSipLineHandlers } = require('./socket/handlers/sipLine');
const { attachPresenceHandlers } = require('./socket/handlers/presence');
const { attachInstantIntercomHandlers } = require('./socket/handlers/instantIntercom');
const { attachAuthHandlers } = require('./socket/handlers/auth');
const { attachMediaRoomHandlers } = require('./socket/handlers/mediaRoom');
const { attachGroupHandlers } = require('./socket/handlers/groups');
const { attachBroadcastHandlers } = require('./socket/handlers/broadcast');
const { attachInstantConnectHandlers } = require('./socket/handlers/instantConnect');
const { attachGroupCallEventHandlers } = require('./socket/handlers/groupCallEvents');
const { attachHelperHandlers } = require('./socket/handlers/helpers');
const { attachSetupHandlers } = require('./socket/handlers/setup');

class SocketHandler {
  constructor(io, services) {
    this.io = io;
    this.mediaSoupWorker = services.mediaSoupWorker;
    this.matrixClient = services.matrixClient;
    this.sipGateway = services.sipGateway;
    this.redisClient = services.redisClient;
    this.groupService = services.groupService;
    this.activeRooms = new Map();
    this.userSessions = new Map();
    this.userConnections = new Map();
    this.missedCalls = new Map();

    this._sipLineCalls = new Map();
    this.activeBroadcasts = new Map();
    this._staleSessionCleanupTimer = null;
  }
}

attachSipLineHandlers(SocketHandler);
attachPresenceHandlers(SocketHandler);
attachInstantIntercomHandlers(SocketHandler);
attachAuthHandlers(SocketHandler);
attachMediaRoomHandlers(SocketHandler);
attachGroupHandlers(SocketHandler);
attachBroadcastHandlers(SocketHandler);
attachInstantConnectHandlers(SocketHandler);
attachGroupCallEventHandlers(SocketHandler);
attachHelperHandlers(SocketHandler);
attachSetupHandlers(SocketHandler);

function setupSocketHandlers(io, services) {
  const handler = new SocketHandler(io, services);
  handler.setupHandlers();
  return handler;
}

module.exports = { setupSocketHandlers };
