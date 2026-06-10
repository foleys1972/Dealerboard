const logger = require('../utils/logger');
const { Bridge } = require('matrix-appservice-bridge');

class MatrixAppService {
  constructor() {
    this.bridge = null;
    this.config = {
      enabled: process.env.MATRIX_APPSERVICE_ENABLED === 'true',
      port: process.env.MATRIX_APPSERVICE_PORT || 9000,
      homeserverUrl: process.env.MATRIX_HOMESERVER_URL || 'http://localhost:8008',
      appserviceUrl: process.env.MATRIX_APPSERVICE_URL || 'http://localhost:9000',
      appserviceToken: process.env.MATRIX_APPSERVICE_TOKEN || 'trading-intercom-token',
      homeserverToken: process.env.MATRIX_HOMESERVER_TOKEN || 'trading-intercom-homeserver-token',
      appserviceId: process.env.MATRIX_APPSERVICE_ID || 'trading-intercom',
    };
  }

  async initialize() {
    if (!this.config.enabled) {
      logger.warn('Matrix AppService is disabled');
      return null;
    }

    try {
      // Create bridge configuration
      const bridgeConfig = {
        homeserver: {
          url: this.config.homeserverUrl,
          serverName: process.env.MATRIX_SERVER_NAME || 'trading-intercom.local',
        },
        appservice: {
          url: this.config.appserviceUrl,
          port: this.config.port,
          id: this.config.appserviceId,
          as_token: this.config.appserviceToken,
          hs_token: this.config.homeserverToken,
        },
        registration: {
          as_token: this.config.appserviceToken,
          hs_token: this.config.homeserverToken,
          sender_localpart: 'trading-intercom-bot',
          namespaces: {
            users: [
              {
                regex: '@trading-intercom_.*',
                exclusive: true,
              },
            ],
            rooms: [
              {
                regex: '#trading-group-.*',
                exclusive: true,
              },
              {
                regex: '#trading-broadcast-.*',
                exclusive: true,
              },
              {
                regex: '#trading-private-.*',
                exclusive: true,
              },
            ],
          },
        },
        logging: {
          level: 'info',
          maxFiles: 5,
          maxSize: '10M',
        },
      };

      // Create the bridge
      this.bridge = new Bridge(bridgeConfig);

      // Set up event handlers
      this.setupEventHandlers();

      // Start the bridge
      await this.bridge.run(this.config.port, this.config.appserviceUrl);

      logger.info('Matrix AppService initialized successfully', {
        port: this.config.port,
        appserviceUrl: this.config.appserviceUrl,
        appserviceId: this.config.appserviceId,
      });

      return this.bridge;
    } catch (error) {
      logger.error('Failed to initialize Matrix AppService:', error);
      return null;
    }
  }

  setupEventHandlers() {
    if (!this.bridge) return;

    // Handle room events
    this.bridge.on('event', (request, context) => {
      this.handleMatrixEvent(request, context);
    });

    // Handle user events
    this.bridge.on('user.query', (request, context) => {
      this.handleUserQuery(request, context);
    });

    // Handle room query events
    this.bridge.on('room.query', (request, context) => {
      this.handleRoomQuery(request, context);
    });

    // Handle room alias query events
    this.bridge.on('room.alias.query', (request, context) => {
      this.handleRoomAliasQuery(request, context);
    });
  }

  handleMatrixEvent(request, context) {
    const event = request.getData();
    const roomId = event.room_id;
    const eventType = event.type;

    logger.info('Matrix event received', {
      eventType,
      roomId,
      sender: event.sender,
      content: event.content,
    });

    // Handle different event types
    switch (eventType) {
      case 'm.room.message':
        this.handleRoomMessage(event, context);
        break;
      case 'm.room.member':
        this.handleRoomMember(event, context);
        break;
      case 'm.room.create':
        this.handleRoomCreate(event, context);
        break;
      case 'm.room.topic':
        this.handleRoomTopic(event, context);
        break;
      default:
        logger.debug('Unhandled Matrix event type', { eventType });
    }
  }

  handleRoomMessage(event, context) {
    const roomId = event.room_id;
    const content = event.content;
    const sender = event.sender;

    // Extract group ID from room ID
    const groupId = this.extractGroupIdFromRoomId(roomId);
    if (groupId) {
      logger.info('Matrix message for group', {
        groupId,
        roomId,
        sender,
        body: content.body,
        msgtype: content.msgtype,
      });

      // Forward message to TradeCom group
      this.forwardMessageToGroup(groupId, {
        sender,
        message: content.body,
        messageType: content.msgtype,
        timestamp: event.origin_server_ts,
      });
    }
  }

  handleRoomMember(event, context) {
    const roomId = event.room_id;
    const membership = event.content.membership;
    const userId = event.state_key;

    const groupId = this.extractGroupIdFromRoomId(roomId);
    if (groupId) {
      logger.info('Matrix room member event for group', {
        groupId,
        roomId,
        userId,
        membership,
      });

      // Forward membership change to TradeCom group
      this.forwardMembershipChangeToGroup(groupId, {
        userId,
        membership,
        timestamp: event.origin_server_ts,
      });
    }
  }

