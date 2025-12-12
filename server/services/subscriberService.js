const WebSocket = require('ws');
const { pool } = require('./databaseService');
const logger = require('../utils/logger');
const { getServerRole } = require('../utils/serverRole');

class SubscriberService {
  constructor() {
    this.connection = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectInterval = 5000; // 5 seconds
    this.heartbeatInterval = 30000; // 30 seconds
    this.publisherUrl = null;
    this.authToken = null;
    this.serverId = null;
    this.serverName = null;
    this.messageQueue = [];
    this.isInitialized = false;
    this.audioRoutingService = null; // Will be set by subscriber audio routing service
  }

  async initialize() {
    try {
      // Check if server is configured as subscriber
      const serverRole = await getServerRole();
      
      if (serverRole.role !== 'subscriber') {
        logger.info('Server is not configured as subscriber, skipping subscriber service initialization');
        return;
      }

      if (!serverRole.publisherUrl) {
        logger.warn('Subscriber mode enabled but publisher URL not configured');
        return;
      }

      this.publisherUrl = serverRole.publisherUrl;
      this.serverId = serverRole.serverId;
      this.serverName = serverRole.serverName;

      // Get auth token from subscribers table
      await this.loadAuthToken();

      if (!this.authToken) {
        logger.error('Subscriber auth token not found. Please configure subscriber in admin portal.');
        return;
      }

      logger.info(`Initializing subscriber service - Connecting to publisher at: ${this.publisherUrl}`);
      
      // Connect to publisher
      await this.connectToPublisher();
      
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize subscriber service:', error);
      throw error;
    }
  }

  async loadAuthToken() {
    try {
      if (!this.serverId) {
        const serverRole = await getServerRole();
        this.serverId = serverRole.serverId;
      }

      const result = await pool.query(
        `SELECT auth_token FROM subscribers WHERE server_id = $1 AND is_active = true`,
        [this.serverId]
      );

      if (result.rows.length > 0) {
        this.authToken = result.rows[0].auth_token;
        logger.info('Subscriber auth token loaded from database');
      } else {
        logger.warn(`No active subscriber record found for server ID: ${this.serverId}`);
      }
    } catch (error) {
      logger.error('Failed to load subscriber auth token:', error);
      throw error;
    }
  }

