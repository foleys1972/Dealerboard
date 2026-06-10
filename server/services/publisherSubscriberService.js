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
    this.livenessInterval = null;
    // Subscribers heartbeat every 30s; evict after 3 missed beats
    this.heartbeatTimeoutMs = parseInt(process.env.SUBSCRIBER_HEARTBEAT_TIMEOUT_MS) || 90000;
  }

  /**
   * Evict subscribers whose heartbeat has gone stale. Without this, a
   * subscriber that dies without a clean WS close (power loss, network
   * partition) stays "connected" until TCP gives up — which can be hours.
   */
  startLivenessSweep() {
    if (this.livenessInterval) return;

    this.livenessInterval = setInterval(() => {
      const now = Date.now();

      for (const [subscriberId, session] of this.subscriberSessions) {
        const last = session.lastHeartbeat ? session.lastHeartbeat.getTime() : 0;
        if (now - last <= this.heartbeatTimeoutMs) continue;

        logger.warn(
          `Subscriber ${subscriberId} (${session.serverName}) heartbeat stale for ${Math.round((now - last) / 1000)}s — evicting`
        );

        const ws = this.subscriberConnections.get(subscriberId);
        try {
          if (ws) ws.terminate();
        } catch (error) {
          logger.error(`Error terminating stale subscriber ${subscriberId}:`, error);
        }

        // ws 'close' handler also cleans up, but terminate() on an already
        // half-dead socket may not fire it promptly — clean up directly.
        this.subscriberConnections.delete(subscriberId);
        this.subscriberSessions.delete(subscriberId);
        this.updateSubscriberStatus(subscriberId, 'disconnected').catch((error) => {
          logger.error(`Failed to mark stale subscriber ${subscriberId} disconnected:`, error);
        });
      }

      // Proactive WS-level ping so pongs refresh lastHeartbeat even if the
      // app-level heartbeat message is delayed.
      for (const [, ws] of this.subscriberConnections) {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.ping(); } catch { /* socket closing */ }
        }
      }
    }, 30000);

    this.livenessInterval.unref?.();
  }

  _getConfiguredPortPool(settings) {
    const cfg = settings?.ports?.subscriberPortPool;

    // Array of explicit ports: [5101, 5102, ...]
    if (Array.isArray(cfg) && cfg.length) {
      const ports = cfg
        .map(p => parseInt(p, 10))
        .filter(p => Number.isFinite(p) && p >= 1024 && p <= 65535);
      return Array.from(new Set(ports));
    }

    // String range: "5100-5500" or "5100..5500"
    if (typeof cfg === 'string' && cfg.trim()) {
      const m = cfg.trim().match(/^(\d{2,5})\s*(?:-|\.\.)\s*(\d{2,5})$/);
      if (m) {
        const start = parseInt(m[1], 10);
        const end = parseInt(m[2], 10);
        if (Number.isFinite(start) && Number.isFinite(end) && start >= 1024 && end <= 65535 && start <= end) {
          const ports = [];
          for (let p = start; p <= end; p++) ports.push(p);
          return ports;
        }
      }
    }

    // Env fallback: SUBSCRIBER_PORT_POOL="5100-5500" or "5101,5102"
    const env = (process.env.SUBSCRIBER_PORT_POOL || '').trim();
    if (env) {
      const m = env.match(/^(\d{2,5})\s*(?:-|\.\.)\s*(\d{2,5})$/);
      if (m) {
        const start = parseInt(m[1], 10);
        const end = parseInt(m[2], 10);
        if (start >= 1024 && end <= 65535 && start <= end) {
          const ports = [];
          for (let p = start; p <= end; p++) ports.push(p);
          return ports;
        }
      }

      const ports = env
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(p => Number.isFinite(p) && p >= 1024 && p <= 65535);
      if (ports.length) return Array.from(new Set(ports));
    }

    // Default enterprise range
    const ports = [];
    for (let p = 5100; p <= 5500; p++) ports.push(p);
    return ports;
  }

  async _getSystemSettings() {
    const result = await pool.query(
      `SELECT settings FROM system_settings WHERE id = 'global'`
    );
    return result.rows.length > 0 ? (result.rows[0].settings || {}) : {};
  }

  async _allocateSubscriberPort(subscriberInfo) {
    // subscriberInfo is a row from subscribers
    const settings = await this._getSystemSettings();
    const poolPorts = this._getConfiguredPortPool(settings);

    // Existing allocation?
    const existing = await pool.query(
      `SELECT port FROM subscriber_port_allocations WHERE subscriber_id = $1`,
      [subscriberInfo.id]
    );
    if (existing.rows.length > 0) {
      const port = existing.rows[0].port;
      // Keep subscribers.connection_port in sync
      await pool.query(
        `UPDATE subscribers SET connection_port = $1, updated_at = NOW() WHERE id = $2`,
        [port, subscriberInfo.id]
      );
      return port;
    }

    // Reserve first free port from pool.
    // Concurrency-safe via unique(port) constraint.
    for (const port of poolPorts) {
      try {
        await pool.query(
          `INSERT INTO subscriber_port_allocations (subscriber_id, port)
           VALUES ($1, $2)`,
          [subscriberInfo.id, port]
        );

        await pool.query(
          `UPDATE subscribers SET connection_port = $1, updated_at = NOW() WHERE id = $2`,
          [port, subscriberInfo.id]
        );

        return port;
      } catch (e) {
        // 23505 = unique_violation
        if (e && e.code === '23505') {
          continue;
        }
        throw e;
      }
    }

    throw new Error('No available ports in subscriber port pool');
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

      // Create WebSocket server for subscriber connections.
      // IMPORTANT: noServer mode + manual upgrade routing. Binding ws directly to the
      // HTTP server with a `path` makes ws abort every non-matching upgrade request,
      // which breaks Socket.IO's websocket transport (forcing all clients onto polling).
      this.wsServer = new WebSocket.Server({ noServer: true });

      this.upgradeHandler = (req, socket, head) => {
        let pathname = '';
        try {
          pathname = new URL(req.url, 'http://localhost').pathname;
        } catch {}
        if (pathname !== '/subscriber') {
          // Not ours — leave it for Socket.IO (or engine.io's cleanup) to handle.
          return;
        }
        this.wsServer.handleUpgrade(req, socket, head, (ws) => {
          this.wsServer.emit('connection', ws, req);
        });
      };
      this.server.on('upgrade', this.upgradeHandler);

      this.wsServer.on('connection', (ws, req) => {
        this.handleSubscriberConnection(ws, req);
      });

      this.wsServer.on('error', (error) => {
        logger.error('Subscriber WebSocket server error:', error);
      });

      this.startLivenessSweep();

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

              let assignedPort = null;
              let assignedUrl = null;
              try {
                assignedPort = await this._allocateSubscriberPort(subscriberInfo);
                const baseUrl = (subscriberInfo.server_url || '').replace(/\/$/, '');
                if (baseUrl) {
                  assignedUrl = `${baseUrl.replace(/:\d+$/, '')}:${assignedPort}`;
                }
              } catch (e) {
                ws.send(JSON.stringify({
                  type: 'auth-response',
                  success: false,
                  error: e?.message || 'Failed to allocate subscriber port'
                }));
                logger.warn(`Port allocation failed for subscriber ${subscriberInfo.server_id}: ${e?.message || e}`);
                ws.close(1011, 'Port allocation failed');
                return;
              }

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
                serverId: subscriberInfo.server_id,
                assignedPort,
                assignedUrl
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
                if (message.load) session.load = message.load;
              }

              // Persist reported load for load-aware routing decisions.
              if (message.load) {
                this.updateSubscriberLoad(subscriberId, message.load).catch(() => {});
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

  // Persist the latest reported load into subscribers.metadata.load so
  // load-aware routing (auth/subscriberSelection) can read it at login time.
  async updateSubscriberLoad(subscriberId, load) {
    try {
      await pool.query(
        `UPDATE subscribers
         SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{load}', $1::jsonb, true),
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(load), subscriberId]
      );
    } catch (error) {
      logger.error('Failed to update subscriber load:', error);
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

    if (this.livenessInterval) {
      clearInterval(this.livenessInterval);
      this.livenessInterval = null;
    }

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

    if (this.upgradeHandler) {
      this.server.removeListener('upgrade', this.upgradeHandler);
      this.upgradeHandler = null;
    }

    if (this.wsServer) {
      this.wsServer.close();
    }

    logger.info('Publisher subscriber service stopped');
  }
}

module.exports = PublisherSubscriberService;

