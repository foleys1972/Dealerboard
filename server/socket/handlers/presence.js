const logger = require('../../utils/logger');
const { audioRecordingService } = require('../../services/audioRecordingService');
const { getUserById, getUserByIdOrUsername } = require('../../services/databaseService');
const { verifyToken } = require('../../middleware/auth');

function attachPresenceHandlers(SocketHandler) {
  SocketHandler.prototype.getGlobalPresenceRoom = function() {
    return 'presence:all';
  }

  SocketHandler.prototype._presenceConnKey = function(tenantId, subTenantId, userId) {
    return `${this.getTenantRoom(tenantId, subTenantId)}::${String(userId)}`;
  }

  SocketHandler.prototype._incrementPresenceConnection = function(session) {
    try {
      if (!session?.userId) return;
      const key = this._presenceConnKey(session.tenantId, session.subTenantId, session.userId);
      const prev = this.userConnections.get(key) || 0;
      this.userConnections.set(key, prev + 1);
    } catch {}
  }

  SocketHandler.prototype._decrementPresenceConnection = function(session) {
    try {
      if (!session?.userId) return 0;
      const key = this._presenceConnKey(session.tenantId, session.subTenantId, session.userId);
      const prev = this.userConnections.get(key) || 0;
      const next = Math.max(0, prev - 1);
      if (next === 0) this.userConnections.delete(key);
      else this.userConnections.set(key, next);
      return next;
    } catch {
      return 0;
    }
  }

  SocketHandler.prototype.cleanupStalePresenceSessions = async function() {
    try {
      const socketsMap = this.io?.sockets?.sockets;
      if (!socketsMap) return;

      const staleSocketIds = [];
      for (const [socketId] of this.userSessions.entries()) {
        if (!socketsMap.has(socketId)) {
          staleSocketIds.push(socketId);
        }
      }

      for (const socketId of staleSocketIds) {
        const session = this.userSessions.get(socketId);
        if (!session?.userId) {
          this.userSessions.delete(socketId);
          continue;
        }

        // Mirror the critical parts of handleDisconnect for presence.
        this.userSessions.delete(socketId);

        const userId = session.userId;
        const tenantRoom = this.getTenantRoom(session.tenantId, session.subTenantId);
        const remaining = this._decrementPresenceConnection(session);

        if (remaining === 0) {
          try {
            const { updateUserStatus } = require('../../services/databaseService');
            await updateUserStatus(userId, 'offline');
          } catch (e) {
            try { logger.debug('Failed to persist offline status for stale socket user', userId, e?.message || e); } catch {}
          }

          try {
            this.io.to(tenantRoom).emit('presence-update', {
              userId,
              username: session.username || userId,
              online: false,
              isOnline: false,
              timestamp: new Date().toISOString(),
              reason: 'stale-session-cleanup',
            });
          } catch {}

          try {
            this.io.to(this.getGlobalPresenceRoom()).emit('presence-update', {
              userId,
              username: session.username || userId,
              online: false,
              isOnline: false,
              timestamp: new Date().toISOString(),
              reason: 'stale-session-cleanup',
            });
          } catch {}
        }
      }
    } catch {}
  }

  SocketHandler.prototype.handleSetDnd = async function(socket, data) {
    try {
      const sess = this.userSessions.get(socket.id);
      if (!sess?.isAuthenticated || !sess?.userId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const enabled = Boolean(data?.enabled);
      const tenantRoom = this.getTenantRoom(sess.tenantId, sess.subTenantId);

      const { updateUser, getUserByIdOrUsername } = require('../../services/databaseService');
      const dbUser = await getUserByIdOrUsername(sess.userId);
      const currentSettings = dbUser?.settings || {};
      const newSettings = { ...currentSettings, dnd: enabled };
      await updateUser(sess.userId, { settings: newSettings, status: enabled ? 'dnd' : 'available' });

      sess.dnd = enabled;
      sess.settings = newSettings;

      this.io.to(tenantRoom).emit('presence-update', {
        userId: sess.userId,
        username: sess.username || sess.userId,
        online: true,
        isOnline: true,
        status: enabled ? 'dnd' : 'online',
        presenceColor: enabled ? 'amber' : null,
      });

      try {
        this.io.to(this.getGlobalPresenceRoom()).emit('presence-update', {
          userId: sess.userId,
          username: sess.username || sess.userId,
          online: true,
          isOnline: true,
          status: enabled ? 'dnd' : 'online',
          presenceColor: enabled ? 'amber' : null,
        });
      } catch {}

      socket.emit('dnd-updated', { enabled });
    } catch (error) {
      logger.error('Failed to set DND:', error);
      socket.emit('error', { message: 'Failed to set DND' });
    }
  }

  SocketHandler.prototype.handleSetCallForward = async function(socket, data) {
    try {
      const sess = this.userSessions.get(socket.id);
      if (!sess?.isAuthenticated || !sess?.userId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const enabled = Boolean(data?.enabled);
      const forwardToUsername = (data?.forwardToUsername || '').toString().trim();

      if (enabled && !forwardToUsername) {
        socket.emit('error', { message: 'Call forward requires a username' });
        return;
      }

      const { updateUser, getUserByIdOrUsername } = require('../../services/databaseService');
      const dbUser = await getUserByIdOrUsername(sess.userId);
      const currentSettings = dbUser?.settings || {};
      const currentCf = currentSettings.callForward || {};

      const newCf = {
        ...currentCf,
        enabled,
        forwardToUserId: enabled ? forwardToUsername : null,
        condition: 'immediate',
      };

      const newSettings = { ...currentSettings, callForward: newCf };
      await updateUser(sess.userId, { settings: newSettings });

      sess.settings = newSettings;
      socket.emit('call-forward-updated', { enabled, forwardToUsername: enabled ? forwardToUsername : null });
    } catch (error) {
      logger.error('Failed to set call forward:', error);
      socket.emit('error', { message: 'Failed to set call forward' });
    }
  }

  SocketHandler.prototype.handleDisconnect = async function(socket) {
    try {
      const session = this.userSessions.get(socket.id);

      // Always remove the session first to avoid stale presence.
      this.userSessions.delete(socket.id);

      if (!session) {
        return;
      }

      const userId = session.userId;
      const tenantRoom = this.getTenantRoom(session.tenantId, session.subTenantId);

      const remaining = this._decrementPresenceConnection(session);

      try {
        // Only mark offline when the LAST connection closes for this user in this tenant.
        if (remaining === 0) {
          try {
            const { updateUserStatus } = require('../../services/databaseService');
            await updateUserStatus(userId, 'offline');
          } catch (e) {
            try { logger.debug('Failed to persist offline status for user', userId, e?.message || e); } catch {}
          }

          this.io.to(tenantRoom).emit('presence-update', {
            userId,
            username: session.username || userId,
            online: false,
            isOnline: false,
            timestamp: new Date().toISOString(),
          });

          try {
            this.io.to(this.getGlobalPresenceRoom()).emit('presence-update', {
              userId,
              username: session.username || userId,
              online: false,
              isOnline: false,
              timestamp: new Date().toISOString(),
            });
          } catch {}
        }
      } catch {}

      // If the user was in an instant call, treat this as a disconnect.
      try {
        const callKey = this.resolveInstantCallKeyForUser(socket, null, userId);
        if (callKey) {
          const callSession = this.activeRooms.get(callKey);
          if (callSession?.participants?.has?.(userId)) {
            callSession.participants.delete(userId);
          }

          if (callSession) {
            this.broadcastToCall(callKey, 'participant-left', {
              callId: callSession.callId,
              userId,
              remainingParticipants: Array.from(callSession.participants.keys()),
              participantCount: callSession.participants.size,
            });

            this.broadcastToCall(callKey, 'instant-disconnected', {
              callId: callSession.callId,
              userId,
              reason: 'socket-disconnect',
              remainingParticipants: Array.from(callSession.participants.keys()),
              participantCount: callSession.participants.size,
            });

            if (userId === callSession.callerId || callSession.participants.size <= 1) {
              this.endInstantCall(callKey, 'socket-disconnect');
            }
          }
        }
      } catch {}

      // If the user is monitoring any broadcasts, remove them.
      try {
        if (this.groupService && typeof this.groupService.removeHootListener === 'function') {
          for (const [groupId] of this.activeBroadcasts.entries()) {
            try {
              this.groupService.removeHootListener(groupId, userId, { keepPersistent: false });
            } catch {}
          }
        }
      } catch {}

      try {
        logger.info(`Socket disconnected: socketId=${socket.id} userId=${userId} username=${session.username || ''}`);
      } catch {}
    } catch (error) {
      logger.error('Failed to handle disconnect:', error);
    }
  }

  SocketHandler.prototype.validateUser = async function(userIdOrUsername, token) {
    try {
      // JWT is already verified in handleAuthentication. Here we just ensure the user exists.
      const u = await getUserByIdOrUsername(userIdOrUsername);
      return u || null;
    } catch {
      return null;
    }
  }

  SocketHandler.prototype._extractUsernameFromUri = function(uri) {
    try {
      if (!uri) return null;
      const s0 = String(uri).trim();
      if (!s0) return null;
      // sip:username@domain
      let s = s0;
      const colonIdx = s.indexOf(':');
      if (colonIdx >= 0) {
        const scheme = s.slice(0, colonIdx).toLowerCase();
        if (scheme === 'sip' || scheme === 'sips') {
          s = s.slice(colonIdx + 1);
        }
      }
      const at = s.indexOf('@');
      if (at > 0) {
        return s.slice(0, at);
      }
      return null;
    } catch {
      return null;
    }
  }

  SocketHandler.prototype.resolveInstantCallKeyForUser = function(socket, callId, userId) {
    try {
      const uid = String(userId || socket?.userId || '');
      if (!uid) return null;

      if (callId) {
        const key = this.getScopedCallKey(socket, callId);
        if (this.activeRooms.has(key)) return key;
      }

      const tid = socket?.tenantId || process.env.DEFAULT_TENANT_ID || 'tenant-default';
      const stid = socket?.subTenantId || process.env.DEFAULT_SUB_TENANT_ID || 'subtenant-default';

      for (const [callKey, callSession] of this.activeRooms.entries()) {
        const cid = callSession?.callId;
        if (!cid || !String(cid).startsWith('instant-')) continue;
        if (callSession?.tenantId && callSession.tenantId !== tid) continue;
        if (callSession?.subTenantId && callSession.subTenantId !== stid) continue;
        if (callSession?.participants?.has && callSession.participants.has(uid)) return callKey;
      }

      return null;
    } catch {
      return null;
    }
  }

  SocketHandler.prototype.broadcastToCall = function(callKey, eventName, payload) {
    try {
      const callSession = this.activeRooms.get(callKey);
      if (!callSession?.participants) return;

      for (const participant of callSession.participants.values()) {
        const socketId = participant?.socketId;
        if (!socketId) continue;
        const s = this.io.sockets.sockets.get(socketId);
        if (s) {
          s.emit(eventName, payload);
        }
      }
    } catch (error) {
      logger.error('Failed to broadcast to call:', error);
    }
  }

  SocketHandler.prototype.getTenantContextFromPayload = function(payload) {
    const tenantId = payload?.tid || process.env.DEFAULT_TENANT_ID || 'tenant-default';
    const subTenantId = payload?.stid || process.env.DEFAULT_SUB_TENANT_ID || 'subtenant-default';
    return { tenantId, subTenantId };
  }

  SocketHandler.prototype.getTenantRoom = function(tenantId, subTenantId) {
    const tid = tenantId || process.env.DEFAULT_TENANT_ID || 'tenant-default';
    const stid = subTenantId || process.env.DEFAULT_SUB_TENANT_ID || 'subtenant-default';
    return `tenant:${tid}:sub:${stid}`;
  }

  SocketHandler.prototype.getTenantRoomForUsername = function(username) {
    try {
      const sockets = this.getUserSockets(username);
      const first = sockets && sockets.length > 0 ? sockets[0] : null;
      const tid = first?.tenantId || process.env.DEFAULT_TENANT_ID || 'tenant-default';
      const stid = first?.subTenantId || process.env.DEFAULT_SUB_TENANT_ID || 'subtenant-default';
      return this.getTenantRoom(tid, stid);
    } catch {
      return this.getTenantRoom(null, null);
    }
  }
}

module.exports = { attachPresenceHandlers };
