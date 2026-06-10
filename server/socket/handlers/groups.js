const logger = require('../../utils/logger');
const { audioRecordingService } = require('../../services/audioRecordingService');
const { getUserById, getUserByIdOrUsername } = require('../../services/databaseService');
const { verifyToken } = require('../../middleware/auth');

function attachGroupHandlers(SocketHandler) {
  SocketHandler.prototype.handleCreateGroup = async function(socket, data) {
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
  };

  SocketHandler.prototype.handleJoinGroup = async function(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session?.isAuthenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const groupId = data?.groupId;
      if (!groupId) {
        socket.emit('error', { message: 'join-group: groupId required' });
        return;
      }

      if (!this.groupService) {
        socket.emit('error', { message: 'Group service unavailable' });
        return;
      }

      const result = await this.groupService.joinGroup(groupId, session.userId, data?.userData || {});
      socket.join(String(groupId));
      socket.emit('group-joined', result);
      socket.to(String(groupId)).emit('group-participant-joined', {
        groupId,
        userId: session.userId,
        username: session.username,
      });
    } catch (error) {
      logger.error('Failed to join group:', error);
      socket.emit('error', { message: error.message || 'Failed to join group' });
    }
  };

  SocketHandler.prototype.handleLeaveGroup = async function(socket, data) {
    try {
      const session = this.userSessions.get(socket.id);
      if (!session?.isAuthenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const groupId = data?.groupId;
      if (!groupId) {
        socket.emit('error', { message: 'leave-group: groupId required' });
        return;
      }

      if (!this.groupService) {
        socket.emit('error', { message: 'Group service unavailable' });
        return;
      }

      await this.groupService.leaveGroup(groupId, session.userId);
      socket.leave(String(groupId));
      socket.emit('group-left', { groupId, userId: session.userId });
      socket.to(String(groupId)).emit('group-participant-left', {
        groupId,
        userId: session.userId,
        username: session.username,
      });
    } catch (error) {
      logger.error('Failed to leave group:', error);
      socket.emit('error', { message: error.message || 'Failed to leave group' });
    }
  };

  SocketHandler.prototype.handleWebRTCOffer = async function(socket, data) {
    const session = this.userSessions.get(socket.id);
    if (!session) return;

    const payload = {
      ...data,
      fromUserId: session.userId,
      fromUsername: session.username,
    };

    if (data?.targetUserId) {
      for (const targetSocket of this.getUserSockets(data.targetUserId)) {
        targetSocket.emit('webrtc-offer', payload);
      }
      return;
    }

    if (data?.groupId || data?.roomId) {
      const room = String(data.groupId || data.roomId);
      socket.to(room).emit('webrtc-offer', payload);
    }
  };

  SocketHandler.prototype.handleWebRTCAnswer = async function(socket, data) {
    const session = this.userSessions.get(socket.id);
    if (!session) return;

    const payload = {
      ...data,
      fromUserId: session.userId,
      fromUsername: session.username,
    };

    if (data?.targetUserId) {
      for (const targetSocket of this.getUserSockets(data.targetUserId)) {
        targetSocket.emit('webrtc-answer', payload);
      }
      return;
    }

    if (data?.groupId || data?.roomId) {
      const room = String(data.groupId || data.roomId);
      socket.to(room).emit('webrtc-answer', payload);
    }
  };

  SocketHandler.prototype.handleWebRTCIceCandidate = async function(socket, data) {
    const session = this.userSessions.get(socket.id);
    if (!session) return;

    const payload = {
      ...data,
      fromUserId: session.userId,
      fromUsername: session.username,
    };

    if (data?.targetUserId) {
      for (const targetSocket of this.getUserSockets(data.targetUserId)) {
        targetSocket.emit('webrtc-ice-candidate', payload);
      }
      return;
    }

    if (data?.groupId || data?.roomId) {
      const room = String(data.groupId || data.roomId);
      socket.to(room).emit('webrtc-ice-candidate', payload);
    }
  };
}

module.exports = { attachGroupHandlers };