  handleRoomCreate(event, context) {
    const roomId = event.room_id;
    const roomName = event.content.name;

    logger.info('Matrix room created', {
      roomId,
      roomName,
    });
  }

  handleRoomTopic(event, context) {
    const roomId = event.room_id;
    const topic = event.content.topic;

    logger.info('Matrix room topic updated', {
      roomId,
      topic,
    });
  }

  handleUserQuery(request, context) {
    const userId = request.getData().user_id;
    
    logger.info('Matrix user query', { userId });
    
    // Return user information
    return {
      user_id: userId,
      display_name: this.getDisplayNameForUser(userId),
      avatar_url: this.getAvatarUrlForUser(userId),
    };
  }

  handleRoomQuery(request, context) {
    const roomId = request.getData().room_id;
    
    logger.info('Matrix room query', { roomId });
    
    // Return room information
    return {
      room_id: roomId,
      name: this.getRoomName(roomId),
      topic: this.getRoomTopic(roomId),
    };
  }

  handleRoomAliasQuery(request, context) {
    const alias = request.getData().alias;
    
    logger.info('Matrix room alias query', { alias });
    
    // Return room information for alias
    return {
      room_id: this.getRoomIdFromAlias(alias),
    };
  }

  extractGroupIdFromRoomId(roomId) {
    // Extract group ID from Matrix room ID
    // Format: #trading-group-{groupId}:trading-intercom.local
    const match = roomId.match(/#trading-group-([^:]+):/);
    return match ? match[1] : null;
  }

  forwardMessageToGroup(groupId, messageData) {
    // Forward Matrix message to TradeCom group
    // This would integrate with the group service
    logger.info('Forwarding message to TradeCom group', {
      groupId,
      messageData,
    });
  }

  forwardMembershipChangeToGroup(groupId, membershipData) {
    // Forward membership change to TradeCom group
    // This would integrate with the group service
    logger.info('Forwarding membership change to TradeCom group', {
      groupId,
      membershipData,
    });
  }

  getDisplayNameForUser(userId) {
    // Get display name for Matrix user
    return userId.split(':')[0].substring(1); // Remove @ and domain
  }

  getAvatarUrlForUser(userId) {
    // Get avatar URL for Matrix user
    return null; // No avatar for now
  }

  getRoomName(roomId) {
    // Get room name from room ID
    return `Trading Group ${this.extractGroupIdFromRoomId(roomId)}`;
  }

  getRoomTopic(roomId) {
    // Get room topic from room ID
    return `Communication room for trading group ${this.extractGroupIdFromRoomId(roomId)}`;
  }

  getRoomIdFromAlias(alias) {
    // Get room ID from alias
    return null; // Not implemented yet
  }

  async sendMessageToRoom(roomId, message, messageType = 'm.text') {
    if (!this.bridge) {
      throw new Error('Matrix AppService not initialized');
    }

    try {
      const intent = this.bridge.getIntent();
      await intent.sendMessage(roomId, {
        msgtype: messageType,
        body: message,
      });

      logger.info('Message sent to Matrix room', {
        roomId,
        messageType,
      });
    } catch (error) {
      logger.error('Failed to send message to Matrix room:', error);
      throw error;
    }
  }

  async createRoom(roomName, topic, members = []) {
    if (!this.bridge) {
      throw new Error('Matrix AppService not initialized');
    }

    try {
      const intent = this.bridge.getIntent();
      const roomId = await intent.createRoom({
        name: roomName,
        topic: topic,
        invite: members,
        preset: 'private_chat',
      });

      logger.info('Matrix room created', {
        roomId,
        roomName,
        memberCount: members.length,
      });

      return roomId;
    } catch (error) {
      logger.error('Failed to create Matrix room:', error);
      throw error;
    }
  }

  async inviteUser(roomId, userId) {
    if (!this.bridge) {
      throw new Error('Matrix AppService not initialized');
    }

    try {
      const intent = this.bridge.getIntent();
      await intent.invite(roomId, userId);

      logger.info('User invited to Matrix room', {
        roomId,
        userId,
      });
    } catch (error) {
      logger.error('Failed to invite user to Matrix room:', error);
      throw error;
    }
  }

  getStatus() {
    return {
      isInitialized: this.bridge !== null,
      port: this.config.port,
      appserviceUrl: this.config.appserviceUrl,
      appserviceId: this.config.appserviceId,
      enabled: this.config.enabled,
    };
  }

  async cleanup() {
    if (this.bridge) {
      await this.bridge.close();
      this.bridge = null;
      logger.info('Matrix AppService cleaned up');
    }
  }
}

// Initialize the service
const matrixAppService = new MatrixAppService();

module.exports = {
  matrixAppService,
  MatrixAppService,
  initializeMatrixAppService: () => matrixAppService.initialize(),
};
