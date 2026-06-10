const logger = require('../../utils/logger');
const { audioRecordingService } = require('../../services/audioRecordingService');
const { getUserById, getUserByIdOrUsername } = require('../../services/databaseService');
const { verifyToken } = require('../../middleware/auth');

function attachGroupCallEventHandlers(SocketHandler) {
  SocketHandler.prototype.emitGroupCallAnswered = function(sessionId, answeredBy, displayName, targetUsernames) {
    if (!Array.isArray(targetUsernames) || targetUsernames.length === 0) {
      return;
    }

    const event = {
      event: 'group-call-answered',
      sessionId,
      answeredBy,
      displayName,
      action: 'cancel-alert',
      targetUsers: targetUsernames
    };

    // Emit to all target users (using usernames for socket lookup)
    targetUsernames.forEach(username => {
      const userSockets = this.getUserSockets(username);
      userSockets.forEach(socket => {
        socket.emit('group-call-answered', event);
      });
    });

    logger.info(`Group call answered event: ${answeredBy} answered session ${sessionId}`);
  }

  /**
   * Emit group-call-participant-joined event (remain-group mode)
   * Notifies existing participants that someone new joined
   * @param {string} sessionId - Call session ID
   * @param {string} joinedUsername - Username of the user who joined
   * @param {string} displayName - Display name of the joined user
   * @param {number} currentCount - Current participant count
   * @param {boolean} topologyChange - Whether topology changed
   * @param {string} newTopology - New topology type
   * @param {string} roomId - Room ID if applicable
   */
  SocketHandler.prototype.emitGroupCallParticipantJoined = function(sessionId, joinedUsername, displayName, currentCount, topologyChange, newTopology, roomId) {
    const event = {
      event: 'group-call-participant-joined',
      sessionId,
      joinedUsername, // Use username instead of userId
      displayName,
      currentCount,
      topologyChange: topologyChange || false,
      newTopology,
      roomId
    };

    const tenantRoom = this.getTenantRoomForUsername(joinedUsername);
    this.io.to(tenantRoom).emit('group-call-participant-joined', event);

    logger.info(`Group call participant joined: ${joinedUsername} in session ${sessionId}`);
  }

  /**
   * Emit group-call-no-answer event
   * Notifies when a participant doesn't answer within timeout
   */
  SocketHandler.prototype.emitGroupCallNoAnswer = function(sessionId, username, reason) {
    const event = {
      event: 'group-call-no-answer',
      sessionId,
      username, // Use username instead of userId
      reason: reason || 'timeout'
    };

    const userSockets = this.getUserSockets(username);
    userSockets.forEach(socket => {
      socket.emit('group-call-no-answer', event);
    });

    logger.info(`Group call no answer: ${username} in session ${sessionId}`);
  }

  /**
   * Emit group-call-cancelled event
   * Notifies all participants that call was cancelled
   */
  SocketHandler.prototype.emitGroupCallCancelled = function(sessionId, reason, targetUsernames) {
    const event = {
      event: 'group-call-cancelled',
      sessionId,
      reason: reason || 'cancelled-by-initiator'
    };

    if (Array.isArray(targetUsernames)) {
      targetUsernames.forEach(username => {
        const userSockets = this.getUserSockets(username);
        userSockets.forEach(socket => {
          socket.emit('group-call-cancelled', event);
        });
      });
    } else {
      // Broadcast to all if no specific targets
      const tenantRoom = this.getTenantRoomForUsername(event?.cancelledBy || event?.initiatedBy || event?.username || '');
      this.io.to(tenantRoom).emit('group-call-cancelled', event);
    }

    logger.info(`Group call cancelled: session ${sessionId}`);
  }

  // ============================================================================
  // Broadcast WebSocket Events (spec section 7.3)
  // ============================================================================

  /**
   * Emit broadcast-activated event
   * Notifies all authorized participants that broadcast is active
   */
  SocketHandler.prototype.emitBroadcastActivated = function(lineId, sessionId, activatedBy, displayName, roomId, targetUsernames) {
    const event = {
      event: 'broadcast-activated',
      lineId,
      sessionId,
      activatedBy,
      displayName,
      roomId,
      targetUsers: targetUsernames || []
    };

    if (Array.isArray(targetUsernames) && targetUsernames.length > 0) {
      targetUsernames.forEach(username => {
        const userSockets = this.getUserSockets(username);
        userSockets.forEach(socket => {
          socket.emit('broadcast-activated', event);
        });
      });
    } else {
      // Broadcast to all if no specific targets
      const tenantRoom = this.getTenantRoomForUsername(activatedBy);
      this.io.to(tenantRoom).emit('broadcast-activated', event);
    }

    logger.info(`Broadcast activated: ${activatedBy} activated line ${lineId}`);
  }

  /**
   * Emit broadcast-participant-joined event
   * Notifies existing participants that someone joined
   */
  SocketHandler.prototype.emitBroadcastParticipantJoined = function(sessionId, lineId, joinedUsername, displayName, currentCount) {
    const event = {
      event: 'broadcast-participant-joined',
      sessionId,
      lineId,
      joinedUsername, // Use username instead of userId
      displayName,
      currentCount
    };

    const tenantRoom = this.getTenantRoomForUsername(joinedUsername);
    this.io.to(tenantRoom).emit('broadcast-participant-joined', event);

    logger.info(`Broadcast participant joined: ${joinedUsername} in session ${sessionId}`);
  }

  /**
   * Emit broadcast-participant-left event
   */
  SocketHandler.prototype.emitBroadcastParticipantLeft = function(sessionId, lineId, leftUsername, displayName, currentCount) {
    const event = {
      event: 'broadcast-participant-left',
      sessionId,
      lineId,
      leftUsername, // Use username instead of userId
      displayName,
      currentCount
    };

    const tenantRoom = this.getTenantRoomForUsername(leftUsername);
    this.io.to(tenantRoom).emit('broadcast-participant-left', event);

    logger.info(`Broadcast participant left: ${leftUsername} from session ${sessionId}`);
  }

  /**
   * Emit broadcast-closed event
   * Notifies all participants that broadcast was closed
   */
  SocketHandler.prototype.emitBroadcastClosed = function(sessionId, lineId, closedBy, participantsKicked) {
    const event = {
      event: 'broadcast-closed',
      sessionId,
      lineId,
      closedBy,
      participantsKicked: participantsKicked || []
    };

    const tenantRoom = this.getTenantRoomForUsername(closedBy);
    this.io.to(tenantRoom).emit('broadcast-closed', event);

    logger.info(`Broadcast closed: ${closedBy} closed session ${sessionId}`);
  }

  /**
   * Emit PTT transmit start/end events
   */
  SocketHandler.prototype.emitPTTTransmitStart = function(sessionId, userId, displayName) {
    const event = {
      event: 'ptt-transmit-start',
      sessionId,
      userId,
      displayName
    };

    const tenantRoom = this.getTenantRoomForUsername(userId);
    this.io.to(tenantRoom).emit('ptt-transmit-start', event);
  }

  SocketHandler.prototype.emitPTTTransmitEnd = function(sessionId, userId, displayName) {
    const event = {
      event: 'ptt-transmit-end',
      sessionId,
      userId,
      displayName
    };

    const tenantRoom = this.getTenantRoomForUsername(userId);
    this.io.to(tenantRoom).emit('ptt-transmit-end', event);
  }
}

module.exports = { attachGroupCallEventHandlers };
