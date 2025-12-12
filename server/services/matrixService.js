const logger = require('../utils/logger');
const sdk = require('matrix-js-sdk');
const { pool } = require('./databaseService');
const { getOrchestratorService } = require('./orchestratorService');

class MatrixService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.roomMappings = new Map();
    this.userMappings = new Map();
    this.eventHandlers = new Map();
    this.federationServers = new Map();
    this.io = null; // Socket.IO instance for real-time updates
    this.homeserverClients = new Map(); // Map<homeserverId, client> for multi-homeserver support
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

    this.client.on('Room.receipt', (event, room) => {
      this.handleRoomReceipt(event, room);
    });

    this.client.on('sync', (state, prevState, data) => {
      if (state === 'PREPARED') {
        logger.info('Matrix client sync prepared');
      }
    });
  }
  
  handleRoomReceipt(event, room) {
    // Handle read receipt updates
    const receiptContent = event.getContent();
    const roomId = room.roomId;
    
    // Extract read receipts from the event
    const receipts = [];
    for (const [eventId, receiptData] of Object.entries(receiptContent)) {
      if (receiptData['m.read']) {
        for (const [userId, receiptInfo] of Object.entries(receiptData['m.read'])) {
          receipts.push({
            eventId,
            userId,
            timestamp: receiptInfo.ts || Date.now(),
            roomId
          });
        }
      }
    }
    
    // Emit read receipt updates via Socket.IO
    if (this.io && receipts.length > 0) {
      this.io.emit('matrix-read-receipt', {
        roomId,
        receipts
      });
      logger.debug('Emitted Matrix read receipt event', { roomId, receiptCount: receipts.length });
    }
  }

  handleRoomMessage(event, room) {
    const groupId = this.getGroupIdFromRoomId(room.roomId);
    const eventType = event.getType();
    
    if (eventType === 'm.room.message') {
      const content = event.getContent();
      const sender = event.getSender();
      const eventId = event.getId();
      const timestamp = event.getTs();
      
      // Get sender display name
      const senderMember = room.getMember(sender);
      const senderName = senderMember?.name || sender;
      
      const messageData = {
        eventId,
        sender: sender,
        senderName: senderName,
        content: content.body || '',
        messageType: content.msgtype || 'm.text',
        timestamp: timestamp,
        formattedTime: new Date(timestamp).toISOString(),
        roomId: room.roomId
      };
      
      // Emit real-time message event via Socket.IO
      if (this.io) {
        this.io.emit('matrix-message', messageData);
        logger.debug('Emitted Matrix message event', { roomId: room.roomId, eventId });
      }
      
      if (groupId) {
        logger.info('Matrix message received for group', {
          groupId,
          roomId: room.roomId,
          sender: sender,
          content: content.body
        });
      } else {
        // Direct message
        logger.info('Matrix direct message received', {
          roomId: room.roomId,
          sender: sender,
          content: content.body
        });
      }
    }
  }
  
  // Set Socket.IO instance for real-time updates
  setSocketIO(io) {
    this.io = io;
    logger.info('Matrix service Socket.IO instance set');
  }

  async handleRoomMember(event, member) {
    const roomId = member.roomId;
    const matrixUserId = member.userId;
    const membership = member.membership; // 'join', 'leave', 'invite', 'ban', etc.
    
    try {
      // Get our user ID from Matrix user ID
      const userId = await this.getUserIdFromMatrixId(matrixUserId);
      if (!userId) {
        logger.warn('Could not find user ID for Matrix user', { matrixUserId });
        return;
      }

      // Get the homeserver ID for this room
      const roomAssignment = await pool.query(
        `SELECT homeserver_id FROM matrix_room_assignments WHERE room_id = $1`,
        [roomId]
      );
      const homeserverId = roomAssignment.rows[0]?.homeserver_id;

      if (!homeserverId) {
        logger.warn('Could not find homeserver assignment for room', { roomId });
        return;
      }

      // Track participant via orchestrator
      const orchestratorService = getOrchestratorService();
      
      if (membership === 'join') {
        await orchestratorService.trackParticipant(roomId, userId, homeserverId);
        
        // Emit real-time update via Socket.IO
        if (this.io) {
          this.io.to(`room:${roomId}`).emit('participant-joined', {
            roomId,
            userId,
            matrixUserId,
            homeserverId,
            timestamp: new Date()
          });
        }
        
        logger.info('Participant joined room', {
          roomId,
          userId,
          matrixUserId,
          homeserverId
        });
      } else if (membership === 'leave' || membership === 'ban') {
        // Remove participant from tracking
        await pool.query(
          `DELETE FROM matrix_room_participants WHERE room_id = $1 AND user_id = $2`,
          [roomId, userId]
        );
        
        // Remove from in-memory tracking
        const participants = orchestratorService.participantTracking.get(roomId);
        if (participants) {
          const participantArray = Array.from(participants);
          const toRemove = participantArray.find(p => p.userId === userId);
          if (toRemove) {
            participants.delete(toRemove);
          }
        }
        
        // Emit real-time update via Socket.IO
        if (this.io) {
          this.io.to(`room:${roomId}`).emit('participant-left', {
            roomId,
            userId,
            matrixUserId,
            timestamp: new Date()
          });
        }
        
        logger.info('Participant left room', {
          roomId,
          userId,
          matrixUserId,
          membership
        });
      }

      const groupId = this.getGroupIdFromRoomId(roomId);
      if (groupId) {
        logger.debug('Matrix room member event processed', {
          groupId,
          roomId,
          userId,
          matrixUserId,
          membership
        });
      }
    } catch (error) {
      logger.error('Failed to handle room member event:', error);
    }
  }

  // Export all messages for compliance
  async exportMessagesForCompliance(options = {}) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    const {
      startDate = null,
      endDate = null,
      roomIds = null, // Array of room IDs, or null for all rooms
      format = 'json' // 'json' or 'csv'
    } = options;

    try {
      const allMessages = [];
      const roomsToExport = roomIds || this.client.getRooms().map(room => room.roomId);

      logger.info(`Starting compliance export for ${roomsToExport.length} rooms`, {
        startDate,
        endDate,
        format
      });

      // Export messages from each room
      for (const roomId of roomsToExport) {
        try {
          const room = this.client.getRoom(roomId);
          if (!room) {
            logger.warn(`Room ${roomId} not found, skipping`);
            continue;
          }

          // Get all messages from this room
          const roomMessages = await this.getRoomMessages(roomId);
          
          // Filter by date range if provided
          let filteredMessages = roomMessages.messages || [];
          
          if (startDate || endDate) {
            const start = startDate ? new Date(startDate).getTime() : 0;
            const end = endDate ? new Date(endDate).getTime() : Date.now();
            
            filteredMessages = filteredMessages.filter(msg => {
              const msgTime = msg.timestamp || 0;
              return msgTime >= start && msgTime <= end;
            });
          }

          // Add room context to each message
          filteredMessages.forEach(msg => {
            allMessages.push({
              ...msg,
              roomId: roomId,
              roomName: room.name || 'Unnamed Room',
              roomType: this.getGroupIdFromRoomId(roomId) ? 'group' : 'direct'
            });
          });

          logger.debug(`Exported ${filteredMessages.length} messages from room ${roomId}`);
        } catch (error) {
          logger.error(`Failed to export messages from room ${roomId}:`, error);
          // Continue with other rooms
        }
      }

      // Sort all messages by timestamp
      allMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      // Format export based on requested format
      let exportData;
      if (format === 'csv') {
        exportData = this.formatMessagesAsCSV(allMessages);
      } else {
        exportData = {
          exportId: `matrix-export-${Date.now()}`,
          exportedAt: new Date().toISOString(),
          exportPeriod: {
            startDate: startDate || 'all',
            endDate: endDate || 'all'
          },
          totalMessages: allMessages.length,
          roomsExported: roomsToExport.length,
          format: 'json',
          messages: allMessages
        };
      }

      logger.info(`Compliance export completed: ${allMessages.length} messages exported`);

      return {
        data: exportData,
        format,
        messageCount: allMessages.length,
        roomCount: roomsToExport.length
      };
    } catch (error) {
      logger.error('Failed to export messages for compliance:', error);
      throw error;
    }
  }

  // Mark a message as read (send read receipt)
  async markMessageAsRead(roomId, eventId) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      // Use Matrix SDK to send read receipt
      await this.client.sendReadReceipt(roomId, eventId);
      
      logger.info('Read receipt sent', { roomId, eventId });
      
      return { success: true, roomId, eventId };
    } catch (error) {
      logger.error('Failed to send read receipt:', error);
      throw error;
    }
  }

  // Mark all messages in a room as read (up to a specific event)
  async markRoomAsRead(roomId, eventId = null) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      const room = this.client.getRoom(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      // If no eventId provided, use the latest event
      if (!eventId) {
        const timeline = room.timeline || [];
        const lastMessage = timeline
          .filter(e => e.getType() === 'm.room.message')
          .pop();
        if (lastMessage) {
          eventId = lastMessage.getId();
        } else {
          return { success: true, message: 'No messages to mark as read' };
        }
      }

      await this.client.sendReadReceipt(roomId, eventId);
      
      logger.info('Room marked as read', { roomId, eventId });
      
      return { success: true, roomId, eventId };
    } catch (error) {
      logger.error('Failed to mark room as read:', error);
      throw error;
    }
  }

  // Get read receipts for a specific event
  async getReadReceipts(roomId, eventId) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      const room = this.client.getRoom(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      // Get read receipts from room state
      const receipts = room.getReceiptsForEvent(eventId);
      
      const readReceipts = receipts.map(receipt => ({
        userId: receipt.userId,
        timestamp: receipt.ts || Date.now(),
        eventId: eventId
      }));

      return {
        eventId,
        roomId,
        readReceipts
      };
    } catch (error) {
      logger.error('Failed to get read receipts:', error);
      throw error;
    }
  }

  // Create a standalone chat room (not tied to a group)
  async createChatRoom(roomData) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      const { name, type, members = [], createdBy } = roomData;
      
      // Create Matrix room
      const response = await this.client.createRoom({
        name: name,
        preset: type === 'direct' ? 'trusted_private_chat' : 'private_chat',
        is_direct: type === 'direct',
        invite: members,
        visibility: 'private',
        room_version: '6'
      });

      const roomId = response.room_id;
      
      // Store in database
      const chatRoomId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await pool.query(
        `INSERT INTO matrix_chat_rooms (id, room_id, name, type, created_by, members, last_activity, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
        [chatRoomId, roomId, name, type, createdBy, members, JSON.stringify({})]
      );

      logger.info('Standalone chat room created', {
        chatRoomId,
        roomId,
        name,
        type,
        createdBy,
        memberCount: members.length
      });

      return {
        chatRoomId,
        roomId,
        name,
        type
      };
    } catch (error) {
      logger.error('Failed to create chat room:', error);
      throw error;
    }
  }

  // Update room last activity
  async updateRoomActivity(roomId) {
    try {
      await pool.query(
        `UPDATE matrix_chat_rooms 
         SET last_activity = NOW(), updated_at = NOW()
         WHERE room_id = $1`,
        [roomId]
      );
    } catch (error) {
      logger.error('Failed to update room activity:', error);
      // Don't throw - this is a non-critical operation
    }
  }

  // Archive inactive rooms
  async archiveInactiveRooms(inactiveDays) {
    if (!inactiveDays || inactiveDays <= 0) {
      return { archived: 0, message: 'Archive disabled' };
    }

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

      const result = await pool.query(
        `UPDATE matrix_chat_rooms
         SET is_archived = true, archived_at = NOW(), updated_at = NOW()
         WHERE is_archived = false
           AND last_activity < $1
           AND last_activity IS NOT NULL
         RETURNING id, room_id, name`,
        [cutoffDate]
      );

      const archivedCount = result.rows.length;
      
      if (archivedCount > 0) {
        logger.info(`Archived ${archivedCount} inactive rooms`, {
          inactiveDays,
          cutoffDate,
          rooms: result.rows.map(r => ({ id: r.id, name: r.name }))
        });
      }

      return {
        archived: archivedCount,
        rooms: result.rows
      };
    } catch (error) {
      logger.error('Failed to archive inactive rooms:', error);
      throw error;
    }
  }

  // Get archived rooms
  async getArchivedRooms() {
    try {
      const result = await pool.query(
        `SELECT id, room_id, name, type, created_by, members, last_activity, archived_at
         FROM matrix_chat_rooms
         WHERE is_archived = true
         ORDER BY archived_at DESC`
      );

      return result.rows.map(row => ({
        id: row.id,
        roomId: row.room_id,
        name: row.name,
        type: row.type,
        createdBy: row.created_by,
        members: row.members || [],
        lastActivity: row.last_activity,
        archivedAt: row.archived_at
      }));
    } catch (error) {
      logger.error('Failed to get archived rooms:', error);
      throw error;
    }
  }

  // Unarchive a room
  async unarchiveRoom(roomId) {
    try {
      await pool.query(
        `UPDATE matrix_chat_rooms
         SET is_archived = false, archived_at = NULL, last_activity = NOW(), updated_at = NOW()
         WHERE room_id = $1`,
        [roomId]
      );

      logger.info('Room unarchived', { roomId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to unarchive room:', error);
      throw error;
    }
  }

  // Format messages as CSV
  formatMessagesAsCSV(messages) {
    const headers = [
      'Event ID',
      'Timestamp',
      'Formatted Time',
      'Room ID',
      'Room Name',
      'Room Type',
      'Sender ID',
      'Sender Name',
      'Message Type',
      'Content'
    ];

    const rows = messages.map(msg => [
      msg.eventId || '',
      msg.timestamp || '',
      msg.formattedTime || new Date(msg.timestamp || 0).toISOString(),
      msg.roomId || '',
      (msg.roomName || '').replace(/"/g, '""'), // Escape quotes
      msg.roomType || '',
      msg.sender || '',
      (msg.senderName || '').replace(/"/g, '""'), // Escape quotes
      msg.messageType || '',
      (msg.content || '').replace(/"/g, '""') // Escape quotes
    ]);

    // Convert to CSV format
    const csvRows = [
      headers.map(h => `"${h}"`).join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ];

    return csvRows.join('\n');
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

  /**
   * Create a Matrix client for a specific homeserver
   */
  async getHomeserverClient(homeserver) {
    try {
      // Check if we already have a client for this homeserver
      if (this.homeserverClients.has(homeserver.id)) {
        return this.homeserverClients.get(homeserver.id);
      }

      // For now, if it's the default homeserver, use the main client
      if (homeserver.baseUrl === this.config.baseUrl && this.client) {
        this.homeserverClients.set(homeserver.id, this.client);
        return this.client;
      }

      // Create a new client for this homeserver
      // Note: This requires proper authentication tokens for each homeserver
      // For now, we'll use the default client and rely on federation
      logger.warn(`Creating room on homeserver ${homeserver.serverName} via federation`);
      
      // Use default client - federation will handle cross-homeserver access
      if (this.client) {
        this.homeserverClients.set(homeserver.id, this.client);
        return this.client;
      }

      throw new Error('No Matrix client available');
    } catch (error) {
      logger.error('Failed to get homeserver client:', error);
      throw error;
    }
  }

  async createGroupRoom(groupId, groupData, options = {}) {
    try {
      let homeserver = null;
      let homeserverId = null;
      let participantIds = groupData.participants || groupData.members || [];

      // Use orchestrator to select homeserver if available
      try {
        const orchestratorService = getOrchestratorService();
        if (orchestratorService && orchestratorService.isInitialized && !options.homeserverId) {
          const decision = await orchestratorService.coordinateRoomCreation(
            { groupId, ...groupData },
            participantIds
          );
          homeserver = decision.homeserver;
          homeserverId = decision.homeserverId;
          logger.info('Orchestrator selected homeserver for room creation', {
            groupId,
            homeserverId: decision.homeserverId,
            region: decision.region,
            decision: decision.decision
          });
        } else if (options.homeserverId) {
          // Use specified homeserver
          homeserver = orchestratorService?.managedHomeservers.get(options.homeserverId);
          homeserverId = options.homeserverId;
        }
      } catch (error) {
        logger.warn('Orchestrator not available, using default client:', error.message);
      }

      // Get appropriate client (default or homeserver-specific)
      const client = homeserver 
        ? await this.getHomeserverClient(homeserver)
        : this.client;

      if (!client) {
        throw new Error('Matrix client not initialized');
      }

      const roomName = `Trading Group: ${groupData.name}`;
      const roomTopic = groupData.description || `Communication room for ${groupData.name} trading group`;
      
      const response = await client.createRoom({
        name: roomName,
        topic: roomTopic,
        preset: 'private_chat',
        invite: groupData.members || [],
        is_direct: false,
        room_version: '6'
      });

      const roomId = response.room_id;
      this.roomMappings.set(groupId, roomId);
      
      // Store room assignment in database
      if (homeserverId) {
        try {
          await pool.query(
            `INSERT INTO matrix_room_assignments (room_id, homeserver_id, region, created_at, updated_at)
             VALUES ($1, $2, $3, NOW(), NOW())
             ON CONFLICT (room_id) DO UPDATE SET
               homeserver_id = EXCLUDED.homeserver_id,
               region = EXCLUDED.region,
               updated_at = NOW()`,
            [roomId, homeserverId, homeserver?.region || 'US']
          );

          // Track participants
          const orchestratorService = getOrchestratorService();
          if (orchestratorService && orchestratorService.isInitialized) {
            for (const participantId of participantIds) {
              await orchestratorService.trackParticipant(roomId, participantId, homeserverId);
            }
          }
        } catch (error) {
          logger.warn('Failed to store room assignment:', error.message);
          // Don't fail room creation if assignment storage fails
        }
      }
      
      logger.info('Matrix room created for group', {
        groupId,
        roomId,
        roomName,
        homeserverId: homeserverId || 'default',
        region: homeserver?.region || 'unknown',
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

  async leaveRoom(roomId, userId = null) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      await this.client.leave(roomId);
      
      // Remove participant tracking if userId provided
      if (userId) {
        await pool.query(
          `DELETE FROM matrix_room_participants WHERE room_id = $1 AND user_id = $2`,
          [roomId, userId]
        );
        
        // Remove from in-memory tracking
        const orchestratorService = getOrchestratorService();
        const participants = orchestratorService.participantTracking.get(roomId);
        if (participants) {
          const participantArray = Array.from(participants);
          const toRemove = participantArray.find(p => p.userId === userId);
          if (toRemove) {
            participants.delete(toRemove);
          }
        }
        
        // Emit real-time update
        if (this.io) {
          this.io.to(`room:${roomId}`).emit('participant-left', {
            roomId,
            userId,
            timestamp: new Date()
          });
        }
      }
      
      logger.info('Left Matrix room', { roomId, userId });
    } catch (error) {
      logger.error('Failed to leave Matrix room:', error);
      throw error;
    }
  }

  async sendMessage(roomId, message, messageType = 'm.text', content = null) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      const messageContent = content || {
        msgtype: messageType,
        body: message
      };
      
      const response = await this.client.sendMessage(roomId, messageContent);
      
      // Update room activity when message is sent
      this.updateRoomActivity(roomId).catch(err => {
        // Silently fail - this is non-critical
        logger.debug('Failed to update room activity:', err);
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

  // Upload file and send as message
  async uploadFile(roomId, fileBuffer, fileName, mimeType, messageText = '') {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      // Upload file to Matrix media repository
      const uploadResponse = await this.client.uploadContent(fileBuffer, {
        name: fileName,
        type: mimeType
      });

      const mxcUri = uploadResponse.content_uri;
      
      // Determine message type based on mime type
      let msgtype = 'm.file';
      if (mimeType.startsWith('image/')) {
        msgtype = 'm.image';
      } else if (mimeType.startsWith('video/')) {
        msgtype = 'm.video';
      } else if (mimeType.startsWith('audio/')) {
        msgtype = 'm.audio';
      }

      // Get file size
      const fileSize = fileBuffer.length;

      // Send message with file attachment
      const content = {
        msgtype: msgtype,
        body: messageText || fileName,
        url: mxcUri,
        info: {
          size: fileSize,
          mimetype: mimeType,
          ...(msgtype === 'm.image' && {
            // For images, we could add width/height if available
          })
        }
      };

      const response = await this.client.sendMessage(roomId, content);
      
      // Update room activity
      this.updateRoomActivity(roomId).catch(err => {
        logger.debug('Failed to update room activity:', err);
      });

      logger.info('Matrix file uploaded and sent', {
        roomId,
        messageId: response.event_id,
        fileName,
        mimeType,
        size: fileSize
      });

      return {
        eventId: response.event_id,
        mxcUri,
        fileName,
        mimeType,
        size: fileSize
      };
    } catch (error) {
      logger.error('Failed to upload file to Matrix:', error);
      throw error;
    }
  }

  // Send typing indicator
  async sendTyping(roomId, userId, isTyping = true, timeout = 30000) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      await this.client.sendTyping(roomId, isTyping, timeout);
      
      // Emit typing event via Socket.IO
      if (this.io) {
        this.io.emit('matrix-typing', {
          roomId,
          userId,
          isTyping,
          timestamp: Date.now()
        });
      }
      
      logger.debug('Matrix typing indicator sent', { roomId, userId, isTyping });
    } catch (error) {
      logger.error('Failed to send typing indicator:', error);
      throw error;
    }
  }

  // Edit message
  async editMessage(roomId, eventId, newContent) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      // Get original event
      const event = await this.client.fetchRoomEvent(roomId, eventId);
      const originalContent = event.content;

      // Create new content with m.replace relation
      const content = {
        'm.new_content': {
          msgtype: originalContent.msgtype || 'm.text',
          body: newContent
        },
        'm.relates_to': {
          rel_type: 'm.replace',
          event_id: eventId
        },
        body: `* ${newContent}` // Fallback for clients that don't support editing
      };

      const response = await this.client.sendEvent(roomId, 'm.room.message', content);
      
      // Update room activity
      this.updateRoomActivity(roomId).catch(err => {
        logger.debug('Failed to update room activity:', err);
      });

      logger.info('Matrix message edited', {
        roomId,
        originalEventId: eventId,
        newEventId: response.event_id
      });

      return response.event_id;
    } catch (error) {
      logger.error('Failed to edit Matrix message:', error);
      throw error;
    }
  }

  // Delete/redact message
  async deleteMessage(roomId, eventId, reason = '') {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      await this.client.redactEvent(roomId, eventId, reason);
      
      logger.info('Matrix message deleted', {
        roomId,
        eventId,
        reason
      });

      return true;
    } catch (error) {
      logger.error('Failed to delete Matrix message:', error);
      throw error;
    }
  }

  // Add reaction to message
  async addReaction(roomId, eventId, key) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      const content = {
        'm.relates_to': {
          rel_type: 'm.annotation',
          event_id: eventId,
          key: key // Emoji or reaction key
        }
      };

      const response = await this.client.sendEvent(roomId, 'm.reaction', content);
      
      logger.info('Matrix reaction added', {
        roomId,
        eventId,
        reactionKey: key,
        reactionEventId: response.event_id
      });

      return response.event_id;
    } catch (error) {
      logger.error('Failed to add Matrix reaction:', error);
      throw error;
    }
  }

  // Remove reaction from message
  async removeReaction(roomId, eventId, reactionEventId) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      // Redact the reaction event
      await this.client.redactEvent(roomId, reactionEventId);
      
      logger.info('Matrix reaction removed', {
        roomId,
        eventId,
        reactionEventId
      });

      return true;
    } catch (error) {
      logger.error('Failed to remove Matrix reaction:', error);
      throw error;
    }
  }

  // Search messages in room
  async searchMessages(roomId, searchTerm, limit = 50) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      // Matrix search API
      const searchResponse = await this.client.search({
        room_events: {
          rooms: [roomId],
          search_term: searchTerm,
          filter: {
            limit: limit
          }
        }
      });

      const results = searchResponse.room_events?.results || [];
      
      logger.info('Matrix messages searched', {
        roomId,
        searchTerm,
        resultCount: results.length
      });

      return results;
    } catch (error) {
      logger.error('Failed to search Matrix messages:', error);
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

  async getRoomMessages(roomId, limit = null, fromToken = null) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      const room = this.client.getRoom(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      // Use Map to deduplicate messages by eventId
      const messageMap = new Map();

      // First, get messages from room timeline (already synced)
      const timeline = room.timeline || [];
      timeline.forEach(event => {
        const eventType = event.getType();
        if (eventType === 'm.room.message') {
          const eventId = event.getId();
          const content = event.getContent();
          const sender = event.getSender();
          const timestamp = event.getTs();
          
          // Get sender display name
          const senderMember = room.getMember(sender);
          const senderName = senderMember?.name || sender;

          messageMap.set(eventId, {
            eventId,
            sender: sender,
            senderName: senderName,
            content: content.body || '',
            messageType: content.msgtype || 'm.text',
            timestamp: timestamp,
            formattedTime: new Date(timestamp).toISOString()
          });
        }
      });

      // Then, fetch ALL additional messages via Matrix HTTP API pagination
      // This ensures we get all historical messages not yet in timeline
      try {
        let paginationToken = fromToken || null;
        let hasMore = true;
        let fetchCount = 0;
        const maxFetches = 100; // Safety limit: max 100 API calls (10,000 messages at 100 per call)

        // Fetch messages via HTTP API with pagination until all are retrieved
        while (hasMore && fetchCount < maxFetches) {
          const params = {
            dir: 'b', // backward to get older messages
            limit: 100 // Fetch in batches of 100
          };
          
          if (paginationToken) {
            params.from = paginationToken;
          }

          // Use Matrix HTTP API directly
          const response = await this.client._http.authedRequest(
            undefined,
            'GET',
            `/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/messages`,
            params
          );
          
          fetchCount++;
          
          if (response.chunk && Array.isArray(response.chunk)) {
            let addedCount = 0;
            response.chunk.forEach(event => {
              if (event.type === 'm.room.message') {
                const eventId = event.event_id;
                const content = event.content || {};
                const sender = event.sender;
                const timestamp = event.origin_server_ts || Date.now();
                
                // Only add if not already in map (deduplication/reconciliation)
                if (!messageMap.has(eventId)) {
                  // Try to get sender display name from room
                  const senderMember = room.getMember(sender);
                  const senderName = senderMember?.name || sender;

                  messageMap.set(eventId, {
                    eventId,
                    sender: sender,
                    senderName: senderName,
                    content: content.body || '',
                    messageType: content.msgtype || 'm.text',
                    timestamp: timestamp,
                    formattedTime: new Date(timestamp).toISOString()
                  });
                  addedCount++;
                }
              }
            });
            
            logger.debug(`Fetched batch ${fetchCount}: ${response.chunk.length} events, ${addedCount} new messages added`);
          }

          // Check if there are more messages to fetch
          paginationToken = response.end;
          hasMore = paginationToken && response.chunk && response.chunk.length > 0;
        }
        
        if (fetchCount >= maxFetches) {
          logger.warn('Reached maximum fetch limit, may not have all messages', {
            roomId,
            totalMessages: messageMap.size
          });
        }
      } catch (apiError) {
        // If API pagination fails, we still have timeline messages
        logger.warn('Failed to fetch additional messages via API, using timeline only', {
          roomId,
          error: apiError.message
        });
      }

      // Convert map to array and sort by timestamp
      const messages = Array.from(messageMap.values())
        .sort((a, b) => a.timestamp - b.timestamp); // Oldest first

      logger.info('Fetched Matrix room messages', {
        roomId,
        messageCount: messages.length,
        fromTimeline: timeline.length,
        fromAPI: messages.length - timeline.length
      });

      return {
        messages: messages,
        roomId: roomId,
        roomName: room.name || 'Unnamed Room',
        totalCount: messages.length
      };
    } catch (error) {
      logger.error('Failed to get Matrix room messages:', error);
      throw error;
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

  // Get or create a direct message room between two users
  async getOrCreateDirectRoom(userId1, userId2, user1MatrixId, user2MatrixId) {
    if (!this.client) {
      throw new Error('Matrix client not initialized');
    }

    try {
      // Create a consistent key for the direct room (sorted user IDs)
      const roomKey = [userId1, userId2].sort().join('_');
      
      // Check if room already exists in mappings
      const existingRoomId = this.roomMappings.get(`direct_${roomKey}`);
      if (existingRoomId) {
        // Verify room still exists
        try {
          const room = this.client.getRoom(existingRoomId);
          if (room) {
            return existingRoomId;
          }
        } catch (error) {
          // Room doesn't exist, remove from mapping
          this.roomMappings.delete(`direct_${roomKey}`);
        }
      }

      // Check if a direct room already exists between these users
      // Matrix stores direct rooms in account data, but we can also check existing rooms
      try {
        const accountData = this.client.getAccountData('m.direct');
        const directRooms = accountData?.getContent() || {};
        
        // Check if there's already a direct room with user2
        for (const [roomId, userIds] of Object.entries(directRooms)) {
          if (Array.isArray(userIds) && userIds.includes(user2MatrixId)) {
            // Verify room exists and is direct
            const room = this.client.getRoom(roomId);
            if (room && room.isDirect) {
              this.roomMappings.set(`direct_${roomKey}`, roomId);
              return roomId;
            }
          }
        }
      } catch (error) {
        // Account data might not be available, continue to create new room
        logger.debug('Could not check account data for direct rooms:', error);
      }
      
      // Also check existing rooms for direct rooms with this user
      const rooms = this.client.getRooms();
      for (const room of rooms) {
        if (room.isDirect && room.getMembers().some(member => member.userId === user2MatrixId)) {
          // Found existing direct room
          this.roomMappings.set(`direct_${roomKey}`, room.roomId);
          return room.roomId;
        }
      }

      // Create new direct room
      const response = await this.client.createRoom({
        preset: 'trusted_private_chat',
        is_direct: true,
        invite: [user2MatrixId],
        visibility: 'private',
        room_version: '6'
      });

      const roomId = response.room_id;
      this.roomMappings.set(`direct_${roomKey}`, roomId);

      // Set room name (optional, but helpful)
      try {
        await this.client.setRoomName(roomId, `Direct message: ${user1MatrixId} & ${user2MatrixId}`);
      } catch (error) {
        // Ignore if setting name fails
        logger.warn('Failed to set direct room name:', error);
      }

      logger.info('Direct Matrix room created', {
        roomId,
        user1: userId1,
        user2: userId2,
        user1MatrixId,
        user2MatrixId
      });

      return roomId;
    } catch (error) {
      logger.error('Failed to get/create direct Matrix room:', error);
      throw error;
    }
  }

  // Get Matrix user ID from regular user ID
  async getMatrixUserId(userId) {
    // Try to get from user mappings first
    if (this.userMappings.has(userId)) {
      return this.userMappings.get(userId);
    }

    // If not in cache, try to construct it from server name
    // Format: @username:server.name
    const { getUserById } = require('./databaseService');
    try {
      const user = await getUserById(userId);
      if (user?.matrixUserId) {
        this.userMappings.set(userId, user.matrixUserId);
        return user.matrixUserId;
      }
      
      // Construct Matrix user ID from username and server name
      if (user?.username && this.config.serverName) {
        const matrixUserId = `@${user.username}:${this.config.serverName}`;
        this.userMappings.set(userId, matrixUserId);
        return matrixUserId;
      }
    } catch (error) {
      logger.warn(`Failed to get Matrix user ID for ${userId}:`, error);
    }

    return null;
  }

  // Get regular user ID from Matrix user ID
  async getUserIdFromMatrixId(matrixUserId) {
    // Check reverse mapping cache
    for (const [userId, mappedMatrixId] of this.userMappings.entries()) {
      if (mappedMatrixId === matrixUserId) {
        return userId;
      }
    }

    // Extract username from Matrix user ID (format: @username:server.name)
    const match = matrixUserId.match(/^@([^:]+):(.+)$/);
    if (!match) {
      logger.warn('Invalid Matrix user ID format', { matrixUserId });
      return null;
    }

    const [, username, serverName] = match;

    // Query database for user by username
    try {
      const result = await pool.query(
        `SELECT id, username, matrix_user_id FROM users WHERE username = $1 OR matrix_user_id = $2`,
        [username, matrixUserId]
      );

      if (result.rows.length > 0) {
        const user = result.rows[0];
        // Cache the mapping
        if (user.matrix_user_id) {
          this.userMappings.set(user.id, user.matrix_user_id);
        } else {
          // Construct and cache
          const constructedMatrixId = `@${user.username}:${serverName}`;
          this.userMappings.set(user.id, constructedMatrixId);
        }
        return user.id;
      }
    } catch (error) {
      logger.error('Failed to get user ID from Matrix user ID:', error);
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