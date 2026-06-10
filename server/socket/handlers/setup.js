const logger = require('../../utils/logger');
const { audioRecordingService } = require('../../services/audioRecordingService');
const { getUserById, getUserByIdOrUsername } = require('../../services/databaseService');
const { verifyToken } = require('../../middleware/auth');

function attachSetupHandlers(SocketHandler) {
  SocketHandler.prototype.setupHandlers = function() {
    this.io.on('connection', async (socket) => {
      // Initialize connection count if not exists
      if (!this.connectionCount) {
        this.connectionCount = 0;
      }
      
      // Throttle connection logging to avoid spam
      this.connectionCount++;
      if (this.connectionCount % 10 === 0) {
        logger.info(`Client connected: ${socket.id} (Total: ${this.connectionCount})`);
      }

      // Attempt automatic authentication from handshake (JWT)
      try {
        const authHeader = socket.handshake.headers?.authorization || '';
        const bearer = Array.isArray(authHeader) ? authHeader[0] : authHeader;
        const tokenFromHeader = bearer && bearer.startsWith('Bearer ') ? bearer.slice(7) : null;
        const tokenFromAuth = socket.handshake.auth?.token;
        const token = tokenFromAuth || tokenFromHeader || null;

        if (token) {
          // Use IIFE to handle async operations
          (async () => {
            try {
              const payload = verifyToken(token);
              if (!payload) {
                return;
              }
              const userId = payload?.userId || payload?.id || payload?.sub;
              let username = payload?.username; // Get username from JWT
              
              // If username is not in JWT, look it up from database
              // userId is now actually a username, so use getUserByIdOrUsername
              if (userId && (!username || username === userId)) {
                try {
                  const dbUser = await getUserByIdOrUsername(userId);
                  if (dbUser && dbUser.username) {
                    username = dbUser.username;
                    logger.info(`Auto-auth: Retrieved username from database: ${username} for identifier: ${userId}`);
                  }
                } catch (error) {
                  logger.warn(`Auto-auth: Failed to lookup username for identifier ${userId}:`, error.message);
                }
              }
              
              // Fallback to userId if username still not found
              const finalUsername = username || userId;
              const sipUri = payload?.sip || payload?.sipUri || payload?.user?.sipUri || payload?.user?.sip;
              
              if (userId) {
                const tenantCtx = this.getTenantContextFromPayload(payload);
                const tenantRoom = this.getTenantRoom(tenantCtx.tenantId, tenantCtx.subTenantId);

                let dbUser = null;
                try {
                  dbUser = await getUserByIdOrUsername(userId);
                } catch {}
                const settings = dbUser?.settings || {};
                const dnd = Boolean(settings?.dnd);

                this.userSessions.set(socket.id, {
                  userId,
                  username: finalUsername, // Use username if available, fallback to userId
                  uri: sipUri || null,
                  user: dbUser || payload?.user || { id: userId, username: finalUsername },
                  settings,
                  dnd,
                  tenantId: tenantCtx.tenantId,
                  subTenantId: tenantCtx.subTenantId,
                  connectedAt: new Date(),
                  isAuthenticated: true,
                });

                this._incrementPresenceConnection(this.userSessions.get(socket.id));
                socket.userId = userId;
                socket.username = finalUsername; // Store username on socket
                socket.uri = sipUri || null;
                socket.tenantId = tenantCtx.tenantId;
                socket.subTenantId = tenantCtx.subTenantId;
                socket.join(tenantRoom);

                try {
                  const role = dbUser?.role || payload?.user?.role;
                  if (role === 'platform_admin') {
                    socket.join(this.getGlobalPresenceRoom());
                  }
                } catch {}
                // Emit auth-success for client to update UI
                socket.emit('auth-success', { 
                  userId, 
                  username: finalUsername, 
                  user: payload?.user || { id: userId, username: finalUsername } 
                });
                // presence online
                this.io.to(tenantRoom).emit('presence-update', { 
                  userId, 
                  username: finalUsername, 
                  online: true, 
                  isOnline: true,
                  status: dnd ? 'dnd' : (dbUser?.status || 'online')
                });

                try {
                  this.io.to(this.getGlobalPresenceRoom()).emit('presence-update', {
                    userId,
                    username: finalUsername,
                    online: true,
                    isOnline: true,
                    status: dnd ? 'dnd' : (dbUser?.status || 'online')
                  });
                } catch {}
                logger.info(`Socket ${socket.id} auto-authenticated as ${finalUsername} (ID: ${userId})`);
              }
            } catch (e) {
              // Log the actual error for debugging
              logger.warn(`Auto-auth token verification failed for socket ${socket.id}:`, e.message);
              // Don't emit auth-error for auto-auth failures - let client retry with explicit authenticate
              // The socket is still connected, just not authenticated yet
            }
          })();
        }
      } catch (e) {
        logger.warn('Handshake auth parsing failed:', e.message);
      }

      // Handle disconnection properly
      socket.on('disconnect', (reason) => {
        this.connectionCount = Math.max(0, this.connectionCount - 1);
        logger.info(`Client disconnected: ${socket.id} (Reason: ${reason}) (Total: ${this.connectionCount})`);
        this.handleDisconnect(socket).catch((e) => {
          try { logger.debug('handleDisconnect failed', e?.message || e); } catch {}
        });
      });

      // Handle connection errors
      socket.on('error', (error) => {
        logger.error(`Socket error for ${socket.id}:`, error);
        this.connectionCount = Math.max(0, this.connectionCount - 1);
        this.cleanupUserSession(socket);
      });

      // Authentication
      socket.on('authenticate', (data) => this.handleAuthentication(socket, data));
      socket.on('set-dnd', (data) => this.handleSetDnd(socket, data));
      socket.on('set-call-forward', (data) => this.handleSetCallForward(socket, data));
      socket.on('presence-get', (cb) => {
        try {
          const reqSess = this.userSessions.get(socket.id);
          const tenantRoom = this.getTenantRoom(reqSess?.tenantId, reqSess?.subTenantId);
          const isPlatformAdmin = (reqSess?.user?.role || reqSess?.role) === 'platform_admin';
          const online = [];
          for (const [id, sess] of this.userSessions.entries()) {
            if (!sess?.isAuthenticated || !sess?.userId) continue;
            if (!isPlatformAdmin && this.getTenantRoom(sess.tenantId, sess.subTenantId) !== tenantRoom) continue;
            online.push(String(sess.userId));
          }
          const unique = Array.from(new Set(online));
          if (typeof cb === 'function') cb({ online: unique });
        } catch {
          if (typeof cb === 'function') cb({ online: [] });
        }
      });
      
      // Room management
      socket.on('join-room', (data) => this.handleJoinRoom(socket, data));
      socket.on('leave-room', (data) => this.handleLeaveRoom(socket, data));
      
      // WebRTC signaling
      socket.on('webrtc-offer', (data) => this.handleWebRTCOffer(socket, data));
      socket.on('webrtc-answer', (data) => this.handleWebRTCAnswer(socket, data));
      socket.on('webrtc-ice-candidate', (data) => this.handleWebRTCIceCandidate(socket, data));
      socket.on('webrtc-producer-ready', (data) => this.handleProducerReady(socket, data));
      
      // Audio control
      socket.on('start-speaking', (data) => this.handleStartSpeaking(socket, data));
      socket.on('stop-speaking', (data) => this.handleStopSpeaking(socket, data));
      socket.on('mute-toggle', (data) => this.handleMuteToggle(socket, data));
      socket.on('mute', (data) => this.handleInstantMute(socket, data));
      socket.on('instant-enable-video', (data) => this.handleInstantEnableVideo(socket, data));
      
      // Recording control
      socket.on('start-recording', (data) => this.handleStartRecording(socket, data));
      socket.on('stop-recording', (data) => this.handleStopRecording(socket, data));
      
      // Group management
      socket.on('create-group', (data) => this.handleCreateGroup(socket, data));
      socket.on('join-group', (data) => this.handleJoinGroup(socket, data));
      socket.on('leave-group', (data) => this.handleLeaveGroup(socket, data));
      
      // Broadcast
      socket.on('broadcast-message', (data) => this.handleBroadcastMessage(socket, data));
      socket.on('broadcast-monitor', (data) => this.handleBroadcastMonitor(socket, data));
      socket.on('broadcast-ptt-start', (data) => this.handleBroadcastPttStart(socket, data));
      socket.on('broadcast-ptt-stop', (data) => this.handleBroadcastPttStop(socket, data));
      
      // Instant Intercom - new handlers
      socket.on('instant-connect', (data) => this.handleInstantConnect(socket, data));
      socket.on('instant-accept', (data) => this.handleInstantAccept(socket, data));
      socket.on('instant-reject', (data) => this.handleInstantReject(socket, data));
      socket.on('instant-disconnect', (data) => this.handleInstantDisconnect(socket, data));
      socket.on('ptt-start', (data) => this.handlePTTStart(socket, data));
      socket.on('ptt-stop', (data) => this.handlePTTStop(socket, data));
      socket.on('audio-level', (data) => this.handleAudioLevel(socket, data));
      
      // Error handling
      socket.on('error', (error) => {
        logger.error(`Socket error for ${socket.id}:`, error);
        socket.disconnect();
      });
    });

    // Run periodic stale cleanup (outside per-socket scope)
    try {
      if (!this._staleSessionCleanupTimer) {
        this._staleSessionCleanupTimer = setInterval(() => {
          this.cleanupStalePresenceSessions().catch(() => {});
        }, 30000);
      }
    } catch {}
  }
}

module.exports = { attachSetupHandlers };
