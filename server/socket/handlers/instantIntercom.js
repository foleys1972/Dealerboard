const logger = require('../../utils/logger');
const { audioRecordingService } = require('../../services/audioRecordingService');
const { getUserById, getUserByIdOrUsername } = require('../../services/databaseService');
const { verifyToken } = require('../../middleware/auth');

function attachInstantIntercomHandlers(SocketHandler) {
  SocketHandler.prototype.handleInstantMute = async function(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session) return;

      const userId = session.userId;
      const callId = data?.callId;
      const muted = data?.muted === true;

      const callKey = this.resolveInstantCallKeyForUser(socket, callId, userId);
      if (!callKey) return;
      const callSession = this.activeRooms.get(callKey);
      if (!callSession) return;

      const participant = callSession.participants?.get?.(String(userId));
      if (participant) participant.isMuted = muted;

      this.broadcastToCall(callKey, 'participant-mute-changed', {
        callId: callSession.callId,
        userId,
        muted,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Failed to handle instant mute:', error);
    }
  }

  SocketHandler.prototype.handleInstantEnableVideo = async function(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session) return;

      const userId = session.userId;
      const callId = data?.callId;
      const enableVideo = data?.enableVideo === true;

      const callKey = this.resolveInstantCallKeyForUser(socket, callId, userId);
      if (!callKey) return;

      const callSession = this.activeRooms.get(callKey);
      if (!callSession) return;

      callSession.config = {
        ...(callSession.config || {}),
        enableVideo
      };

      // Broadcast updated call state (same callId) so clients update UI.
      this.broadcastToCall(callKey, 'instant-call-active', {
        callId: callSession.callId,
        callerId: callSession.callerId,
        targetUserId: callSession.targetUserId,
        participants: Array.from(callSession.participants.keys()),
        config: callSession.config,
        type: callSession.type,
        groupId: callSession.groupId,
        enableVideo: callSession.config.enableVideo,
      });

      // Force renegotiation / media restart for all participants.
      this.broadcastToCall(callKey, 'webrtc-setup-required', {
        callId: callSession.callId,
        participants: Array.from(callSession.participants.keys())
      });

      try {
        socket.emit('instant-enable-video-ack', { callId: callSession.callId, enableVideo });
      } catch {}
    } catch (error) {
      logger.error('Failed to handle instant enable video:', error);
    }
  }

  SocketHandler.prototype.handlePTTStart = async function(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session) return;

      const userId = session.userId;
      const callId = data?.callId;
      const callKey = this.resolveInstantCallKeyForUser(socket, callId, userId);
      if (!callKey) return;

      const callSession = this.activeRooms.get(callKey);
      if (!callSession) return;

      const participant = callSession.participants?.get?.(String(userId));
      if (participant) participant.isSpeaking = true;

      this.broadcastToCall(callKey, 'participant-speaking', {
        callId: callSession.callId,
        userId,
        speaking: true,
        mode: 'ptt',
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Failed to handle PTT start:', error);
    }
  }

  SocketHandler.prototype.handlePTTStop = async function(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session) return;

      const userId = session.userId;
      const callId = data?.callId;
      const callKey = this.resolveInstantCallKeyForUser(socket, callId, userId);
      if (!callKey) return;

      const callSession = this.activeRooms.get(callKey);
      if (!callSession) return;

      const participant = callSession.participants?.get?.(String(userId));
      if (participant) participant.isSpeaking = false;

      this.broadcastToCall(callKey, 'participant-speaking', {
        callId: callSession.callId,
        userId,
        speaking: false,
        mode: 'ptt',
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Failed to handle PTT stop:', error);
    }
  }

  SocketHandler.prototype.cleanupStaleCallState = function(userId, tenantId = null, subTenantId = null) {
    try {
      if (!userId) return;
      const uid = String(userId);

      const tid = tenantId || process.env.DEFAULT_TENANT_ID || 'tenant-default';
      const stid = subTenantId || process.env.DEFAULT_SUB_TENANT_ID || 'subtenant-default';

      for (const [callKey, callSession] of this.activeRooms.entries()) {
        const callId = callSession?.callId;
        if (!callId || !String(callId).startsWith('instant-')) continue;

        if (callSession?.tenantId && callSession.tenantId !== tid) continue;
        if (callSession?.subTenantId && callSession.subTenantId !== stid) continue;

        if (callSession?.participants?.has && callSession.participants.has(uid)) {
          callSession.participants.delete(uid);

          logger.info(`Cleaned up stale instant call state: ${uid} removed from ${callId}`);

          try {
            this.broadcastToCall(callKey, 'participant-left', {
              callId,
              userId: uid,
              reason: 'stale-cleanup',
              remainingParticipants: Array.from(callSession.participants.keys()),
              participantCount: callSession.participants.size,
            });
          } catch {}

          if (uid === callSession.callerId || callSession.participants.size <= 1) {
            this.endInstantCall(callKey, 'stale-cleanup');
          }
        }
      }
    } catch (e) {
      logger.warn('cleanupStaleCallState failed:', e?.message || e);
    }
  }

  SocketHandler.prototype.isUserInCall = function(userId, tenantId = null, subTenantId = null) {
    try {
      if (!userId) return false;
      const uid = String(userId);

      const tid = tenantId || process.env.DEFAULT_TENANT_ID || 'tenant-default';
      const stid = subTenantId || process.env.DEFAULT_SUB_TENANT_ID || 'subtenant-default';

      for (const [, callSession] of this.activeRooms.entries()) {
        const callId = callSession?.callId;
        if (!callId || !String(callId).startsWith('instant-')) continue;
        if (callSession?.tenantId && callSession.tenantId !== tid) continue;
        if (callSession?.subTenantId && callSession.subTenantId !== stid) continue;
        if (callSession?.participants?.has && callSession.participants.has(uid)) return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  SocketHandler.prototype.getUserCallCount = function(userId, tenantId = null, subTenantId = null) {
    try {
      if (!userId) return 0;
      const uid = String(userId);

      const tid = tenantId || process.env.DEFAULT_TENANT_ID || 'tenant-default';
      const stid = subTenantId || process.env.DEFAULT_SUB_TENANT_ID || 'subtenant-default';

      let count = 0;
      for (const [, callSession] of this.activeRooms.entries()) {
        const callId = callSession?.callId;
        if (!callId || !String(callId).startsWith('instant-')) continue;
        if (callSession?.tenantId && callSession.tenantId !== tid) continue;
        if (callSession?.subTenantId && callSession.subTenantId !== stid) continue;
        if (callSession?.participants?.has && callSession.participants.has(uid)) count += 1;
      }
      return count;
    } catch {
      return 0;
    }
  }

  SocketHandler.prototype.addMissedCall = function(userId, entry) {
    try {
      const key = String(userId);
      const list = this.missedCalls.get(key) || [];
      list.unshift(entry);
      // Cap to last 100
      if (list.length > 100) list.length = 100;
      this.missedCalls.set(key, list);

      // Persist to DB for durability across server restarts.
      try {
        const { createUserNotification } = require('../../services/databaseService');
        const id = String(entry?.id || `missed_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
        const fromUserId = entry?.fromUserId || entry?.from || entry?.callerId || null;
        createUserNotification({
          id,
          userId: key,
          type: 'missed-call',
          title: 'Missed call',
          message: fromUserId ? `From ${fromUserId}` : 'Missed call',
          metadata: {
            ...entry,
            persistedAt: new Date().toISOString(),
          },
          createdAt: entry?.at || entry?.timestamp || null,
        }).catch(() => {});
      } catch {}
    } catch {}
  }

  SocketHandler.prototype.cleanupUserSession = function(socket) {
    const session = this.userSessions.get(socket.id);
    const userId = session?.userId;
    
    // Remove user from sessions
    this.userSessions.delete(socket.id);
    
    // Remove user from all rooms (legacy room system)
    for (const [roomId, room] of this.activeRooms.entries()) {
      if (room.participants && room.participants.has && room.participants.has(socket.id)) {
        room.participants.delete(socket.id);
        if (room.participants.size === 0) {
          this.activeRooms.delete(roomId);
        }
      }
    }
    
    // Clean up instant call state if user was in a call
    if (userId) {
      for (const [callKey, callSession] of this.activeRooms.entries()) {
        // Check if this is an instant call session (has callId starting with 'instant-')
        const callId = callSession?.callId;
        if (callId && callId.startsWith('instant-')) {
          // Remove user from instant call participants
          if (callSession.participants && callSession.participants.has && callSession.participants.has(userId)) {
            callSession.participants.delete(userId);
            
            logger.info(`Cleaned up instant call state: ${userId} removed from ${callId}`);
            
            // Notify remaining participants
            this.broadcastToCall(callKey, 'participant-left', {
              callId,
              userId,
              reason: 'disconnected',
              remainingParticipants: Array.from(callSession.participants.keys()),
              participantCount: callSession.participants.size
            });
            
            // If caller disconnected or only 1 person left, end call
            if (userId === callSession.callerId || callSession.participants.size <= 1) {
              this.endInstantCall(callKey, 'user-disconnected');
            }
          }
        }
      }
    }
  }

}

module.exports = { attachInstantIntercomHandlers };
