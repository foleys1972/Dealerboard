const logger = require('../utils/logger');
const sdk = require('matrix-js-sdk');

class MatrixService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.roomMappings = new Map();
    this.userMappings = new Map();
    this.eventHandlers = new Map();
    this.federationServers = new Map();
    this.config = {
      baseUrl: process.env.MATRIX_SERVER_URL || 'https://matrix.org',
      accessToken: process.env.MATRIX_ACCESS_TOKEN,
      userId: process.env.MATRIX_USER_ID,
      deviceId: process.env.MATRIX_DEVICE_ID,
      serverName: process.env.MATRIX_SERVER_NAME || 'trading-intercom.local',
      federationEnabled: process.env.MATRIX_FEDERATION_ENABLED === 'true',
      enabled: process.env.MATRIX_ENABLED === 'true',
      homeserverUrl: process.env.MATRIX_HOMESERVER_URL || 'http://localhost:8008',
      appserviceUrl: process.env.MATRIX_APPSERVICE_URL || 'http://localhost:9000',
      appserviceToken: process.env.MATRIX_APPSERVICE_TOKEN || 'trading-intercom-token',
      appserviceId: process.env.MATRIX_APPSERVICE_ID || 'trading-intercom',
    };
  }

  async initialize() {
    if (!this.config.enabled) {
      logger.warn('Matrix integration is disabled');
      return null;
    }

    try {
      // Initialize Matrix client
      this.client = sdk.createClient({
        baseUrl: this.config.baseUrl,
        accessToken: this.config.accessToken,
        userId: this.config.userId,
        deviceId: this.config.deviceId,
      });

      // Set up event handlers
      this.setupEventHandlers();

      // Start sync
      await this.client.startClient();
      this.isConnected = true;

      logger.info('Matrix client initialized successfully', {
        serverName: this.config.serverName,
        federationEnabled: this.config.federationEnabled,
        baseUrl: this.config.baseUrl
      });

      // Initialize federation if enabled
      if (this.config.federationEnabled) {
        await this.initializeFederation();
      }

      return this.client;
    } catch (error) {
      logger.error('Failed to initialize Matrix client:', error);
      return null;
    }
  }

  async initializeFederation() {
    try {
      // Set up federation with other servers
      const federationServers = process.env.MATRIX_FEDERATION_SERVERS ? 
        process.env.MATRIX_FEDERATION_SERVERS.split(',') : [];

      for (const serverUrl of federationServers) {
        await this.addFederationServer(serverUrl);
      }

      logger.info('Matrix federation initialized', {
        serverCount: this.federationServers.size,
        servers: Array.from(this.federationServers.keys())
      });
    } catch (error) {
      logger.error('Failed to initialize Matrix federation:', error);
    }
  }

  async addFederationServer(serverUrl) {
    try {
      // Test federation with the server
      const serverInfo = await this.client.getWellKnown(serverUrl);
      this.federationServers.set(serverUrl, {
        url: serverUrl,
        connected: true,
        lastSeen: new Date(),
        serverInfo: serverInfo
      });
      
      logger.info('Added federation server', { serverUrl });
    } catch (error) {
      logger.warn('Failed to add federation server', { serverUrl, error: error.message });
      this.federationServers.set(serverUrl, {
        url: serverUrl,
        connected: false,
        lastSeen: new Date(),
        error: error.message
      });
    }
  }

  setupEventHandlers() {
    this.client.on('Room.timeline', (event, room, toStartOfTimeline) => {
      if (event.getType() === 'm.room.message') {
        this.handleRoomMessage(event, room);
      }
    });

    this.client.on('Room.member', (event, member) => {
      this.handleRoomMember(event, member);
    });

    this.client.on('sync', (state, prevState, data) => {
      if (state === 'PREPARED') {
        logger.info('Matrix client sync prepared');
      }
    });
  }

  handleRoomMessage(event, room) {
    const groupId = this.getGroupIdFromRoomId(room.roomId);
    if (groupId) {
      logger.info('Matrix message received for group', {
        groupId,
        roomId: room.roomId,
        sender: event.getSender(),
        content: event.getContent()
      });
    }
  }

  handleRoomMember(event, member) {
    const groupId = this.getGroupIdFromRoomId(member.roomId);
    if (groupId) {
      logger.info('Matrix room member event', {
        groupId,
        roomId: member.roomId,
        userId: member.userId,
        membership: member.membership
      });
    }
  }

  getStatus() {
    return {
      isInitialized: this.client !== null,
      isConnected: this.isConnected,
      userId: this.config.userId,
      deviceId: this.config.deviceId,
      roomCount: this.roomMappings.size,
      federationServers: Array.from(this.federationServers.values()),
      config: {
        baseUrl: this.config.baseUrl,
        serverName: this.config.serverName,
        federationEnabled: this.config.federationEnabled,
        enabled: this.config.enabled,
      },
    };
  }

  async getServerFederationInfo() {
    return { 
      connected: this.isConnected, 
      serverName: this.config.serverName,
      federationServers: Array.from(this.federationServers.values())
    };
  }

  async createGroupRoom(groupId, groupData) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      const roomName = `Trading Group: ${groupData.name}`;
      const roomTopic = groupData.description || `Communication room for ${groupData.name} trading group`;
      
      const response = await this.client.createRoom({
        name: roomName,
        topic: roomTopic,
        preset: 'private_chat',
        invite: groupData.members || [],
        is_direct: false,
        room_version: '6'
      });

      const roomId = response.room_id;
      this.roomMappings.set(groupId, roomId);
      
      logger.info('Matrix room created for group', {
        groupId,
        roomId,
        roomName,
        memberCount: groupData.members?.length || 0
      });

      return roomId;
    } catch (error) {
      logger.error('Failed to create Matrix room for group:', error);
      throw error;
    }
  }

  async joinRoom(roomId) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      await this.client.joinRoom(roomId);
      logger.info('Joined Matrix room', { roomId });
    } catch (error) {
      logger.error('Failed to join Matrix room:', error);
      throw error;
    }
  }

  async leaveRoom(roomId) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      await this.client.leave(roomId);
      logger.info('Left Matrix room', { roomId });
    } catch (error) {
      logger.error('Failed to leave Matrix room:', error);
      throw error;
    }
  }

  async sendMessage(roomId, message, messageType = 'm.text') {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      const response = await this.client.sendMessage(roomId, {
        msgtype: messageType,
        body: message
      });
      
      logger.info('Matrix message sent', {
        roomId,
        messageId: response.event_id,
        messageType
      });

      return response.event_id;
    } catch (error) {
      logger.error('Failed to send Matrix message:', error);
      throw error;
    }
  }

  async sendGroupBroadcast(groupId, message, senderId) {
    const roomId = this.getGroupRoomId(groupId);
    if (!roomId) {
      throw new Error(`No Matrix room found for group ${groupId}`);
    }

    return await this.sendMessage(roomId, message, 'm.text');
  }

  async inviteUser(roomId, userId) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      await this.client.invite(roomId, userId);
      logger.info('User invited to Matrix room', { roomId, userId });
    } catch (error) {
      logger.error('Failed to invite user to Matrix room:', error);
      throw error;
    }
  }

  async kickUser(roomId, userId, reason = '') {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      await this.client.kick(roomId, userId, reason);
      logger.info('User kicked from Matrix room', { roomId, userId, reason });
    } catch (error) {
      logger.error('Failed to kick user from Matrix room:', error);
      throw error;
    }
  }

  async setUserPowerLevel(roomId, userId, powerLevel) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      await this.client.setPowerLevel(roomId, userId, powerLevel);
      logger.info('User power level set in Matrix room', { roomId, userId, powerLevel });
    } catch (error) {
      logger.error('Failed to set user power level in Matrix room:', error);
      throw error;
    }
  }

  async getRoomInfo(roomId) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      const room = this.client.getRoom(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      return {
        roomId: room.roomId,
        name: room.name,
        topic: room.topic,
        memberCount: room.getJoinedMemberCount(),
        memberIds: room.getMembers().map(member => member.userId),
        powerLevels: room.currentState.getStateEvents('m.room.power_levels', ''),
        canSendMessages: room.maySendMessage(this.client.getUserId())
      };
    } catch (error) {
      logger.error('Failed to get Matrix room info:', error);
      throw error;
    }
  }

  async getRoomMembers(roomId) {
    if (!this.client) {
      return [];
    }

    try {
      const room = this.client.getRoom(roomId);
      if (!room) {
        return [];
      }

      return room.getMembers().map(member => ({
        userId: member.userId,
        displayName: member.name,
        membership: member.membership,
        powerLevel: member.powerLevel
      }));
    } catch (error) {
      logger.error('Failed to get Matrix room members:', error);
      return [];
    }
  }

  getGroupRoomId(groupId) {
    return this.roomMappings.get(groupId);
  }

  getGroupIdFromRoomId(roomId) {
    for (const [groupId, mappedRoomId] of this.roomMappings) {
      if (mappedRoomId === roomId) {
        return groupId;
      }
    }
    return null;
  }

  async syncGroupWithMatrix(groupId) {
    // No-op
  }

  async cleanup() {
    this.isConnected = false;
    this.roomMappings.clear();
    this.userMappings.clear();
    logger.info('Matrix service cleaned up');
  }
}

// Initialize the service
const matrixService = new MatrixService();

// Initialize on startup
matrixService.initialize().catch(error => {
  logger.error('Failed to initialize Matrix service:', error);
});

module.exports = {
  matrixService,
  MatrixService,
  initializeMatrixClient: () => matrixService.initialize(),
};