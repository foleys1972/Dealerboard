const WebSocket = require('ws');
const { pool } = require('./databaseService');
const logger = require('../utils/logger');

class PublisherSubscriberService {
  constructor(server) {
    this.server = server;
    this.subscriberConnections = new Map(); // Map<subscriberId, connection>
    this.subscriberSessions = new Map(); // Map<subscriberId, sessionInfo>
    this.wsServer = null;
    this.port = null;
  }

  async initialize() {
    try {
      // Get port from system settings
      const result = await pool.query(
        `SELECT settings FROM system_settings WHERE id = 'global'`
      );

      let port = 3002; // Default
      if (result.rows.length > 0 && result.rows[0].settings?.ports?.conferencingPort) {
        port = result.rows[0].settings.ports.conferencingPort;
      } else if (process.env.CONFERENCING_PORT) {
        port = parseInt(process.env.CONFERENCING_PORT);
      }

      this.port = port;

      // Create WebSocket server for subscriber connections
      this.wsServer = new WebSocket.Server({
        server: this.server,
        path: '/subscriber'
      });

      this.wsServer.on('connection', (ws, req) => {
        this.handleSubscriberConnection(ws, req);
      });

      this.wsServer.on('error', (error) => {
        logger.error('Subscriber WebSocket server error:', error);
      });

      logger.info(`Publisher subscriber service initialized on port ${port} (path: /subscriber)`);
    } catch (error) {
      logger.error('Failed to initialize publisher subscriber service:', error);
      throw error;
    }
  }

