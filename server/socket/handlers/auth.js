const logger = require('../../utils/logger');
const { audioRecordingService } = require('../../services/audioRecordingService');
const { getUserById, getUserByIdOrUsername } = require('../../services/databaseService');
const { verifyToken } = require('../../middleware/auth');

function attachAuthHandlers(SocketHandler) {
  SocketHandler.prototype.handleAuthentication = async function(socket, data) {
    try {
      const { userId, username, token, groupId } = data;
      
      // Verify JWT token to get user info
      const payload = verifyToken(token);
      if (!payload) {
        logger.warn(`JWT verification failed for socket ${socket.id}`);
        socket.emit('auth-error', { message: 'Invalid or expired token' });
        return;
      }
      logger.debug(`JWT verified successfully for user: ${payload?.username || payload?.id || 'unknown'}`);

      // Extract user info from JWT payload
      const verifiedUserId = payload?.id || payload?.userId || userId;
      let verifiedUsername = payload?.username || username;
      const sipUri = payload?.sip || payload?.sipUri || payload?.user?.sipUri || payload?.user?.sip;

      const tenantCtx = this.getTenantContextFromPayload(payload);
      const tenantRoom = this.getTenantRoom(tenantCtx.tenantId, tenantCtx.subTenantId);
      
      // If username is not in JWT, look it up from database
      if (!verifiedUsername || verifiedUsername === verifiedUserId) {
        try {
          // verifiedUserId is now actually a username, so use getUserByIdOrUsername
          const dbUser = await getUserByIdOrUsername(verifiedUserId);
          if (dbUser && dbUser.username) {
            verifiedUsername = dbUser.username;
            logger.info(`Retrieved username from database: ${verifiedUsername} for identifier: ${verifiedUserId}`);
          }
        } catch (error) {
          logger.warn(`Failed to lookup username for user ${verifiedUserId}:`, error.message);
        }
      }
      
      // Fallback to userId if username still not found
      if (!verifiedUsername || verifiedUsername === verifiedUserId) {
        verifiedUsername = verifiedUserId;
      }
      
      // Validate user authentication
      const user = await this.validateUser(verifiedUserId, token);
      if (!user) {
        socket.emit('auth-error', { message: 'Invalid credentials' });
        return;
      }

      // Store user session with username
      this.userSessions.set(socket.id, {
        userId: verifiedUserId,
        username: verifiedUsername, // Store username for better identification
        uri: sipUri || null,
        user,
        settings: user?.settings || {},
        dnd: Boolean(user?.settings?.dnd),
        tenantId: tenantCtx.tenantId,
        subTenantId: tenantCtx.subTenantId,
        connectedAt: new Date(),
        isAuthenticated: true,
      });
      socket.userId = verifiedUserId;
      socket.username = verifiedUsername; // Store username on socket
      socket.uri = sipUri || null;

      socket.tenantId = tenantCtx.tenantId;
      socket.subTenantId = tenantCtx.subTenantId;
      socket.join(tenantRoom);

      try {
        if (user?.role === 'platform_admin') {
          socket.join(this.getGlobalPresenceRoom());
        }
      } catch {}

      socket.emit('auth-success', { userId: verifiedUserId, username: verifiedUsername, user });

      try {
        const { updateUserStatus } = require('../../services/databaseService');
        const statusToPersist = user?.settings?.dnd ? 'dnd' : 'available';
        await updateUserStatus(verifiedUserId, statusToPersist);
      } catch (e) {
        try { logger.debug('Failed to persist online status for user', verifiedUserId, e?.message || e); } catch {}
      }
      
      // Emit presence update to notify all clients that this user is now online
      this.io.to(tenantRoom).emit('presence-update', {
        userId: verifiedUserId,
        username: verifiedUsername,
        online: true,
        isOnline: true,
        status: user?.settings?.dnd ? 'dnd' : (user?.status || 'online'),
      });

      try {
        this.io.to(this.getGlobalPresenceRoom()).emit('presence-update', {
          userId: verifiedUserId,
          username: verifiedUsername,
          online: true,
          isOnline: true,
          status: user?.settings?.dnd ? 'dnd' : (user?.status || 'online'),
        });
      } catch {}

      // Send a snapshot of already-online users to the newly authenticated socket.
      // This prevents late-joining clients from showing existing users as offline.
      try {
        const onlineSessions = [];
        for (const [, sess] of this.userSessions.entries()) {
          if (!sess?.isAuthenticated || !sess?.userId) continue;
          if (user?.role !== 'platform_admin' && this.getTenantRoom(sess.tenantId, sess.subTenantId) !== tenantRoom) continue;
          if (String(sess.userId).toLowerCase() === String(verifiedUserId).toLowerCase()) continue;
          onlineSessions.push(sess);
        }

        for (const sess of onlineSessions) {
          socket.emit('presence-update', {
            userId: sess.userId,
            username: sess.username || sess.userId,
            online: true,
            isOnline: true,
            timestamp: new Date().toISOString(),
          });
        }
      } catch {}
      
      logger.info(`User ${verifiedUsername} (ID: ${verifiedUserId}) authenticated successfully`);
    } catch (error) {
      logger.error('Authentication error:', error);
      socket.emit('auth-error', { message: 'Authentication failed' });
    }
  }
}

module.exports = { attachAuthHandlers };
