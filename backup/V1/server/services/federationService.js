const WebSocket = require('ws');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { groupService } = require('./groupService');
const { audioRoutingService } = require('./audioRoutingService');
const { matrixService } = require('./matrixService');

class FederationService {
  constructor() {
    this.config = {
      enabled: process.env.FEDERATION_ENABLED === 'true',
      serverId: process.env.SERVER_ID || 'intercom-server-01',
      serverName: process.env.SERVER_NAME || 'Trading Intercom Server',
      serverUrl: process.env.SERVER_URL || 'ws://localhost:3001',
      federationSecret: process.env.FEDERATION_SECRET || 'federation-secret-key',
      maxConnections: parseInt(process.env.FEDERATION_MAX_CONNECTIONS) || 10,
      heartbeatInterval: parseInt(process.env.FEDERATION_HEARTBEAT_INTERVAL) || 30000, // 30 seconds
      reconnectInterval: parseInt(process.env.FEDERATION_RECONNECT_INTERVAL) || 5000, // 5 seconds
      maxReconnectAttempts: parseInt(process.env.FEDERATION_MAX_RECONNECT_ATTEMPTS) || 5,
      encryptionEnabled: process.env.FEDERATION_ENCRYPTION_ENABLED === 'true',
      compressionEnabled: process.env.FEDERATION_COMPRESSION_ENABLED === 'true'
    };
    
    this.connections = new Map(); // Map<serverId, connection>
    this.connectionAttempts = new Map(); // Map<serverId, attemptCount>
    this.heartbeatTimers = new Map(); // Map<serverId, timer>
    this.messageQueue = new Map(); // Map<serverId, messages[]>
    this.federationPeers = new Map(); // Map<serverId, peerInfo>
    this.isRunning = false;
    
    this.initialize();
  }

  async initialize() {
    if (!this.config.enabled) {
      logger.warn('Federation service is disabled');
      return;
    }

    try {
      // Load federation peers from configuration
      await this.loadFederationPeers();
      
      // Start federation server
      await this.startFederationServer();
      
      // Connect to known peers
      await this.connectToPeers();
      
      this.isRunning = true;
      logger.info('Federation service initialized');
    } catch (error) {
      logger.error('Failed to initialize federation service:', error);
      throw error;
    }
  }

  async loadFederationPeers() {
    try {
      // Load peers from environment or configuration file
      const peersConfig = process.env.FEDERATION_PEERS || '[]';
      const peers = JSON.parse(peersConfig);
      
      for (const peer of peers) {
        this.federationPeers.set(peer.serverId, {
          serverId: peer.serverId,
          serverName: peer.serverName,
          serverUrl: peer.serverUrl,
          publicKey: peer.publicKey,
          isActive: peer.isActive || true,
          lastSeen: null,
          connectionStatus: 'disconnected'
        });
      }
      
      logger.info(`Loaded ${this.federationPeers.size} federation peers`);
    } catch (error) {
      logger.error('Failed to load federation peers:', error);
      throw error;
    }
  }

  async startFederationServer() {
    try {
      const server = new WebSocket.Server({
        port: parseInt(process.env.FEDERATION_PORT) || 3002,
        path: '/federation'
      });

      server.on('connection', (ws, req) => {
        this.handleIncomingConnection(ws, req);
      });

      server.on('error', (error) => {
        logger.error('Federation server error:', error);
      });

      logger.info(`Federation server started on port ${process.env.FEDERATION_PORT || 3002}`);
    } catch (error) {
      logger.error('Failed to start federation server:', error);
      throw error;
    }
  }

  async connectToPeers() {
    for (const [serverId, peer] of this.federationPeers) {
      if (peer.isActive && peer.connectionStatus === 'disconnected') {
        await this.connectToPeer(serverId, peer);
      }
    }
  }

