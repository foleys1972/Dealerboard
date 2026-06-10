const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: false });
dotenv.config({ path: path.join(__dirname, '..', 'server.env'), override: false });

const { validateServerConfig } = require('./utils/configValidation');
const logger = require('./utils/logger');
validateServerConfig();

const { initCoreServices } = require('./bootstrap/initCoreServices');
const { initMatrixServices } = require('./bootstrap/initMatrixServices');
const { initIntegrationServices } = require('./bootstrap/initIntegrationServices');
const { initHaAndSubscribers } = require('./bootstrap/initHaAndSubscribers');
const { wireSocketAndSip, initBackgroundJobs } = require('./bootstrap/wireSocketAndBackground');
const { setupRoutes } = require('./routes');

class TradingIntercomServer {
  constructor() {
    this.app = express();
    this.app.locals.tradingIntercomServer = this;

    // API responses should not be cached. ETags can cause 304 Not Modified for JSON endpoints,
    // which makes the UI look like data "disappeared" when the browser is reusing a stale body.
    this.app.set('etag', false);

    // Enterprise deployments frequently run behind a reverse proxy / load balancer.
    // When TRUST_PROXY is enabled, Express will honor X-Forwarded-* headers.
    if (process.env.TRUST_PROXY === 'true') {
      this.app.set('trust proxy', 1);
    }
    this.server = this.createHttpServer();

    const isOriginAllowed = this.createOriginChecker();

    // Initialize Socket.IO with connection limits and throttling
    this.io = require('socket.io')(this.server, {
      cors: {
        origin: (origin, callback) => {
          if (isOriginAllowed(origin)) return callback(null, true);
          callback(new Error(`Socket.IO CORS blocked for origin: ${origin}`));
        },
        methods: ["GET", "POST"],
        credentials: true
      },
      maxHttpBufferSize: 1e6, // 1MB max buffer
      pingTimeout: 60000, // 60 seconds
      pingInterval: 25000, // 25 seconds
      transports: ['websocket', 'polling'],
      allowEIO3: true,
      // Better error handling for polling transport
      allowRequest: (req, callback) => {
        // Log 400 errors for debugging
        if (req.headers['content-length'] && parseInt(req.headers['content-length']) > 1e6) {
          logger.warn(`Socket.IO request too large: ${req.headers['content-length']} bytes`);
        }
        callback(null, true);
      },
      // Handle connection errors gracefully
      connectTimeout: 45000, // 45 seconds
      // Verified 2026-06-10: compression works with current web and .NET clients
      // (see SOCKET_IO_ROOT_CAUSE.md). SOCKETIO_COMPRESSION=false is the emergency
      // kill switch for the historical "Invalid frame header" issue.
      httpCompression: process.env.SOCKETIO_COMPRESSION !== 'false',
      perMessageDeflate: process.env.SOCKETIO_COMPRESSION !== 'false',
    });
    
    // Add error handler for Socket.IO engine
    this.io.engine.on('connection_error', (err) => {
      logger.warn('Socket.IO connection error:', err.message);
      // Don't log full stack trace for 400 errors (they're usually transient)
      if (err.message && err.message.includes('400')) {
        logger.debug('Socket.IO 400 error (likely transient polling issue):', err.message);
      } else {
        logger.error('Socket.IO connection error:', err);
      }
    });
    
    this.port = process.env.PORT || 5000;
    this.mediaSoupWorker = null;
    this.matrixClient = null;
    this.matrixAppService = null;
    this.sipGateway = null;
    this.redisClient = null;
    this.sessionManager = null;
    this.connectionCount = 0;
    this.maxConnections = process.env.MAX_WEBSOCKET_CONNECTIONS || 1000;
    this.publisherSubscriberService = null;
    this._shutdownHandlersRegistered = false;
    this._shutdownInProgress = false;
  }