  async handleSubscriberConnection(ws, req) {
    try {
      const clientIP = req.socket.remoteAddress;
      logger.info(`Incoming subscriber connection from ${clientIP}`);

      let authenticated = false;
      let subscriberId = null;
      let subscriberInfo = null;

      // Set timeout for authentication
      const authTimeout = setTimeout(() => {
        if (!authenticated) {
          logger.warn(`Subscriber connection from ${clientIP} failed to authenticate within timeout`);
          ws.close(1008, 'Authentication timeout');
        }
      }, 10000); // 10 second timeout

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === 'subscriber-auth') {
            clearTimeout(authTimeout);
            
            // Verify subscriber authentication
            const authResult = await this.authenticateSubscriber(message);
            
            if (authResult.success) {
              authenticated = true;
              subscriberId = authResult.subscriberId;
              subscriberInfo = authResult.subscriberInfo;

              // Store connection
              this.subscriberConnections.set(subscriberId, ws);
              this.subscriberSessions.set(subscriberId, {
                serverId: subscriberInfo.server_id,
                serverName: subscriberInfo.name,
                connectedAt: new Date(),
                lastHeartbeat: new Date(),
                ip: clientIP
              });

              // Update subscriber status in database
              await this.updateSubscriberStatus(subscriberId, 'connected');

              // Send authentication response
              ws.send(JSON.stringify({
                type: 'auth-response',
                success: true,
                message: 'Authenticated successfully',
                serverId: subscriberInfo.server_id
              }));

              logger.info(`Subscriber authenticated: ${subscriberInfo.name} (${subscriberInfo.server_id})`);
            } else {
              ws.send(JSON.stringify({
                type: 'auth-response',
                success: false,
                error: authResult.error
              }));
              
              logger.warn(`Subscriber authentication failed from ${clientIP}: ${authResult.error}`);
              ws.close(1008, 'Authentication failed');
            }
          } else if (message.type === 'heartbeat') {
            if (authenticated && subscriberId) {
              // Update last heartbeat
              const session = this.subscriberSessions.get(subscriberId);
              if (session) {
                session.lastHeartbeat = new Date();
              }

              // Send heartbeat response
              ws.send(JSON.stringify({
                type: 'heartbeat-response',
                timestamp: Date.now()
              }));
            }
          } else if (authenticated) {
            // Handle other message types for authenticated subscribers
            await this.handleSubscriberMessage(subscriberId, message);
          } else {
            logger.warn(`Received message from unauthenticated subscriber: ${message.type}`);
          }
        } catch (error) {
          logger.error('Error handling subscriber message:', error);
        }
      });

      ws.on('close', () => {
        if (subscriberId) {
          logger.info(`Subscriber disconnected: ${subscriberInfo?.name || subscriberId}`);
          this.subscriberConnections.delete(subscriberId);
          this.subscriberSessions.delete(subscriberId);
          this.updateSubscriberStatus(subscriberId, 'disconnected');
        }
      });

      ws.on('error', (error) => {
        logger.error(`Subscriber connection error from ${clientIP}:`, error);
        if (subscriberId) {
          this.subscriberConnections.delete(subscriberId);
          this.subscriberSessions.delete(subscriberId);
          this.updateSubscriberStatus(subscriberId, 'disconnected');
        }
      });

      ws.on('pong', () => {
        // Heartbeat pong received
        if (subscriberId) {
          const session = this.subscriberSessions.get(subscriberId);
          if (session) {
            session.lastHeartbeat = new Date();
          }
        }
      });

    } catch (error) {
      logger.error('Failed to handle subscriber connection:', error);
      ws.close(1011, 'Server error');
    }
  }

  async authenticateSubscriber(message) {
    try {
      const { serverId, authToken } = message;

      if (!serverId || !authToken) {
        return { success: false, error: 'Missing serverId or authToken' };
      }

      // Look up subscriber in database
      const result = await pool.query(
        `SELECT * FROM subscribers 
         WHERE server_id = $1 AND is_active = true`,
        [serverId]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Subscriber not found or inactive' };
      }

      const subscriber = result.rows[0];

      // Verify auth token
      if (subscriber.auth_token !== authToken) {
        return { success: false, error: 'Invalid authentication token' };
      }

      return {
        success: true,
        subscriberId: subscriber.id,
        subscriberInfo: subscriber
      };
    } catch (error) {
      logger.error('Failed to authenticate subscriber:', error);
      return { success: false, error: 'Authentication error' };
    }
  }

  async handleSubscriberMessage(subscriberId, message) {
    try {
      switch (message.type) {
        case 'group-call-join':
          // TODO: Handle subscriber users joining group calls
          logger.debug(`Subscriber ${subscriberId} joining group call: ${message.groupId}`);
          break;

        case 'broadcast-join':
          // TODO: Handle subscriber users joining broadcasts
          logger.debug(`Subscriber ${subscriberId} joining broadcast: ${message.broadcastId}`);
          break;

        case 'audio-data':
          // TODO: Handle audio data from subscriber
          logger.debug(`Received audio data from subscriber ${subscriberId}`);
          break;

        default:
          logger.warn(`Unknown message type from subscriber: ${message.type}`);
      }
    } catch (error) {
      logger.error('Failed to handle subscriber message:', error);
    }
  }

  async updateSubscriberStatus(subscriberId, status) {
    try {
      await pool.query(
        `UPDATE subscribers 
         SET status = $1, last_connected = $2, updated_at = NOW()
         WHERE id = $3`,
        [status, status === 'connected' ? new Date() : null, subscriberId]
      );
    } catch (error) {
      logger.error('Failed to update subscriber status:', error);
    }
  }

  sendToSubscriber(subscriberId, message) {
    const connection = this.subscriberConnections.get(subscriberId);
    if (connection && connection.readyState === WebSocket.OPEN) {
      try {
        connection.send(JSON.stringify(message));
        return true;
      } catch (error) {
        logger.error(`Failed to send message to subscriber ${subscriberId}:`, error);
        return false;
      }
    }
    return false;
  }

  broadcastToSubscribers(message, excludeSubscriberId = null) {
    let sentCount = 0;
    for (const [subscriberId, connection] of this.subscriberConnections) {
      if (subscriberId !== excludeSubscriberId && connection.readyState === WebSocket.OPEN) {
        if (this.sendToSubscriber(subscriberId, message)) {
          sentCount++;
        }
      }
    }
    return sentCount;
  }

  getConnectedSubscribers() {
    return Array.from(this.subscriberSessions.values());
  }

  isSubscriberConnected(subscriberId) {
    const connection = this.subscriberConnections.get(subscriberId);
    return connection && connection.readyState === WebSocket.OPEN;
  }

  async stop() {
    logger.info('Stopping publisher subscriber service...');

    // Close all connections
    for (const [subscriberId, connection] of this.subscriberConnections) {
      try {
        connection.close();
        await this.updateSubscriberStatus(subscriberId, 'disconnected');
      } catch (error) {
        logger.error(`Error closing subscriber connection ${subscriberId}:`, error);
      }
    }

    this.subscriberConnections.clear();
    this.subscriberSessions.clear();

    if (this.wsServer) {
      this.wsServer.close();
    }

    logger.info('Publisher subscriber service stopped');
  }
}

module.exports = PublisherSubscriberService;