  async connectToPeer(serverId, peer) {
    try {
      const ws = new WebSocket(peer.serverUrl + '/federation');
      
      ws.on('open', () => {
        logger.info(`Connected to federation peer: ${serverId}`);
        this.connections.set(serverId, ws);
        this.federationPeers.get(serverId).connectionStatus = 'connected';
        this.federationPeers.get(serverId).lastSeen = new Date();
        
        // Send authentication
        this.authenticateConnection(serverId, ws);
        
        // Start heartbeat
        this.startHeartbeat(serverId);
        
        // Process queued messages
        this.processQueuedMessages(serverId);
      });

      ws.on('message', (data) => {
        this.handleFederationMessage(serverId, data);
      });

      ws.on('close', () => {
        logger.warn(`Federation peer disconnected: ${serverId}`);
        this.connections.delete(serverId);
        this.federationPeers.get(serverId).connectionStatus = 'disconnected';
        this.stopHeartbeat(serverId);
        
        // Attempt reconnection
        this.scheduleReconnection(serverId);
      });

      ws.on('error', (error) => {
        logger.error(`Federation peer error (${serverId}):`, error);
        this.connections.delete(serverId);
        this.federationPeers.get(serverId).connectionStatus = 'error';
        this.stopHeartbeat(serverId);
      });

    } catch (error) {
      logger.error(`Failed to connect to peer ${serverId}:`, error);
      this.scheduleReconnection(serverId);
    }
  }

  async authenticateConnection(serverId, ws) {
    try {
      const authToken = jwt.sign({
        serverId: this.config.serverId,
        serverName: this.config.serverName,
        timestamp: Date.now()
      }, this.config.federationSecret, { expiresIn: '1h' });

      const authMessage = {
        type: 'auth',
        serverId: this.config.serverId,
        serverName: this.config.serverName,
        authToken,
        capabilities: this.getServerCapabilities()
      };

      ws.send(JSON.stringify(authMessage));
    } catch (error) {
      logger.error(`Failed to authenticate with peer ${serverId}:`, error);
    }
  }

  getServerCapabilities() {
    return {
      audioRouting: true,
      groupManagement: true,
      userManagement: true,
      recording: true,
      matrixIntegration: true,
      sipIntegration: true,
      encryption: this.config.encryptionEnabled,
      compression: this.config.compressionEnabled,
      maxConnections: this.config.maxConnections
    };
  }

  async handleIncomingConnection(ws, req) {
    try {
      const clientIP = req.socket.remoteAddress;
      logger.info(`Incoming federation connection from ${clientIP}`);

      ws.on('message', (data) => {
        this.handleIncomingMessage(ws, data);
      });

      ws.on('close', () => {
        logger.info(`Federation connection closed from ${clientIP}`);
      });

      ws.on('error', (error) => {
        logger.error(`Federation connection error from ${clientIP}:`, error);
      });

    } catch (error) {
      logger.error('Failed to handle incoming connection:', error);
    }
  }

