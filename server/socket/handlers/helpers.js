const logger = require('../../utils/logger');
const { audioRecordingService } = require('../../services/audioRecordingService');
const { getUserById, getUserByIdOrUsername } = require('../../services/databaseService');
const { verifyToken } = require('../../middleware/auth');

function attachHelperHandlers(SocketHandler) {
  /**
   * Get all socket connections for a user ID
   */
  SocketHandler.prototype.getUserSockets = function(userIdOrUsername) {
    const sockets = [];
    const target = String(userIdOrUsername).toLowerCase();

    for (const [socketId, session] of this.userSessions.entries()) {
      // Prioritize username matching first (new standard)
      const sessionUsername = session?.username ? String(session.username).toLowerCase() : null;
      const sessionUserId = session?.userId ? String(session.userId).toLowerCase() : null;
      const sessionUri = session?.uri ? String(session.uri).toLowerCase() : null;
      
      // Match by username first, then fall back to userId for backward compatibility
      if (sessionUsername === target || sessionUserId === target || sessionUri === target) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          sockets.push(socket);
        }
      }
    }

    return sockets;
  }
}

module.exports = { attachHelperHandlers };
