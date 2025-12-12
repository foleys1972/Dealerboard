const logger = require('./utils/logger');
const { audioRecordingService } = require('./services/audioRecordingService');
const { getUserById, getUserByIdOrUsername } = require('./services/databaseService');
const jwt = require('jsonwebtoken');

class SocketHandler {
  constructor(io, services) {
    this.io = io;
    this.mediaSoupWorker = services.mediaSoupWorker;
    this.matrixClient = services.matrixClient;
    this.sipGateway = services.sipGateway;
    this.redisClient = services.redisClient;
    this.activeRooms = new Map();
    this.userSessions = new Map();
    this.userConnections = new Map();
    this.missedCalls = new Map(); // userId -> [{ id, fromUserId, at, type }]
  }

  addMissedCall(userId, entry) {
    try {
      const key = String(userId);
      const list = this.missedCalls.get(key) || [];
      list.unshift(entry);
      // Cap to last 100
      if (list.length > 100) list.length = 100;
      this.missedCalls.set(key, list);
    } catch {}
  }

  cleanupUserSession(socket) {
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
      for (const [callId, callSession] of this.activeRooms.entries()) {
        // Check if this is an instant call session (has callId starting with 'instant-')
        if (callSession.callId && callSession.callId.startsWith('instant-')) {
          // Remove user from instant call participants
          if (callSession.participants && callSession.participants.has && callSession.participants.has(userId)) {
            callSession.participants.delete(userId);
            
            logger.info(`Cleaned up instant call state: ${userId} removed from ${callId}`);
            
            // Notify remaining participants
            this.broadcastToCall(callId, 'participant-left', {
              callId,
              userId,
              reason: 'disconnected',
              remainingParticipants: Array.from(callSession.participants.keys()),
              participantCount: callSession.participants.size
            });
            
            // If caller disconnected or only 1 person left, end call
            if (userId === callSession.callerId || callSession.participants.size <= 1) {
              this.endInstantCall(callId, 'user-disconnected');
            }
          }
        }
      }
    }
  }

  setupHandlers() {
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
              const payload = jwt.verify(token, process.env.JWT_SECRET || process.env.JWT_ACCESS_TOKEN_SECRET || 'your-secret-key');
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
              
              if (userId) {
                this.userSessions.set(socket.id, {
                  userId,
                  username: finalUsername, // Use username if available, fallback to userId
                  user: payload?.user || { id: userId, username: finalUsername },
                  connectedAt: new Date(),
                  isAuthenticated: true,
                });
                socket.userId = userId;
                socket.username = finalUsername; // Store username on socket
                // Emit auth-success for client to update UI
                socket.emit('auth-success', { 
                  userId, 
                  username: finalUsername, 
                  user: payload?.user || { id: userId, username: finalUsername } 
                });
                // presence online
                this.io.emit('presence-update', { userId, username: finalUsername, online: true });
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
        const sess = this.userSessions.get(socket.id);
        if (sess?.userId) {
          this.io.emit('presence-update', { userId: sess.userId, online: false });
        }
        this.cleanupUserSession(socket);
      });

      // Handle connection errors
      socket.on('error', (error) => {
        logger.error(`Socket error for ${socket.id}:`, error);
        this.connectionCount = Math.max(0, this.connectionCount - 1);
        this.cleanupUserSession(socket);
      });

      // Authentication
      socket.on('authenticate', (data) => this.handleAuthentication(socket, data));
      socket.on('presence-get', (cb) => {
        try {
          const online = [];
          for (const [id, sess] of this.userSessions.entries()) {
            if (sess?.isAuthenticated && sess?.userId) online.push(String(sess.userId));
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
      
      // Recording control
      socket.on('start-recording', (data) => this.handleStartRecording(socket, data));
      socket.on('stop-recording', (data) => this.handleStopRecording(socket, data));
      
      // Group management
      socket.on('create-group', (data) => this.handleCreateGroup(socket, data));
      socket.on('join-group', (data) => this.handleJoinGroup(socket, data));
      socket.on('leave-group', (data) => this.handleLeaveGroup(socket, data));
      
      // Broadcast
      socket.on('broadcast-message', (data) => this.handleBroadcastMessage(socket, data));
      
      // Instant Intercom - new handlers
      socket.on('instant-connect', (data) => this.handleInstantConnect(socket, data));
      socket.on('instant-accept', (data) => this.handleInstantAccept(socket, data));
      socket.on('instant-reject', (data) => this.handleInstantReject(socket, data));
      socket.on('instant-disconnect', (data) => this.handleInstantDisconnect(socket, data));
      socket.on('ptt-start', (data) => this.handlePTTStart(socket, data));
      socket.on('ptt-stop', (data) => this.handlePTTStop(socket, data));
      socket.on('audio-level', (data) => this.handleAudioLevel(socket, data));
      
      // Disconnect
      socket.on('disconnect', () => this.handleDisconnect(socket));
      
      // Error handling
      socket.on('error', (error) => {
        logger.error(`Socket error for ${socket.id}:`, error);
        socket.disconnect();
      });
    });
  }

  async handleAuthentication(socket, data) {
    try {
      const { userId, username, token, groupId } = data;
      
      // Verify JWT token to get user info
      let payload;
      try {
        const jwtSecret = process.env.JWT_SECRET || process.env.JWT_ACCESS_TOKEN_SECRET || 'your-secret-key';
        payload = jwt.verify(token, jwtSecret);
        logger.debug(`JWT verified successfully for user: ${payload?.username || payload?.id || 'unknown'}`);
      } catch (err) {
        logger.warn(`JWT verification failed for socket ${socket.id}:`, err.message);
        logger.debug(`Token (first 20 chars): ${token?.substring(0, 20)}...`);
        socket.emit('auth-error', { message: `Invalid token: ${err.message}` });
        return;
      }

      // Extract user info from JWT payload
      const verifiedUserId = payload?.id || payload?.userId || userId;
      let verifiedUsername = payload?.username || username;
      
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
        user: { ...user, username: verifiedUsername },
        groupId,
        connectedAt: new Date(),
        isAuthenticated: true,
      });
      socket.userId = verifiedUserId;
      socket.username = verifiedUsername; // Store username on socket

      socket.emit('auth-success', { userId: verifiedUserId, username: verifiedUsername, user });
      
      // Emit presence update to notify all clients that this user is now online
      this.io.emit('presence-update', { userId: verifiedUserId, username: verifiedUsername, online: true });
      
      logger.info(`User ${verifiedUsername} (ID: ${verifiedUserId}) authenticated successfully`);
    } catch (error) {
      logger.error('Authentication failed:', error);
      socket.emit('auth-error', { message: 'Authentication failed' });
    }
  }

  async handleJoinRoom(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session || !session.isAuthenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const { roomId, groupId } = data;
      
      // Create or get room
      let room = this.activeRooms.get(roomId);
      if (!room) {
        room = await this.createRoom(roomId, groupId);
        this.activeRooms.set(roomId, room);
      }

      // Add user to room
      room.participants.set(socket.id, {
        socket,
        userId: session.userId,
        user: session.user,
        joinedAt: new Date(),
        isSpeaking: false,
        isMuted: false,
      });

      // Join socket room for broadcasting
      socket.join(roomId);
      
      // Update session
      session.roomId = roomId;
      session.groupId = groupId;

      // Notify other participants
      socket.to(roomId).emit('user-joined', {
        userId: session.userId,
        user: session.user,
        timestamp: new Date(),
      });

      // Send current participants to new user
      const participants = Array.from(room.participants.values()).map(p => ({
        userId: p.userId,
        user: p.user,
        isSpeaking: p.isSpeaking,
        isMuted: p.isMuted,
      }));

      socket.emit('room-joined', {
        roomId,
        participants,
        roomConfig: room.config,
      });

      logger.info(`User ${session.userId} joined room ${roomId}`);
    } catch (error) {
      logger.error('Failed to join room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  }

  async handleLeaveRoom(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session) return;

      const { roomId } = data;
      const room = this.activeRooms.get(roomId);
      
      if (room && room.participants.has(socket.id)) {
        const participant = room.participants.get(socket.id);
        
        // Stop any active recording for this user
        if (room.recording && room.recording.isActive) {
          await audioRecordingService.removeParticipantFromRecording(
            room.recording.id, 
            session.userId
          );
        }

        // Remove from room
        room.participants.delete(socket.id);
        socket.leave(roomId);

        // Notify other participants
        socket.to(roomId).emit('user-left', {
          userId: session.userId,
          timestamp: new Date(),
        });

        // Clean up empty rooms
        if (room.participants.size === 0) {
          if (room.recording && room.recording.isActive) {
            await audioRecordingService.stopRecording(room.recording.id, 'room-closed');
          }
          this.activeRooms.delete(roomId);
        }

        logger.info(`User ${session.userId} left room ${roomId}`);
      }
    } catch (error) {
      logger.error('Failed to leave room:', error);
    }
  }

  async handleStartSpeaking(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session) return;

      const { roomId } = data;
      const room = this.activeRooms.get(roomId);
      
      if (room && room.participants.has(socket.id)) {
        const participant = room.participants.get(socket.id);
        participant.isSpeaking = true;

        // Notify other participants
        socket.to(roomId).emit('user-speaking', {
          userId: session.userId,
          timestamp: new Date(),
        });

        logger.debug(`User ${session.userId} started speaking in room ${roomId}`);
      }
    } catch (error) {
      logger.error('Failed to handle start speaking:', error);
    }
  }

  async handleStopSpeaking(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session) return;

      const { roomId } = data;
      const room = this.activeRooms.get(roomId);
      
      if (room && room.participants.has(socket.id)) {
        const participant = room.participants.get(socket.id);
        participant.isSpeaking = false;

        // Notify other participants
        socket.to(roomId).emit('user-stopped-speaking', {
          userId: session.userId,
          timestamp: new Date(),
        });

        logger.debug(`User ${session.userId} stopped speaking in room ${roomId}`);
      }
    } catch (error) {
      logger.error('Failed to handle stop speaking:', error);
    }
  }

  async handleMuteToggle(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session) return;

      const { roomId, muted } = data;
      const room = this.activeRooms.get(roomId);
      
      if (room && room.participants.has(socket.id)) {
        const participant = room.participants.get(socket.id);
        participant.isMuted = muted;

        // Notify other participants
        socket.to(roomId).emit('user-mute-changed', {
          userId: session.userId,
          muted,
          timestamp: new Date(),
        });

        logger.info(`User ${session.userId} ${muted ? 'muted' : 'unmuted'} in room ${roomId}`);
      }
    } catch (error) {
      logger.error('Failed to handle mute toggle:', error);
    }
  }

  async handleStartRecording(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session || !session.isAuthenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const { roomId, groupId } = data;
      const room = this.activeRooms.get(roomId);
      
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Check if user has recording permissions
      if (!this.hasRecordingPermission(session.user, room)) {
        socket.emit('error', { message: 'No recording permission' });
        return;
      }

      // Start recording if not already active
      if (!room.recording || !room.recording.isActive) {
        const recording = await audioRecordingService.startRecording(
          roomId,
          groupId,
          session.userId,
          {
            roomId,
            groupId,
            participants: Array.from(room.participants.keys()),
            startedBy: session.userId,
          }
        );

        room.recording = {
          id: recording.recordingId,
          isActive: true,
          startTime: recording.startTime,
        };

        // Add all current participants to recording
        for (const [socketId, participant] of room.participants) {
          await audioRecordingService.addParticipantToRecording(
            recording.recordingId,
            participant.userId
          );
        }

        // Notify all participants
        this.io.to(roomId).emit('recording-started', {
          recordingId: recording.recordingId,
          startedBy: session.userId,
          timestamp: new Date(),
        });

        logger.info(`Recording started in room ${roomId} by user ${session.userId}`);
      }

      socket.emit('recording-status', {
        isRecording: true,
        recordingId: room.recording.id,
      });
    } catch (error) {
      logger.error('Failed to start recording:', error);
      socket.emit('error', { message: 'Failed to start recording' });
    }
  }

  async handleStopRecording(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session) return;

      const { roomId } = data;
      const room = this.activeRooms.get(roomId);
      
      if (room && room.recording && room.recording.isActive) {
        // Check if user has permission to stop recording
        if (!this.hasRecordingPermission(session.user, room)) {
          socket.emit('error', { message: 'No permission to stop recording' });
          return;
        }

        const result = await audioRecordingService.stopRecording(
          room.recording.id,
          'manual-stop'
        );

        room.recording.isActive = false;

        // Notify all participants
        this.io.to(roomId).emit('recording-stopped', {
          recordingId: room.recording.id,
          duration: result.duration,
          stoppedBy: session.userId,
          timestamp: new Date(),
        });

        logger.info(`Recording stopped in room ${roomId} by user ${session.userId}`);
      }

      socket.emit('recording-status', { isRecording: false });
    } catch (error) {
      logger.error('Failed to stop recording:', error);
      socket.emit('error', { message: 'Failed to stop recording' });
    }
  }

  async handleCreateGroup(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session || !session.isAuthenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const { groupName, groupType, isPublic } = data;
      
      // Create Matrix room if Matrix is enabled
      let matrixRoomId = null;
      if (this.matrixClient) {
        matrixRoomId = await this.matrixClient.createIntercomRoom(
          `group_${Date.now()}`,
          groupName,
          isPublic
        );
      }

      const group = {
        id: `group_${Date.now()}`,
        name: groupName,
        type: groupType,
        isPublic,
        createdBy: session.userId,
        createdAt: new Date(),
        matrixRoomId,
        participants: new Set([session.userId]),
      };

      // Store group in Redis
      if (this.redisClient) {
        await this.redisClient.hset('groups', group.id, JSON.stringify(group));
      }

      socket.emit('group-created', group);
      logger.info(`Group ${groupName} created by user ${session.userId}`);
    } catch (error) {
      logger.error('Failed to create group:', error);
      socket.emit('error', { message: 'Failed to create group' });
    }
  }

  async handleBroadcastMessage(socket, data) {
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
      if (this.matrixClient && targetGroups.length > 0) {
        for (const groupId of targetGroups) {
          const group = await this.getGroup(groupId);
          if (group && group.matrixRoomId) {
            await this.matrixClient.sendIntercomMessage(
              group.matrixRoomId,
              `BROADCAST: ${message}`
            );
          }
        }
      }

      logger.info(`Broadcast sent by user ${session.userId} to ${targetGroups.length} groups`);
    } catch (error) {
      logger.error('Failed to handle broadcast message:', error);
      socket.emit('error', { message: 'Failed to send broadcast' });
    }
  }

  async handleDisconnect(socket) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session) return;

      // Leave all rooms
      for (const [roomId, room] of this.activeRooms) {
        if (room.participants.has(socket.id)) {
          const participant = room.participants.get(socket.id);
          
          // Remove from room
          room.participants.delete(socket.id);
          socket.leave(roomId);

          // Notify other participants
          socket.to(roomId).emit('user-left', {
            userId: session.userId,
            timestamp: new Date(),
          });

          // Clean up empty rooms
          if (room.participants.size === 0) {
            if (room.recording && room.recording.isActive) {
              await audioRecordingService.stopRecording(room.recording.id, 'room-closed');
            }
            this.activeRooms.delete(roomId);
          }
        }
      }

      // Remove user session
      this.userSessions.delete(socket.id);
      
      logger.info(`User ${session.userId} disconnected`);
    } catch (error) {
      logger.error('Failed to handle disconnect:', error);
    }
  }

  // Helper methods
  async validateUser(userIdOrUsername, token) {
    try {
      // Validate user exists in database - userIdOrUsername can be either username or ID
      const user = await getUserByIdOrUsername(userIdOrUsername);
      if (!user || !user.isActive) {
        logger.warn(`User validation failed: user ${userIdOrUsername} not found or inactive`);
        return null;
      }
      return user;
    } catch (error) {
      logger.error(`Error validating user ${userIdOrUsername}:`, error.message);
      logger.error('Error stack:', error.stack);
      return null;
    }
  }

  async createRoom(roomId, groupId) {
    return {
      id: roomId,
      groupId,
      participants: new Map(),
      recording: null,
      config: {
        maxParticipants: 200,
        allowRecording: true,
        pushToTalk: false,
      },
      createdAt: new Date(),
    };
  }

  hasRecordingPermission(user, room) {
    // Implement recording permission logic
    return user.permissions && user.permissions.includes('record');
  }

  async getGroup(groupId) {
    try {
      if (this.redisClient) {
        const groupData = await this.redisClient.hget('groups', groupId);
        if (groupData) return JSON.parse(groupData);
      }
      // Fallback: in-memory groupService
      const { groupService } = require('./services/groupService');
      try { await groupService.initialize?.(); } catch {}
      const group = groupService.getGroup(groupId);
      return group || null;
    } catch {
      return null;
    }
  }

  // ==================== INSTANT INTERCOM HANDLERS ====================

  async handleInstantConnect(socket, data) {
    try {
      const { targetUserId, targetUserIds, groupId, isGroupCall, audioMode, policy } = data;
      const callerId = socket.userId;
      const callId = `instant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Check if socket is connected
      if (!socket.connected) {
        logger.warn(`Socket ${socket.id} not connected when trying to start call`);
        socket.emit('instant-error', { message: 'Socket not connected. Please reconnect and try again.' });
        return;
      }

      if (!callerId) {
        socket.emit('instant-error', { message: 'Not authenticated' });
        return;
      }
      
      // Clean up any stale call state for this user (in case of previous failed/disconnected calls)
      this.cleanupStaleCallState(callerId);

      logger.info(`Instant connect: ${callerId} → ${targetUserId || groupId}`);

      // Initialize call session
      const callSession = {
        callId,
        callerId,
        callerSocketId: socket.id,
        targetUserId: targetUserId || null, // Store targetUserId for 1:1 calls
        targetUserIds: targetUserIds || null, // Store targetUserIds for group calls
        type: isGroupCall ? 'group' : 'direct',
        groupId,
        config: {
          audioMode: audioMode === 'open' ? 'open' : 'ptt',
          policy: policy
            ? (policy === 'FIRST_ANSWER' ? 'FIRST_ANSWER' : 'REMAIN_GROUP')
            : (isGroupCall && (audioMode !== 'open') ? 'FIRST_ANSWER' : 'REMAIN_GROUP'),
        },
        participants: new Map(),
        startTime: new Date(),
        audioLevels: new Map(),
        silenceTimer: null
      };

      // Determine target user(s) - prefer explicit targets if provided
      let targets = [];
      if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
        targets = targetUserIds;
      } else if (isGroupCall && groupId) {
        // Get group members
        const group = await this.getGroup(groupId);
        if (!group) {
          socket.emit('instant-error', { message: 'Group not found' });
          return;
        }
        const fromMembers = Array.isArray(group.members) ? group.members : [];
        const fromParticipants = group.participants
          ? (Array.isArray(group.participants) ? group.participants : Array.from(group.participants))
          : [];
        targets = (fromMembers.length ? fromMembers : fromParticipants);
      } else if (targetUserIds && Array.isArray(targetUserIds)) {
        targets = targetUserIds;
      } else if (targetUserId) {
        targets = [targetUserId];
      }

      // Check DND and admin override
      const callerSession = this.userSessions.get(socket.id);
      const isAdmin = callerSession?.role === 'admin';

      // Send instant connection to all targets
      const attempted = [];
      const matched = [];
      for (const userId of targets) {
        const targetSockets = this.getSocketsByUserId(userId);
        attempted.push(String(userId));
        
        for (const targetSocket of targetSockets) {
          const targetSession = this.userSessions.get(targetSocket.id);
          matched.push(String(userId));
          
          // Check DND
          if (targetSession?.dnd && !isAdmin) {
            logger.info(`Target ${userId} is DND, blocked`);
            // Only notify caller for 1-to-1 calls
            if (!isGroupCall) {
              socket.emit('instant-blocked', { 
                userId, 
                reason: 'dnd',
                message: 'User has Do Not Disturb enabled'
              });
            }
            continue;
          }

          // Check if user is already in a call
          const userInCall = this.isUserInCall(userId);
          if (userInCall) {
            const blockWhenBusy = targetSession?.settings?.blockCallsWhenBusy;
            const allowMultiple = targetSession?.settings?.allowMultipleCalls !== false;
            const maxCalls = targetSession?.settings?.maxSimultaneousCalls || 3;
            const currentCallCount = this.getUserCallCount(userId);

            // If user blocks calls when busy and is in a call
            if (blockWhenBusy && !isAdmin) {
              logger.info(`Target ${userId} is busy and blocks incoming calls`);
              
              // For group calls: silently skip busy users (no error to caller)
              // For 1-to-1 calls: notify caller with busy tone
              if (!isGroupCall) {
                socket.emit('instant-blocked', { 
                  userId, 
                  reason: 'busy',
                  message: 'User is on another call and not accepting new calls'
                });
              } else {
                logger.debug(`Group call: Skipping busy user ${userId} without notification`);
              }
              continue;
            }

            // If user allows multiple but has reached max
            if (!allowMultiple || (allowMultiple && currentCallCount >= maxCalls)) {
              logger.info(`Target ${userId} has reached maximum simultaneous calls (${currentCallCount}/${maxCalls})`);
              
              // For group calls: silently skip
              // For 1-to-1 calls: notify caller
              if (!isGroupCall) {
                socket.emit('instant-blocked', { 
                  userId, 
                  reason: 'max-calls-reached',
                  message: `User is on ${currentCallCount} calls (maximum: ${maxCalls})`
                });
              } else {
                logger.debug(`Group call: Skipping user ${userId} at max calls without notification`);
              }
              continue;
            }

            // If admin, show override notification
            if (isAdmin) {
              targetSocket.emit('instant-busy-override', {
                callId,
                callerId,
                callerName: callerSession?.displayName || callerSession?.username || 'Admin',
                message: 'ADMIN OVERRIDE - You are busy but admin is connecting',
                currentCalls: currentCallCount
              });
            }
          }

          // DND Override notification
          if (targetSession?.dnd && isAdmin) {
            targetSocket.emit('instant-admin-override', {
              callId,
              callerId,
              callerName: callerSession?.displayName || callerSession?.username || 'Admin',
              message: 'ADMIN OVERRIDE - Emergency Connection'
            });
          }

          // Send instant connection
          targetSocket.emit('instant-incoming', {
            callId,
            callerId,
            callerName: callerSession?.displayName || callerSession?.username || 'Unknown',
            callerRole: callerSession?.role,
            isGroupCall,
            groupId,
            groupName: isGroupCall ? (await this.getGroup(groupId))?.name : null
          });

          // Auto-accept instant connection (no user interaction needed)
          // Add to participants
          callSession.participants.set(userId, {
            socketId: targetSocket.id,
            userId,
            joinedAt: new Date(),
            audioLevel: 0
          });
        }
      }

      // If no sockets were found for any targets, notify caller
      const anyFound = targets.some(uid => this.getSocketsByUserId(uid).length > 0);
      if (!anyFound) {
        // Log missed for each target
        for (const t of targets) {
          this.addMissedCall(t, {
            id: `${callId}-${t}`,
            fromUserId: callerId,
            at: new Date().toISOString(),
            type: isGroupCall ? 'group' : 'direct',
            reason: 'unreachable'
          });
        }
        socket.emit('instant-error', { message: 'Target user not reachable', attempted, matched });
        return;
      }

      // Add caller to participants
      callSession.participants.set(callerId, {
        socketId: socket.id,
        userId: callerId,
        joinedAt: new Date(),
        audioLevel: 0
      });

      // Store call session
      this.activeRooms.set(callId, callSession);

      // Notify caller that connection is established
      socket.emit('instant-connected', {
        callId,
        callerId,
        targetUserId: callSession.targetUserId, // Include targetUserId for 1:1 calls
        targetUserIds: callSession.targetUserIds, // Include targetUserIds for group calls
        participants: Array.from(callSession.participants.keys()),
        participantCount: callSession.participants.size,
        config: callSession.config,
        type: callSession.type,
        groupId: callSession.groupId,
      });

      // Broadcast to all participants that call is active
      this.broadcastToCall(callId, 'instant-call-active', {
        callId,
        callerId,
        targetUserId: callSession.targetUserId, // Include targetUserId for 1:1 calls
        targetUserIds: callSession.targetUserIds, // Include targetUserIds for group calls
        participants: Array.from(callSession.participants.keys()),
        participantCount: callSession.participants.size,
        config: callSession.config,
        type: callSession.type,
        groupId: callSession.groupId,
      });

      // Send WebRTC setup signal to all participants
      this.broadcastToCall(callId, 'webrtc-setup-required', {
        callId,
        participants: Array.from(callSession.participants.keys())
      });

      // If this is a group call and we're on a subscriber server, handle subscriber audio routing
      if (isGroupCall && groupId && this.subscriberAudioRouting) {
        try {
          await this.subscriberAudioRouting.handleUserJoinGroupCall(
            callerId,
            groupId
          );
        } catch (error) {
          logger.error(`Failed to handle subscriber audio routing for group call: ${error.message}`, error);
        }
      }

      // Start silence detection timer
      this.startSilenceDetection(callId);

      logger.info(`Instant call established: ${callId} with ${callSession.participants.size} participants`);

    } catch (error) {
      logger.error('Instant connect error:', error);
      socket.emit('instant-error', { message: 'Failed to establish connection', error: error.message });
    }
  }

  async handleInstantAccept(socket, data) {
    // This is optional since instant connections auto-accept
    // But keeping it for manual accept if needed
    const { callId } = data;
    logger.info(`Instant accept: ${socket.userId} accepted ${callId}`);
    socket.emit('instant-accepted', { callId });
  }

  async handleInstantReject(socket, data) {
    try {
      const { callId, reason } = data;
      const userId = socket.userId;
      
      logger.info(`Instant reject: ${userId} rejected ${callId}, reason: ${reason}`);

      const callSession = this.activeRooms.get(callId);
      if (!callSession) {
        return;
      }

      // Remove user from participants
      callSession.participants.delete(userId);

      // Notify caller
      const callerSocket = this.io.sockets.sockets.get(callSession.callerSocketId);
      if (callerSocket) {
        callerSocket.emit('instant-rejected', {
          callId,
          userId,
          reason
        });
      }

      // Notify user
      socket.emit('instant-disconnected', {
        callId,
        reason: 'rejected'
      });

      // If no participants left, end call
      if (callSession.participants.size <= 1) {
        this.endInstantCall(callId, 'all-rejected');
      }

    } catch (error) {
      logger.error('Instant reject error:', error);
    }
  }

  async handleInstantDisconnect(socket, data) {
    try {
      const { callId } = data;
      const userId = socket.userId;
      
      logger.info(`Instant disconnect: ${userId} from ${callId}`);

      const callSession = this.activeRooms.get(callId);
      if (!callSession) {
        return;
      }

      // Remove user from participants
      callSession.participants.delete(userId);

      // Notify all remaining participants
      this.broadcastToCall(callId, 'participant-left', {
        callId,
        userId,
        remainingParticipants: Array.from(callSession.participants.keys()),
        participantCount: callSession.participants.size
      });

      // Notify disconnecting user
      socket.emit('instant-disconnected', {
        callId,
        reason: 'user-disconnect'
      });

      // If this is a group call and we're on a subscriber server, handle subscriber audio routing cleanup
      if (callSession.groupId && this.subscriberAudioRouting) {
        try {
          await this.subscriberAudioRouting.handleUserLeaveGroupCall(
            userId,
            callSession.groupId
          );
        } catch (error) {
          logger.error(`Failed to handle subscriber audio routing cleanup for group call: ${error.message}`, error);
        }
      }

      // If caller disconnects or only 1 person left, end call
      if (userId === callSession.callerId || callSession.participants.size <= 1) {
        this.endInstantCall(callId, 'caller-disconnect');
      }

    } catch (error) {
      logger.error('Instant disconnect error:', error);
    }
  }

  handlePTTStart(socket, data) {
    try {
      const { callId } = data;
      const userId = socket.userId;

      logger.debug(`PTT start: ${userId} in ${callId}`);

      // Notify all participants that user is transmitting
      this.broadcastToCall(callId, 'ptt-transmitting', {
        userId,
        transmitting: true
      });

      // First-responder policy: if configured and a non-originator starts PTT, drop to 1:1
      const callSession = this.activeRooms.get(callId);
      if (callSession && callSession.config && callSession.config.policy === 'FIRST_ANSWER') {
        const callerId = callSession.callerId;
        if (callerId && userId && String(userId) !== String(callerId)) {
          const callerSocket = this.io.sockets.sockets.get(callSession.callerSocketId);
          if (callerSocket) {
            callerSocket.emit('first-responder-selected', {
              callId,
              responderId: userId
            });
          }
        }
      }

    } catch (error) {
      logger.error('PTT start error:', error);
    }
  }

  handlePTTStop(socket, data) {
    try {
      const { callId } = data;
      const userId = socket.userId;

      logger.debug(`PTT stop: ${userId} in ${callId}`);

      // Notify all participants that user stopped transmitting
      this.broadcastToCall(callId, 'ptt-transmitting', {
        userId,
        transmitting: false
      });

    } catch (error) {
      logger.error('PTT stop error:', error);
    }
  }

  handleAudioLevel(socket, data) {
    try {
      const { callId, level } = data;
      const userId = socket.userId;

      const callSession = this.activeRooms.get(callId);
      if (!callSession) {
        return;
      }

      // Update audio level
      const participant = callSession.participants.get(userId);
      if (participant) {
        participant.audioLevel = level;
        participant.lastAudioTime = new Date();
      }

      // Update session audio levels
      callSession.audioLevels.set(userId, {
        level,
        timestamp: Date.now()
      });

      // Broadcast audio levels to all participants
      this.broadcastToCall(callId, 'audio-levels', {
        levels: Object.fromEntries(callSession.audioLevels)
      });

    } catch (error) {
      logger.error('Audio level error:', error);
    }
  }

  startSilenceDetection(callId) {
    const callSession = this.activeRooms.get(callId);
    if (!callSession) {
      return;
    }

    // Clear existing timer
    if (callSession.silenceTimer) {
      clearInterval(callSession.silenceTimer);
    }

    // Check for silence every second
    callSession.silenceTimer = setInterval(() => {
      const now = Date.now();
      const silenceThreshold = 10000; // 10 seconds
      let allSilent = true;

      // Check if all participants are silent
      for (const [userId, audioLevel] of callSession.audioLevels.entries()) {
        if (now - audioLevel.timestamp < silenceThreshold) {
          allSilent = false;
          break;
        }
      }

      if (allSilent && callSession.audioLevels.size > 0) {
        // Calculate remaining time
        const oldestAudio = Math.min(...Array.from(callSession.audioLevels.values()).map(a => a.timestamp));
        const silenceDuration = now - oldestAudio;
        const remainingSeconds = Math.max(0, Math.ceil((silenceThreshold - silenceDuration) / 1000));

        if (remainingSeconds <= 3 && remainingSeconds > 0) {
          // Send warning
          this.broadcastToCall(callId, 'silence-warning', {
            callId,
            secondsRemaining: remainingSeconds
          });
        } else if (remainingSeconds === 0) {
          // Auto-disconnect
          logger.info(`Auto-disconnect due to silence: ${callId}`);
          this.endInstantCall(callId, 'silence-timeout');
        }
      }
    }, 1000);
  }

  endInstantCall(callId, reason) {
    const callSession = this.activeRooms.get(callId);
    if (!callSession) {
      return;
    }

    logger.info(`Ending instant call: ${callId}, reason: ${reason}`);

    // Clear silence timer
    if (callSession.silenceTimer) {
      clearInterval(callSession.silenceTimer);
    }

    // Calculate call duration
    const duration = Date.now() - callSession.startTime.getTime();

    // Notify all participants
    this.broadcastToCall(callId, 'instant-ended', {
      callId,
      reason,
      duration
    });

    // Log call to database (implement later)
    this.logInstantCall(callSession, reason, duration);

    // Remove call session
    this.activeRooms.delete(callId);
  }

  broadcastToCall(callId, event, data) {
    const callSession = this.activeRooms.get(callId);
    if (!callSession) {
      return;
    }

    for (const participant of callSession.participants.values()) {
      const socket = this.io.sockets.sockets.get(participant.socketId);
      if (socket) {
        socket.emit(event, data);
      }
    }
  }

  getSocketsByUserId(userIdOrUsername) {
    const sockets = [];
    const target = String(userIdOrUsername).toLowerCase();
    for (const [socketId, session] of this.userSessions.entries()) {
      // Prioritize username matching first
      const candidates = [
        session?.username, // Check username first (new standard)
        session?.user?.username,
        session?.userId, // Fall back to userId for backward compatibility
        session?.user?.id,
        session?.user?.userId,
        session?.user?.email,
      ]
        .filter(Boolean)
        .map(v => String(v).toLowerCase());
      if (candidates.includes(target)) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) sockets.push(socket);
      }
    }
    return sockets;
  }

  async logInstantCall(callSession, disconnectReason, duration) {
    try {
      const CallLog = require('./models/CallLog');
      
      // Build participants array with details
      const participants = [];
      for (const [userId, participant] of callSession.participants.entries()) {
        const session = this.userSessions.get(participant.socketId);
        participants.push({
          userId,
          userName: session?.displayName || session?.username || 'Unknown',
          joinedAt: participant.joinedAt,
          leftAt: new Date(),
          duration: new Date() - participant.joinedAt
        });
      }
      
      const logEntry = {
        callId: callSession.callId,
        type: 'instant-intercom',
        callerId: callSession.callerId,
        callerName: this.userSessions.get(callSession.callerSocketId)?.displayName || 'Unknown',
        participants,
        isGroupCall: callSession.type === 'group',
        groupId: callSession.groupId,
        startTime: callSession.startTime,
        endTime: new Date(),
        duration,
        disconnectReason,
        intercomMode: 'always-on' // TODO: Get from user settings
      };

      // Save to database
      await CallLog.logCall(logEntry);
      
      logger.info(`Call logged: ${callSession.callId}, duration: ${Math.floor(duration/1000)}s, reason: ${disconnectReason}`);
      
    } catch (error) {
      logger.error('Failed to log call:', error);
      // Don't throw - logging failure shouldn't break the call
    }
  }

  // Check if user is currently in any call
  isUserInCall(userId) {
    for (const [callId, callSession] of this.activeRooms.entries()) {
      // Only check instant calls (they use userId in participants)
      if (callSession.callId && callSession.callId.startsWith('instant-')) {
        if (callSession.participants && callSession.participants.has && callSession.participants.has(userId)) {
          // Verify the participant's socket is still connected
          const participant = callSession.participants.get(userId);
          if (participant && participant.socketId) {
            const socket = this.io.sockets.sockets.get(participant.socketId);
            if (socket && socket.connected) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  // Get number of active calls for a user
  getUserCallCount(userId) {
    let count = 0;
    for (const [callId, callSession] of this.activeRooms.entries()) {
      if (callSession.participants.has(userId)) {
        count++;
      }
    }
    return count;
  }

  // Get all active calls for a user
  getUserActiveCalls(userId) {
    const calls = [];
    for (const [callId, callSession] of this.activeRooms.entries()) {
      // Only check instant calls (legacy room system uses socket.id, not userId)
      if (callSession.callId && callSession.callId.startsWith('instant-')) {
        if (callSession.participants && callSession.participants.has && callSession.participants.has(userId)) {
          calls.push({
            callId,
            callerId: callSession.callerId,
            isGroupCall: callSession.type === 'group',
            groupId: callSession.groupId,
            participantCount: callSession.participants.size,
            startTime: callSession.startTime,
            duration: Date.now() - callSession.startTime.getTime()
          });
        }
      }
    }
    return calls;
  }

  // Clean up stale call state for a user (orphaned calls where user disconnected)
  cleanupStaleCallState(userId) {
    if (!userId) return;
    
    for (const [callId, callSession] of this.activeRooms.entries()) {
      // Only process instant calls
      if (!callSession.callId || !callSession.callId.startsWith('instant-')) continue;
      
      // Check if user is in this call but their socket is no longer connected
      if (callSession.participants && callSession.participants.has && callSession.participants.has(userId)) {
        const participant = callSession.participants.get(userId);
        if (participant && participant.socketId) {
          const socket = this.io.sockets.sockets.get(participant.socketId);
          // If socket doesn't exist or is disconnected, remove user from call
          if (!socket || !socket.connected) {
            logger.info(`Cleaning up stale call state: ${userId} in ${callId} (socket disconnected)`);
            callSession.participants.delete(userId);
            
            // Notify remaining participants
            this.broadcastToCall(callId, 'participant-left', {
              callId,
              userId,
              reason: 'stale-connection',
              remainingParticipants: Array.from(callSession.participants.keys()),
              participantCount: callSession.participants.size
            });
            
            // If caller disconnected or only 1 person left, end call
            if (userId === callSession.callerId || callSession.participants.size <= 1) {
              this.endInstantCall(callId, 'stale-connection');
            }
          }
        }
      }
    }
  }

  // Handle WebRTC producer ready
  handleProducerReady(socket, data) {
    const { callId, producerId, kind } = data;
    const userId = socket.userId;

    logger.info(`Producer ready: ${userId} in call ${callId}, producer ${producerId}`);

    // Notify all other participants in the call
    const callSession = this.activeRooms.get(callId);
    if (!callSession) {
      logger.warn(`Call session not found: ${callId}`);
      return;
    }

    // Broadcast to all other participants
    for (const [participantId, participant] of callSession.participants.entries()) {
      if (participantId !== userId) {
        const participantSocket = this.io.sockets.sockets.get(participant.socketId);
        if (participantSocket) {
          participantSocket.emit('new-producer', {
            callId,
            producerId,
            userId,
            kind
          });
        }
      }
    }
  }

  // ============================================================================
  // Group Call WebSocket Events (spec section 7.3)
  // ============================================================================

  /**
   * Emit group-call-answered event (first-answer mode)
   * Notifies non-answerers that someone else answered
   * @param {string} sessionId - Call session ID
   * @param {string} answeredBy - Username of the user who answered
   * @param {string} displayName - Display name of the answerer
   * @param {string[]} targetUsernames - Array of usernames to notify
   */
  emitGroupCallAnswered(sessionId, answeredBy, displayName, targetUsernames) {
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
  emitGroupCallParticipantJoined(sessionId, joinedUsername, displayName, currentCount, topologyChange, newTopology, roomId) {
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

    // Get all sockets for all users (broadcast to all connected clients)
    // In practice, you'd want to track which users are in the session
    this.io.emit('group-call-participant-joined', event);

    logger.info(`Group call participant joined: ${joinedUsername} in session ${sessionId}`);
  }

  /**
   * Emit group-call-no-answer event
   * Notifies when a participant doesn't answer within timeout
   */
  emitGroupCallNoAnswer(sessionId, username, reason) {
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
  emitGroupCallCancelled(sessionId, reason, targetUsernames) {
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
      this.io.emit('group-call-cancelled', event);
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
  emitBroadcastActivated(lineId, sessionId, activatedBy, displayName, roomId, targetUsernames) {
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
      this.io.emit('broadcast-activated', event);
    }

    logger.info(`Broadcast activated: ${activatedBy} activated line ${lineId}`);
  }

  /**
   * Emit broadcast-participant-joined event
   * Notifies existing participants that someone joined
   */
  emitBroadcastParticipantJoined(sessionId, lineId, joinedUsername, displayName, currentCount) {
    const event = {
      event: 'broadcast-participant-joined',
      sessionId,
      lineId,
      joinedUsername, // Use username instead of userId
      displayName,
      currentCount
    };

    this.io.emit('broadcast-participant-joined', event);

    logger.info(`Broadcast participant joined: ${joinedUsername} in session ${sessionId}`);
  }

  /**
   * Emit broadcast-participant-left event
   */
  emitBroadcastParticipantLeft(sessionId, lineId, leftUsername, displayName, currentCount) {
    const event = {
      event: 'broadcast-participant-left',
      sessionId,
      lineId,
      leftUsername, // Use username instead of userId
      displayName,
      currentCount
    };

    this.io.emit('broadcast-participant-left', event);

    logger.info(`Broadcast participant left: ${leftUsername} from session ${sessionId}`);
  }

  /**
   * Emit broadcast-closed event
   * Notifies all participants that broadcast was closed
   */
  emitBroadcastClosed(sessionId, lineId, closedBy, participantsKicked) {
    const event = {
      event: 'broadcast-closed',
      sessionId,
      lineId,
      closedBy,
      participantsKicked: participantsKicked || []
    };

    this.io.emit('broadcast-closed', event);

    logger.info(`Broadcast closed: ${closedBy} closed session ${sessionId}`);
  }

  /**
   * Emit PTT transmit start/end events
   */
  emitPTTTransmitStart(sessionId, userId, displayName) {
    const event = {
      event: 'ptt-transmit-start',
      sessionId,
      userId,
      displayName
    };

    this.io.emit('ptt-transmit-start', event);
  }

  emitPTTTransmitEnd(sessionId, userId, displayName) {
    const event = {
      event: 'ptt-transmit-end',
      sessionId,
      userId,
      displayName
    };

    this.io.emit('ptt-transmit-end', event);
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Get all socket connections for a user ID
   */
  getUserSockets(userIdOrUsername) {
    const sockets = [];
    const target = String(userIdOrUsername).toLowerCase();

    for (const [socketId, session] of this.userSessions.entries()) {
      // Prioritize username matching first (new standard)
      const sessionUsername = session?.username ? String(session.username).toLowerCase() : null;
      const sessionUserId = session?.userId ? String(session.userId).toLowerCase() : null;
      
      // Match by username first, then fall back to userId for backward compatibility
      if (sessionUsername === target || sessionUserId === target) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          sockets.push(socket);
        }
      }
    }

    return sockets;
  }
}

function setupSocketHandlers(io, services) {
  const handler = new SocketHandler(io, services);
  handler.setupHandlers();
  return handler;
}

module.exports = { setupSocketHandlers };