  async handleIncomingMessage(ws, data) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'auth':
          await this.handleAuthMessage(ws, message);
          break;
        case 'heartbeat':
          await this.handleHeartbeatMessage(ws, message);
          break;
        case 'group_sync':
          await this.handleGroupSyncMessage(ws, message);
          break;
        case 'user_sync':
          await this.handleUserSyncMessage(ws, message);
          break;
        case 'audio_route':
          await this.handleAudioRouteMessage(ws, message);
          break;
        case 'recording_sync':
          await this.handleRecordingSyncMessage(ws, message);
          break;
        case 'matrix_sync':
          await this.handleMatrixSyncMessage(ws, message);
          break;
        default:
          logger.warn(`Unknown federation message type: ${message.type}`);
      }
    } catch (error) {
      logger.error('Failed to handle incoming message:', error);
    }
  }

  async handleAuthMessage(ws, message) {
    try {
      // Verify authentication token
      const decoded = jwt.verify(message.authToken, this.config.federationSecret);
      
      if (decoded.serverId === this.config.serverId) {
        throw new Error('Cannot connect to self');
      }

      // Store connection info
      const serverId = decoded.serverId;
      this.connections.set(serverId, ws);
      this.federationPeers.set(serverId, {
        serverId: decoded.serverId,
        serverName: decoded.serverName,
        serverUrl: message.serverUrl,
        publicKey: message.publicKey,
        isActive: true,
        lastSeen: new Date(),
        connectionStatus: 'connected',
        capabilities: message.capabilities
      });

      // Send authentication response
      const response = {
        type: 'auth_response',
        serverId: this.config.serverId,
        serverName: this.config.serverName,
        status: 'authenticated',
        capabilities: this.getServerCapabilities()
      };

      ws.send(JSON.stringify(response));
      
      logger.info(`Federation peer authenticated: ${serverId}`);
    } catch (error) {
      logger.error('Failed to handle auth message:', error);
      
      const response = {
        type: 'auth_response',
        status: 'failed',
        error: error.message
      };
      
      ws.send(JSON.stringify(response));
    }
  }

  async handleHeartbeatMessage(ws, message) {
    try {
      const response = {
        type: 'heartbeat_response',
        timestamp: Date.now(),
        serverId: this.config.serverId
      };
      
      ws.send(JSON.stringify(response));
    } catch (error) {
      logger.error('Failed to handle heartbeat message:', error);
    }
  }

  async handleGroupSyncMessage(ws, message) {
    try {
      const { groupId, action, groupData } = message;
      
      switch (action) {
        case 'create':
          await groupService.createGroup(groupData);
          break;
        case 'update':
          await groupService.updateGroup(groupId, groupData);
          break;
        case 'delete':
          await groupService.deleteGroup(groupId);
          break;
        case 'join':
          await groupService.joinGroup(groupId, message.userId, message.userData);
          break;
        case 'leave':
          await groupService.leaveGroup(groupId, message.userId);
          break;
      }
      
      logger.info(`Group sync processed: ${action} for group ${groupId}`);
    } catch (error) {
      logger.error('Failed to handle group sync message:', error);
    }
  }

  async handleUserSyncMessage(ws, message) {
    try {
      const { userId, action, userData } = message;
      
      switch (action) {
        case 'create':
          // Handle user creation
          break;
        case 'update':
          // Handle user update
          break;
        case 'delete':
          // Handle user deletion
          break;
      }
      
      logger.info(`User sync processed: ${action} for user ${userId}`);
    } catch (error) {
      logger.error('Failed to handle user sync message:', error);
    }
  }

  async handleAudioRouteMessage(ws, message) {
    try {
      const { routeId, action, routeData } = message;
      
      switch (action) {
        case 'create':
          await audioRoutingService.createRoute(routeData);
          break;
        case 'update':
          await audioRoutingService.updateRoute(routeId, routeData);
          break;
        case 'delete':
          await audioRoutingService.deleteRoute(routeId);
          break;
      }
      
      logger.info(`Audio route sync processed: ${action} for route ${routeId}`);
    } catch (error) {
      logger.error('Failed to handle audio route message:', error);
    }
  }

  async handleRecordingSyncMessage(ws, message) {
    try {
      const { recordingId, action, recordingData } = message;
      
      switch (action) {
        case 'create':
          // Handle recording creation
          break;
        case 'update':
          // Handle recording update
          break;
        case 'delete':
          // Handle recording deletion
          break;
      }
      
      logger.info(`Recording sync processed: ${action} for recording ${recordingId}`);
    } catch (error) {
      logger.error('Failed to handle recording sync message:', error);
    }
  }

  async handleMatrixSyncMessage(ws, message) {
    try {
      const { roomId, action, roomData } = message;
      
      switch (action) {
        case 'create':
          await matrixService.createGroupRoom(roomData.groupId, roomData);
          break;
        case 'update':
          await matrixService.syncGroupWithMatrix(roomData.groupId);
          break;
        case 'delete':
          await matrixService.leaveRoom(roomId);
          break;
      }
      
      logger.info(`Matrix sync processed: ${action} for room ${roomId}`);
    } catch (error) {
      logger.error('Failed to handle matrix sync message:', error);
    }
  }

  async handleFederationMessage(serverId, data) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'auth_response':
          if (message.status === 'authenticated') {
            logger.info(`Federation peer authenticated: ${serverId}`);
            this.startHeartbeat(serverId);
          } else {
            logger.error(`Federation authentication failed: ${message.error}`);
          }
          break;
        case 'heartbeat_response':
          this.federationPeers.get(serverId).lastSeen = new Date();
          break;
        default:
          logger.warn(`Unknown federation message type: ${message.type}`);
      }
    } catch (error) {
      logger.error('Failed to handle federation message:', error);
    }
  }

  // Send message to federation peer
  async sendToPeer(serverId, message) {
    try {
      const connection = this.connections.get(serverId);
      if (!connection || connection.readyState !== WebSocket.OPEN) {
        // Queue message for later delivery
        if (!this.messageQueue.has(serverId)) {
          this.messageQueue.set(serverId, []);
        }
        this.messageQueue.get(serverId).push(message);
        return false;
      }

      connection.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error(`Failed to send message to peer ${serverId}:`, error);
      return false;
    }
  }

  // Broadcast message to all connected peers
  async broadcastToPeers(message) {
    const results = [];
    
    for (const [serverId, connection] of this.connections) {
      if (connection.readyState === WebSocket.OPEN) {
        try {
          connection.send(JSON.stringify(message));
          results.push({ serverId, success: true });
        } catch (error) {
          logger.error(`Failed to broadcast to peer ${serverId}:`, error);
          results.push({ serverId, success: false, error: error.message });
        }
      }
    }
    
    return results;
  }

  // Process queued messages for a peer
  async processQueuedMessages(serverId) {
    const queuedMessages = this.messageQueue.get(serverId);
    if (!queuedMessages || queuedMessages.length === 0) {
      return;
    }

    const connection = this.connections.get(serverId);
    if (!connection || connection.readyState !== WebSocket.OPEN) {
      return;
    }

    for (const message of queuedMessages) {
      try {
        connection.send(JSON.stringify(message));
      } catch (error) {
        logger.error(`Failed to send queued message to peer ${serverId}:`, error);
      }
    }

    this.messageQueue.delete(serverId);
    logger.info(`Processed ${queuedMessages.length} queued messages for peer ${serverId}`);
  }

  // Start heartbeat for a peer
  startHeartbeat(serverId) {
    const timer = setInterval(() => {
      this.sendHeartbeat(serverId);
    }, this.config.heartbeatInterval);
    
    this.heartbeatTimers.set(serverId, timer);
  }

  // Stop heartbeat for a peer
  stopHeartbeat(serverId) {
    const timer = this.heartbeatTimers.get(serverId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(serverId);
    }
  }

  // Send heartbeat to a peer
  async sendHeartbeat(serverId) {
    const message = {
      type: 'heartbeat',
      timestamp: Date.now(),
      serverId: this.config.serverId
    };
    
    await this.sendToPeer(serverId, message);
  }

  // Schedule reconnection for a peer
  scheduleReconnection(serverId) {
    const attempts = this.connectionAttempts.get(serverId) || 0;
    
    if (attempts >= this.config.maxReconnectAttempts) {
      logger.error(`Max reconnection attempts reached for peer ${serverId}`);
      return;
    }
    
    this.connectionAttempts.set(serverId, attempts + 1);
    
    setTimeout(() => {
      const peer = this.federationPeers.get(serverId);
      if (peer && peer.isActive) {
        this.connectToPeer(serverId, peer);
      }
    }, this.config.reconnectInterval);
  }

  // Sync group with federation peers
  async syncGroup(groupId, action, groupData) {
    const message = {
      type: 'group_sync',
      groupId,
      action,
      groupData,
      timestamp: Date.now(),
      serverId: this.config.serverId
    };
    
    return await this.broadcastToPeers(message);
  }

  // Sync user with federation peers
  async syncUser(userId, action, userData) {
    const message = {
      type: 'user_sync',
      userId,
      action,
      userData,
      timestamp: Date.now(),
      serverId: this.config.serverId
    };
    
    return await this.broadcastToPeers(message);
  }

  // Sync audio route with federation peers
  async syncAudioRoute(routeId, action, routeData) {
    const message = {
      type: 'audio_route',
      routeId,
      action,
      routeData,
      timestamp: Date.now(),
      serverId: this.config.serverId
    };
    
    return await this.broadcastToPeers(message);
  }

  // Sync recording with federation peers
  async syncRecording(recordingId, action, recordingData) {
    const message = {
      type: 'recording_sync',
      recordingId,
      action,
      recordingData,
      timestamp: Date.now(),
      serverId: this.config.serverId
    };
    
    return await this.broadcastToPeers(message);
  }

  // Sync Matrix room with federation peers
  async syncMatrixRoom(roomId, action, roomData) {
    const message = {
      type: 'matrix_sync',
      roomId,
      action,
      roomData,
      timestamp: Date.now(),
      serverId: this.config.serverId
    };
    
    return await this.broadcastToPeers(message);
  }

  // Get federation status
  getStatus() {
    return {
      enabled: this.config.enabled,
      serverId: this.config.serverId,
      serverName: this.config.serverName,
      isRunning: this.isRunning,
      totalPeers: this.federationPeers.size,
      connectedPeers: this.connections.size,
      peers: Array.from(this.federationPeers.values()),
      connections: Array.from(this.connections.keys()),
      queuedMessages: Array.from(this.messageQueue.entries()).reduce((total, [_, messages]) => total + messages.length, 0)
    };
  }

  // Get peer information
  getPeerInfo(serverId) {
    return this.federationPeers.get(serverId);
  }

  // Add new federation peer
  async addPeer(peerInfo) {
    try {
      this.federationPeers.set(peerInfo.serverId, {
        ...peerInfo,
        isActive: true,
        lastSeen: null,
        connectionStatus: 'disconnected'
      });
      
      // Attempt connection
      await this.connectToPeer(peerInfo.serverId, peerInfo);
      
      logger.info(`Added federation peer: ${peerInfo.serverId}`);
      return true;
    } catch (error) {
      logger.error('Failed to add federation peer:', error);
      return false;
    }
  }

  // Remove federation peer
  async removePeer(serverId) {
    try {
      const connection = this.connections.get(serverId);
      if (connection) {
        connection.close();
        this.connections.delete(serverId);
      }
      
      this.stopHeartbeat(serverId);
      this.federationPeers.delete(serverId);
      this.messageQueue.delete(serverId);
      
      logger.info(`Removed federation peer: ${serverId}`);
      return true;
    } catch (error) {
      logger.error('Failed to remove federation peer:', error);
      return false;
    }
  }

  // Clean up resources
  async cleanup() {
    this.isRunning = false;
    
    // Close all connections
    for (const [serverId, connection] of this.connections) {
      try {
        connection.close();
      } catch (error) {
        logger.error(`Failed to close connection to peer ${serverId}:`, error);
      }
    }
    
    // Clear all timers
    for (const [serverId, timer] of this.heartbeatTimers) {
      clearInterval(timer);
    }
    
    this.connections.clear();
    this.connectionAttempts.clear();
    this.heartbeatTimers.clear();
    this.messageQueue.clear();
    this.federationPeers.clear();
    
    logger.info('Federation service cleaned up');
  }
}

// Initialize the service
const federationService = new FederationService();

// Initialize on startup
federationService.initialize().catch(error => {
  logger.error('Failed to initialize federation service:', error);
});

module.exports = {
  federationService,
  FederationService,
};