  computeLocalServerUrl() {
    const port = String(process.env.PORT || 5000);
    const announcedIp = process.env.ANNOUNCED_IP || process.env.LISTEN_IP || '127.0.0.1';
    const protocol = process.env.HTTPS_ENABLED === 'true' ? 'https' : 'http';
    return `${protocol}://${announcedIp}:${port}`;
  }

  getCorsConfig() {
    const envAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const allowedOrigins = new Set([
      ...envAllowedOrigins,
      ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL] : [])
    ]);

    const hasExplicitAllowlist = allowedOrigins.size > 0;

    // Development convenience: always allow local origins (including the server's own origin)
    // even if an explicit allowlist is configured via CLIENT_URL.
    if (process.env.NODE_ENV !== 'production') {
      const port = String(process.env.PORT || 5000);
      const announcedIp = process.env.ANNOUNCED_IP || process.env.LISTEN_IP || '127.0.0.1';

      // Common dev UI origins
      allowedOrigins.add('http://127.0.0.1:3000');
      allowedOrigins.add('http://localhost:3000');
      allowedOrigins.add('https://127.0.0.1:3000');
      allowedOrigins.add('https://localhost:3000');

      // If the admin portal is served from the server itself
      allowedOrigins.add(`http://${announcedIp}:${port}`);
      allowedOrigins.add(`https://${announcedIp}:${port}`);
      allowedOrigins.add(`http://127.0.0.1:${port}`);
      allowedOrigins.add(`https://127.0.0.1:${port}`);
      allowedOrigins.add(`http://localhost:${port}`);
      allowedOrigins.add(`https://localhost:${port}`);
    }

    if (!hasExplicitAllowlist) {
      allowedOrigins.add(process.env.CLIENT_URL || 'http://localhost:3000');
      allowedOrigins.add('http://127.0.0.1:3000');
      allowedOrigins.add('http://localhost:3000');
      allowedOrigins.add('https://127.0.0.1:3000');
      allowedOrigins.add('https://localhost:3000');
      allowedOrigins.add('https://192.168.1.41:3000');
      allowedOrigins.add('http://192.168.1.41:3000');
    }

    return { allowedOrigins, hasExplicitAllowlist };
  }

  // Single origin-allow policy shared by the Socket.IO and Express CORS configs.
  createOriginChecker() {
    const { allowedOrigins, hasExplicitAllowlist } = this.getCorsConfig();

    const isLocalOrigin = (origin) =>
      origin.startsWith('http://localhost:') ||
      origin.startsWith('https://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('https://127.0.0.1:') ||
      /^https?:\/\/(192\.168\.|10\.|172\.\d{1,3}\.)/.test(origin);

    return (origin) => {
      // Allow non-browser or same-origin requests (no Origin header)
      if (!origin) return true;
      if (allowedOrigins.has(origin)) return true;

      // Development convenience (and the default when no explicit allowlist is
      // configured): allow localhost/loopback and RFC1918 LAN origins.
      if (process.env.NODE_ENV !== 'production' || !hasExplicitAllowlist) {
        return isLocalOrigin(origin);
      }

      return false;
    };
  }

  createHttpServer() {
    const certPath =
      process.env.SSL_CERT_FILE ||
      path.join(__dirname, '..', 'dev-cert.pem');
    const keyPath =
      process.env.SSL_KEY_FILE ||
      path.join(__dirname, '..', 'dev-key.pem');

    // HTTPS should be opt-in. If dev certs exist, starting HTTPS unconditionally can cause
    // browsers/clients (configured for http://) to see ERR_INVALID_HTTP_RESPONSE.
    if (process.env.HTTPS_ENABLED !== 'true') {
      return http.createServer(this.app);
    }

    try {
      const tlsOptions = {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
      };
      logger.info(`Starting HTTPS server using cert: ${certPath}`);
      return https.createServer(tlsOptions, this.app);
    } catch (error) {
      logger.warn(
        `Failed to load SSL certificate or key (${certPath}, ${keyPath}). Falling back to HTTP. Error: ${error.message}`
      );
      return http.createServer(this.app);
    }
  }

  async initialize() {
    try {
      logger.info('Initializing Trading Intercom Server...');
      
      // Initialize core services
      await this.setupMiddleware();

      await initCoreServices(this);
      await initMatrixServices(this);
      await initIntegrationServices(this);

      setupRoutes(this.app);

      await initHaAndSubscribers(this);
      wireSocketAndSip(this);
      await initBackgroundJobs(this);

      logger.info('Server initialization completed successfully');
    } catch (error) {
      logger.error('Failed to initialize server:', error);
      throw error;
    }
  }

  setupScheduledArchiving() {
    const { matrixService } = require('./services/matrixService');
    const { pool } = require('./services/databaseService');
    
    // Run archiving check every 24 hours (at 2 AM)
    const runArchiving = async () => {
      try {
        // Get archive settings
        const result = await pool.query(
          `SELECT settings FROM system_settings WHERE id = 'global'`
        );
        
        const settings = result.rows.length > 0 ? result.rows[0].settings : {};
        const archiveConfig = settings.roomArchive || { enabled: false, inactiveDays: 90 };
        
        if (archiveConfig.enabled && archiveConfig.inactiveDays) {
          const archiveResult = await matrixService.archiveInactiveRooms(archiveConfig.inactiveDays);
          logger.info(`Scheduled archiving completed: ${archiveResult.archived} rooms archived`);
        }
      } catch (error) {
        logger.error('Scheduled archiving failed:', error);
      }
    };
    
    // Calculate milliseconds until next 2 AM
    const now = new Date();
    const next2AM = new Date();
    next2AM.setHours(2, 0, 0, 0);
    if (next2AM <= now) {
      next2AM.setDate(next2AM.getDate() + 1);
    }
    const msUntil2AM = next2AM - now;
    
    // Run initial check after delay, then every 24 hours
    setTimeout(() => {
      runArchiving();
      setInterval(runArchiving, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntil2AM);
    
    logger.info(`Scheduled room archiving will run daily at 2 AM (first run in ${Math.round(msUntil2AM / 1000 / 60)} minutes)`);
  }

  setupWebSocketMonitoring() {
    // Connection throttling and monitoring
    this.io.engine.on('connection_error', (err) => {
      logger.warn('WebSocket connection error:', err.message);
    });

    // Track connection count
    this.io.on('connection', (socket) => {
      this.connectionCount++;
      
      // Log every 10th connection to avoid spam
      if (this.connectionCount % 10 === 0) {
        logger.info(`WebSocket connections: ${this.connectionCount}/${this.maxConnections}`);
      }
      
      // Check connection limit
      if (this.connectionCount > this.maxConnections) {
        logger.warn(`Connection limit exceeded: ${this.connectionCount}/${this.maxConnections}`);
        socket.emit('error', { message: 'Server at capacity, please try again later' });
        socket.disconnect(true);
        return;
      }
      
      // Handle disconnection
      socket.on('disconnect', (reason) => {
        this.connectionCount = Math.max(0, this.connectionCount - 1);
        logger.debug(`WebSocket disconnected: ${socket.id} (${reason}) - Total: ${this.connectionCount}`);
      });
      
      // Handle errors
      socket.on('error', (error) => {
        logger.error(`WebSocket error for ${socket.id}:`, error);
        this.connectionCount = Math.max(0, this.connectionCount - 1);
      });
    });
    
    logger.info(`WebSocket monitoring enabled - Max connections: ${this.maxConnections}`);
  }

  async setupMiddleware() {
    // Tenant resolution (Pattern A: tenant subdomain)
    this.app.use((req, res, next) => {
      try {
        const defaultTenantSlug = process.env.DEFAULT_TENANT_SLUG || 'default';
        const rootDomain = process.env.ROOT_DOMAIN || null;

        const hostHeader = req.headers.host || '';
        const host = String(Array.isArray(hostHeader) ? hostHeader[0] : hostHeader).split(':')[0];

        let tenantSlug = defaultTenantSlug;

        // If host is an IP or localhost, keep default tenant.
        const isIp = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
        if (!isIp && host !== 'localhost' && host !== '127.0.0.1')
        {
          const parts = host.split('.');
          if (parts.length >= 3)
          {
            tenantSlug = parts[0] || defaultTenantSlug;
          }
          else if (rootDomain && host.endsWith(rootDomain))
          {
            // host is exactly rootDomain; use default tenant
            tenantSlug = defaultTenantSlug;
          }
        }

        req.tenantSlug = tenantSlug;
        req.tenantContext = {
          tenantSlug,
          rootDomain
        };
      } catch (e) {
        req.tenantSlug = process.env.DEFAULT_TENANT_SLUG || 'default';
        req.tenantContext = { tenantSlug: req.tenantSlug, rootDomain: process.env.ROOT_DOMAIN || null };
      }
      next();
    });

    // Disable caching for API routes (fixes confusing 304 Not Modified for JSON endpoints)
    this.app.use('/api', (req, res, next) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      next();
    });

    // Security middleware - relaxed for development
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: [
            "'self'",
            "ws:",
            "wss:",
            "http://localhost:5000",
            "http://127.0.0.1:5000",
            "https://localhost:5000",
            "https://127.0.0.1:5000",
            "https://192.168.1.41:5000",
            "http://192.168.1.41:5000",
            "https://192.168.1.41:3000",
            "http://192.168.1.41:3000"
          ],
          mediaSrc: ["'self'", "blob:"],
          imgSrc: ["'self'", "data:", "https:"],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          // Block MetaMask extension
          manifestSrc: ["'self'"],
          workerSrc: ["'self'", "blob:"],
          childSrc: ["'self'"]
        },
      },
    }));

    // Brute-force protection on login: counts only FAILED attempts
    // (skipSuccessfulRequests), active in all environments.
    const loginLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX) || 25,
      skipSuccessfulRequests: true,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many failed login attempts. Please try again later.' },
    });
    this.app.use('/api/auth/login', loginLimiter);

    // General API rate limiting (production only).
    // Note: under an app.use('/api/', ...) mount, req.path has the mount
    // stripped, so auth paths start with '/auth/'.
    const limiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: parseInt(process.env.API_RATE_LIMIT_MAX) || 1000,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests from this IP, please try again later.' },
    });

    if (process.env.NODE_ENV === 'production') {
      this.app.use('/api/', (req, res, next) => {
        // Login already has its own stricter limiter
        if (req.path.startsWith('/auth/login')) {
          return next();
        }
        return limiter(req, res, next);
      });
    }

    // CORS configuration
    const isOriginAllowed = this.createOriginChecker();

    this.app.use(cors({
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) return callback(null, true);
        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Serve static files from React build
    // Serve static files from React build (only if build directory exists)
    const buildPath = path.join(__dirname, '../client/build');
    if (fs.existsSync(buildPath)) {
      this.app.use(express.static(buildPath));
    } else {
      logger.warn('React client build directory not found. Run "npm run build" in the client directory or use build-client.bat');
    }
    
    // SPA entry for WebView2 media engine (BrowserRouter route)
    this.app.get('/wpf-media-engine', (req, res) => {
      const indexPath = path.join(__dirname, '../client/build/index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(503).json({ error: 'Client not built. Please run "npm run build" in the client directory.' });
      }
    });
    
    // API status endpoint (previously at '/')
    this.app.get('/api/status', (req, res) => {
      res.json({
        message: 'Trading Intercom API Server',
        status: 'running',
        version: '1.0.0',
        endpoints: {
          auth: '/api/auth',
          groups: '/api/groups',
          webrtc: '/api/webrtc',
          recordings: '/api/recordings',
          matrix: '/api/matrix',
          compliance: '/api/compliance',
          federation: '/api/federation'
        },
        client: process.env.CLIENT_URL || 'Not configured'
      });
    });

    // Root route - serve SPA
    this.app.get('/', (req, res) => {
      const indexPath = path.join(__dirname, '../client/build/index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(503).json({ 
          error: 'Client not built. Please run "npm run build" in the client directory or use build-client.bat',
          instructions: 'To build the client, run: cd client && npm run build'
        });
      }
    });

    // SPA fallback for BrowserRouter routes (exclude API and Socket.IO)
    this.app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => {
      const indexPath = path.join(__dirname, '../client/build/index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(503).json({ 
          error: 'Client not built. Please run "npm run build" in the client directory or use build-client.bat',
          instructions: 'To build the client, run: cd client && npm run build'
        });
      }
    });

    // Redis status endpoint
    this.app.get('/api/redis/status', (req, res) => {
      try {
        const redisService = require('./services/redisService');
        const sessionManager = require('./services/sessionManager');
        
        const redisInstance = redisService.redisService || this.redisClient;
        const sessionInstance = this.sessionManager;
        
        res.json({
          redis: redisInstance ? redisInstance.getStatus() : { isConnected: false },
          sessionManager: sessionInstance ? sessionInstance.getSessionStats() : { activeSessions: 0 },
          clusterInfo: redisInstance && redisInstance.isCluster ? redisInstance.getClusterInfo() : null,
        });
      } catch (error) {
        logger.error('Redis status endpoint error:', error);
        res.status(500).json({
          error: 'Failed to get Redis status',
          message: error.message
        });
      }
    });

    // MediaSoup SFU status endpoint
    this.app.get('/api/sfu/status', async (req, res) => {
      try {
        const mediaSoupService = require('./services/mediaSoupService');
        const sfuStats = await mediaSoupService.getSFUStats();
        
        res.json({
          sfu: sfuStats,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('SFU status endpoint error:', error);
        res.status(500).json({
          error: 'Failed to get SFU status',
          message: error.message
        });
      }
    });
  }

  async start() {
    try {
      await this.initialize();
      
      this.server.listen(this.port, () => {
        logger.info(`Trading Intercom Server running on port ${this.port}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`Matrix Server: ${process.env.MATRIX_SERVER_URL || 'Not configured'}`);
        logger.info(`SIP Gateway: ${this.sipGateway ? 'Enabled' : 'Disabled'}`);
      });

      // Handle server errors
      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${this.port} is already in use. Please kill the existing process or use a different port.`);
          logger.info('To kill existing process: netstat -ano | findstr :5000');
        } else {
          logger.error('Server error:', error);
        }
        process.exit(1);
      });

      // Graceful shutdown
      // Register shutdown handlers once to avoid MaxListenersExceededWarning
      if (!this._shutdownHandlersRegistered) {
        this._shutdownHandlersRegistered = true;
        process.once('SIGTERM', () => this.shutdown());
        process.once('SIGINT', () => this.shutdown());
      }
      
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async shutdown() {
    if (this._shutdownInProgress) {
      return;
    }
    this._shutdownInProgress = true;
    logger.info('Shutting down server gracefully...');
    
    try {
      if (this.mediaSoupWorker) {
        await this.mediaSoupWorker.close();
      }
      
      if (this.matrixClient) {
        await this.matrixClient.stopClient();
      }

      // If SIP HA is enabled, release owned line leases early so failover is immediate.
      try {
        const los = this.app?.locals?.lineOwnershipService;
        if (los && typeof los.stop === 'function') {
          await los.stop({ releaseLeases: true });
        }
      } catch (e) {
        logger.warn('Failed releasing SIP line leases during shutdown:', e?.message || e);
      }
      
      if (this.sipGateway) {
        await this.sipGateway.stop();
      }
      
      if (this.redisClient) {
        await this.redisClient.quit();
      }
      
      this.server.close(() => {
        logger.info('Server shutdown complete');
        process.exit(0);
      });
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Start the server
const server = new TradingIntercomServer();
server.start().catch(error => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

module.exports = TradingIntercomServer;
