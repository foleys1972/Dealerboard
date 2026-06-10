const logger = require('../../utils/logger');
const { audioRecordingService } = require('../../services/audioRecordingService');
const { getUserById, getUserByIdOrUsername } = require('../../services/databaseService');
const { verifyToken } = require('../../middleware/auth');

function attachBroadcastHandlers(SocketHandler) {
  SocketHandler.prototype.handleBroadcastMessage = async function(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session) return;

      const { message, targetGroups, priority } = data;
      
      const broadcast = {
        id: `broadcast_${Date.now()}`,
        message,
        sender: session.userId,
        targetGroups,
        priority: priority || 'normal',
        timestamp: new Date(),
      };

      // Send to target groups
      for (const groupId of targetGroups) {
        const room = this.activeRooms.get(groupId);
        if (room) {
          this.io.to(groupId).emit('broadcast-message', broadcast);
        }
      }

      // Send to Matrix if enabled

      socket.emit('broadcast-sent', { success: true, id: broadcast.id });
    
      logger.info(`Broadcast message sent by user ${session.userId} to ${Array.isArray(targetGroups) ? targetGroups.length : 0} group(s)`);
    } catch (error) {
      logger.error('Failed to handle broadcast message:', error);
      socket.emit('broadcast-sent', { success: false, error: 'Failed to send broadcast message' });
    }
  }

  SocketHandler.prototype.handleBroadcastMonitor = async function(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session) return;

      const { groupId, monitor } = data || {};
      if (!groupId) {
        socket.emit('broadcast-monitor-updated', { success: false, error: 'groupId required' });
        return;
      }

      logger.info(
        `broadcast-monitor received: socketId=${socket.id} userId=${session.userId} username=${session.username} groupId=${groupId} monitor=${monitor === true}`
      );

      // Store monitoring state on the socket session (stub). This will later drive audio routing.
      session.broadcastMonitors = session.broadcastMonitors || {};
      session.broadcastMonitors[groupId] = monitor === true;

      // Keep server-owned hoot listener list in sync (used for listenerCount + Option B behavior)
      try {
        if (this.groupService && this.groupService.initialize) {
          await this.groupService.initialize();
        }

        if (this.groupService && session.userId) {
          if (monitor === true) {
            this.groupService.addHootListener(groupId, session.userId, { persistent: false });
          } else {
            this.groupService.removeHootListener(groupId, session.userId, { keepPersistent: false });
          }
        }
      } catch (e) {
        logger.warn('Broadcast monitor: failed to sync groupService hoot listeners:', e?.message || e);
      }

      let listenerCount = null;
      try {
        const status = this.groupService?.getHootStatus?.(groupId);
        listenerCount = status?.state?.listenerCount ?? null;
      } catch {}

      logger.info(
        `broadcast-monitor applied: socketId=${socket.id} userId=${session.userId} groupId=${groupId} monitor=${monitor === true} listenerCount=${listenerCount}`
      );

      const payload = {
        success: true,
        groupId,
        monitor: monitor === true,
        listenerCount,

      };

      socket.emit('broadcast-monitor-updated', payload);
      try {
        const tenantRoom = this.getTenantRoom(session.tenantId, session.subTenantId);
        this.io.to(tenantRoom).emit('broadcast-monitor-updated', payload);
      } catch {}
    } catch (error) {
      logger.error('Failed to handle broadcast monitor:', error);
      socket.emit('broadcast-monitor-updated', { success: false, error: 'Failed to update broadcast monitor' });
    }
  }

  SocketHandler.prototype.handleBroadcastPttStart = async function(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session) return;

      const groupId = data?.groupId || data?.lineId;
      if (!groupId) {
        socket.emit('error', { message: 'broadcast-ptt-start: groupId required' });
        return;
      }

      logger.info(
        `broadcast-ptt-start received: socketId=${socket.id} userId=${session.userId} username=${session.username} groupId=${groupId}`
      );

      if (!this.groupService) {
        socket.emit('error', { message: 'broadcast-ptt-start: groupService not available' });
        return;
      }

      if (this.groupService.initialize) {
        await this.groupService.initialize();
      }

      const userId = session.userId;
      const before = this.groupService.getHootStatus(groupId);
      const wasActive = before?.state?.isActive === true;

      const after = await this.groupService.startHoot(groupId, userId, { mode: 'ptt' });

      // Start broadcast session if this is the first active speaker
      if (!wasActive && after?.state?.isActive === true) {
        const sessionId = `broadcast_${groupId}_${Date.now()}`;
        this.activeBroadcasts.set(String(groupId), {
          sessionId,
          startedAt: new Date(),
          startedBy: userId,
        });

        // Resolve intended targets: group participants
        let targets = [];
        try {
          const g = this.groupService.getGroup?.(groupId);
          const participants = g?.participants ? Array.from(g.participants) : [];
          targets = participants;
        } catch {}

        this.emitBroadcastActivated(groupId, sessionId, userId, session.username || userId, null, targets);
      }

      // Notify tenant room about transmit start (UI purposes)
      try {
        const b = this.activeBroadcasts.get(String(groupId));
        this.emitPTTTransmitStart(b?.sessionId || `broadcast_${groupId}`, userId, session.username || userId);
      } catch {}
    } catch (error) {
      logger.error('Failed to handle broadcast PTT start:', error);
      socket.emit('error', { message: 'Failed to start broadcast PTT' });
    }
  }

  SocketHandler.prototype.handleBroadcastPttStop = async function(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session) return;

      const groupId = data?.groupId || data?.lineId;
      if (!groupId) {
        socket.emit('error', { message: 'broadcast-ptt-stop: groupId required' });
        return;
      }

      logger.info(
        `broadcast-ptt-stop received: socketId=${socket.id} userId=${session.userId} username=${session.username} groupId=${groupId}`
      );

      if (!this.groupService) {
        socket.emit('error', { message: 'broadcast-ptt-stop: groupService not available' });
        return;
      }

      if (this.groupService.initialize) {
        await this.groupService.initialize();
      }

      const userId = session.userId;
      const after = await this.groupService.stopHoot(groupId, userId, 'ptt-release');

      // Notify tenant room about transmit end (UI purposes)
      try {
        const b = this.activeBroadcasts.get(String(groupId));
        this.emitPTTTransmitEnd(b?.sessionId || `broadcast_${groupId}`, userId, session.username || userId);
      } catch {}

      // If broadcast has no active speakers anymore, close session
      if (after?.state?.isActive !== true) {
        const b = this.activeBroadcasts.get(String(groupId));
        if (b) {
          this.emitBroadcastClosed(b.sessionId, groupId, userId, []);
          this.activeBroadcasts.delete(String(groupId));
        }
      }
    } catch (error) {
      logger.error('Failed to handle broadcast PTT stop:', error);
      socket.emit('error', { message: 'Failed to stop broadcast PTT' });
    }
  }
}

module.exports = { attachBroadcastHandlers };
