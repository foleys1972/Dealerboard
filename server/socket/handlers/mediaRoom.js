const logger = require('../../utils/logger');
const { audioRecordingService } = require('../../services/audioRecordingService');
const { getUserById, getUserByIdOrUsername } = require('../../services/databaseService');
const { verifyToken } = require('../../middleware/auth');

function attachMediaRoomHandlers(SocketHandler) {
  SocketHandler.prototype.handleJoinRoom = async function(socket, data) {
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

  SocketHandler.prototype.handleLeaveRoom = async function(socket, data) {
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

  SocketHandler.prototype.handleStartSpeaking = async function(socket, data) {
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

  SocketHandler.prototype.handleStopSpeaking = async function(socket, data) {
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

  SocketHandler.prototype.handleMuteToggle = async function(socket, data) {
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

  SocketHandler.prototype.handleStartRecording = async function(socket, data) {
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

  SocketHandler.prototype.handleStopRecording = async function(socket, data) {
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
}

module.exports = { attachMediaRoomHandlers };