  async connectToPublisher() {
    try {
      if (this.connection && this.isConnected) {
        logger.warn('Already connected to publisher');
        return;
      }

      // Ensure we have the publisher URL
      if (!this.publisherUrl) {
        const serverRole = await getServerRole();
        this.publisherUrl = serverRole.publisherUrl;
        
        if (!this.publisherUrl) {
          throw new Error('Publisher URL not configured');
        }
      }

      // Ensure we have auth token
      if (!this.authToken) {
        await this.loadAuthToken();
        if (!this.authToken) {
          throw new Error('Subscriber auth token not found');
        }
      }

      logger.info(`Connecting to publisher at: ${this.publisherUrl}`);

      // Ensure URL has proper protocol and path
      let wsUrl = this.publisherUrl;
      if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
        // If no protocol specified, default to wss:// for HTTPS or ws:// for HTTP
        wsUrl = (this.publisherUrl.includes('https://') || this.publisherUrl.includes(':443')) 
          ? `wss://${wsUrl.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '')}`
          : `ws://${wsUrl.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '')}`;
      }
      
      // Add /subscriber path if not present
      if (!wsUrl.includes('/subscriber')) {
        wsUrl = wsUrl.replace(/\/$/, '') + '/subscriber';
      }

      logger.info(`Connecting to publisher WebSocket: ${wsUrl}`);

      // Create WebSocket connection
      const ws = new WebSocket(wsUrl, {
        headers: {
          'X-Subscriber-Server-Id': this.serverId,
          'X-Subscriber-Auth-Token': this.authToken
        }
      });

      ws.on('open', () => {
        logger.info('Connected to publisher server');
        this.connection = ws;
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Send authentication message
        this.authenticate();
        
        // Start heartbeat
        this.startHeartbeat();
        
        // Process queued messages
        this.processQueuedMessages();
        
        // Update subscriber status in database
        this.updateConnectionStatus('connected');
      });

      ws.on('message', (data) => {
        this.handleMessage(data);
      });

      ws.on('close', (code, reason) => {
        logger.warn(`Disconnected from publisher: ${code} - ${reason || 'No reason'}`);
        this.handleDisconnection();
      });

      ws.on('error', (error) => {
        logger.error('Publisher connection error:', error);
        this.handleDisconnection();
      });

      ws.on('ping', () => {
        ws.pong();
      });

    } catch (error) {
      logger.error('Failed to connect to publisher:', error);
      this.handleDisconnection();
    }
  }

  authenticate() {
    if (!this.connection || !this.isConnected) {
      return;
    }

    try {
      const authMessage = {
        type: 'subscriber-auth',
        serverId: this.serverId,
        serverName: this.serverName,
        authToken: this.authToken,
        timestamp: Date.now()
      };

      this.connection.send(JSON.stringify(authMessage));
      logger.info('Sent authentication to publisher');
    } catch (error) {
      logger.error('Failed to send authentication:', error);
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.connection && this.isConnected) {
        try {
          const heartbeat = {
            type: 'heartbeat',
            serverId: this.serverId,
            timestamp: Date.now()
          };
          this.connection.send(JSON.stringify(heartbeat));
        } catch (error) {
          logger.error('Failed to send heartbeat:', error);
        }
      }
    }, this.heartbeatInterval);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'auth-response':
          if (message.success) {
            logger.info('Successfully authenticated with publisher');
            this.updateConnectionStatus('connected');
          } else {
            logger.error(`Authentication failed: ${message.error}`);
            this.handleDisconnection();
          }
          break;
        
        case 'heartbeat-response':
          // Heartbeat acknowledged
          break;
        
        case 'group-call-audio':
          this.handleGroupCallAudio(message);
          break;
        
        case 'broadcast-audio':
          this.handleBroadcastAudio(message);
          break;
        
        case 'group-call-update':
          this.handleGroupCallUpdate(message);
          break;
        
        case 'error':
          logger.error(`Publisher error: ${message.message}`);
          break;
        
        default:
          logger.warn(`Unknown message type from publisher: ${message.type}`);
      }
    } catch (error) {
      logger.error('Failed to handle message from publisher:', error);
    }
  }

  handleGroupCallAudio(message) {
    // Route audio to local users in the group call via audio routing service
    if (this.audioRoutingService) {
      this.audioRoutingService.handleGroupCallAudioFromPublisher(message);
    } else {
      logger.debug(`Received group call audio for group: ${message.groupId} (audio routing service not available)`);
    }
  }

  handleBroadcastAudio(message) {
    // Route broadcast audio to local listeners via audio routing service
    if (this.audioRoutingService) {
      this.audioRoutingService.handleBroadcastAudioFromPublisher(message);
    } else {
      logger.debug(`Received broadcast audio for broadcast: ${message.broadcastId} (audio routing service not available)`);
    }
  }

  handleGroupCallUpdate(message) {
    // Handle group call state updates (participants joining/leaving)
    if (this.audioRoutingService) {
      this.audioRoutingService.handleGroupCallUpdateFromPublisher(message);
    } else {
      logger.debug(`Group call update: ${message.groupId} - ${message.event} (audio routing service not available)`);
    }
  }

  setAudioRoutingService(audioRoutingService) {
    this.audioRoutingService = audioRoutingService;
  }

  sendMessage(message) {
    if (this.connection && this.isConnected) {
      try {
        this.connection.send(JSON.stringify(message));
        return true;
      } catch (error) {
        logger.error('Failed to send message to publisher:', error);
        this.messageQueue.push(message);
        return false;
      }
    } else {
      // Queue message for later
      this.messageQueue.push(message);
      return false;
    }
  }

  processQueuedMessages() {
    if (this.messageQueue.length === 0) {
      return;
    }

    logger.info(`Processing ${this.messageQueue.length} queued messages`);
    
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      this.sendMessage(message);
    }
  }

  handleDisconnection() {
    this.isConnected = false;
    this.connection = null;
    this.stopHeartbeat();
    this.updateConnectionStatus('disconnected');
    
    // Schedule reconnection
    this.scheduleReconnection();
  }

  scheduleReconnection() {
    if (this.reconnectTimer) {
      return; // Already scheduled
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached. Stopping reconnection attempts.');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectInterval * Math.min(this.reconnectAttempts, 5); // Exponential backoff, max 5x

    logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.connectToPublisher();
    }, delay);
  }

  async updateConnectionStatus(status) {
    try {
      if (!this.serverId) {
        return;
      }

      await pool.query(
        `UPDATE subscribers 
         SET status = $1, last_connected = $2, updated_at = NOW()
         WHERE server_id = $3`,
        [status, status === 'connected' ? new Date() : null, this.serverId]
      );
    } catch (error) {
      logger.error('Failed to update subscriber connection status:', error);
    }
  }

  async stop() {
    logger.info('Stopping subscriber service...');
    
    this.stopHeartbeat();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.connection) {
      try {
        this.connection.close();
      } catch (error) {
        logger.error('Error closing publisher connection:', error);
      }
      this.connection = null;
    }

    this.isConnected = false;
    await this.updateConnectionStatus('disconnected');
    
    logger.info('Subscriber service stopped');
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      publisherUrl: this.publisherUrl,
      serverId: this.serverId,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length
    };
  }
}

// Singleton instance
let subscriberServiceInstance = null;

async function initializeSubscriberService() {
  if (!subscriberServiceInstance) {
    subscriberServiceInstance = new SubscriberService();
    await subscriberServiceInstance.initialize();
  }
  return subscriberServiceInstance;
}

function getSubscriberService() {
  return subscriberServiceInstance;
}

module.exports = {
  SubscriberService,
  initializeSubscriberService,
  getSubscriberService
};

