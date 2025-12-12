const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const { initializeMatrixClient } = require('./services/matrixService');
const { initializeMatrixAppService } = require('./services/matrixAppService');
const { initializeMatrixUserSync } = require('./services/matrixUserSync');
const { initializeMediaSoup } = require('./services/mediaSoupService');
const { initializeAudioRouting } = require('./services/audioRoutingService');
const { initializeSIPGateway } = require('./services/sipService');
const { initializeDatabase } = require('./services/databaseService');
const { initializeRedis } = require('./services/redisService');
const { SessionManager } = require('./services/sessionManager');
const { groupService } = require('./services/groupService');
const { setupRoutes } = require('./routes');
const recordingRoutes = require('./routes');
const { setupSocketHandlers } = require('./socketHandlers');
const { setupAudioRecording } = require('./services/audioRecordingService');
const { initializeSubscriberService, getSubscriberService } = require('./services/subscriberService');
const SubscriberAudioRoutingService = require('./services/subscriberAudioRoutingService');
const PublisherSubscriberService = require('./services/publisherSubscriberService');
const { initializeRetentionPolicyService } = require('./services/retentionPolicyService');
const { initializeServerRole, isPublisher } = require('./utils/serverRole');
const { getOrchestratorService } = require('./services/orchestratorService');
const { getMatrixFederationService } = require('./services/matrixFederationService');
const logger = require('./utils/logger');

class TradingIntercomServer {
  constructor() {
    this.app = express();
    this.server = this.createHttpServer();
    
    // Initialize Socket.IO with connection limits and throttling
    this.io = require('socket.io')(this.server, {
      cors: {
        origin: (origin, callback) => {
          // Allow requests with no origin (mobile apps, curl, etc)
          if (!origin) return callback(null, true);
          
          // Allow localhost and 127.0.0.1
          if (origin.startsWith('http://localhost:') || 
              origin.startsWith('https://localhost:') ||
              origin.startsWith('http://127.0.0.1:') ||
              origin.startsWith('https://127.0.0.1:')) {
            return callback(null, true);
          }
          
          // Allow local network IPs (192.168.x.x, 10.x.x.x, 172.x.x.x) for development
          const localNetworkRegex = /^https?:\/\/(192\.168\.|10\.|172\.\d{1,3}\.)/;
          if (localNetworkRegex.test(origin)) {
            return callback(null, true);
          }
          
          // Allow CLIENT_URL from env
          const clientUrl = process.env.CLIENT_URL;
          if (clientUrl && origin.startsWith(clientUrl)) {
            return callback(null, true);
          }
          
          // Default: deny
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
      // Increase max buffer for polling if needed
      httpCompression: true
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
  }

  createHttpServer() {
    const certPath =
      process.env.SSL_CERT_FILE ||
      path.join(__dirname, '..', 'dev-cert.pem');
    const keyPath =
      process.env.SSL_KEY_FILE ||
      path.join(__dirname, '..', 'dev-key.pem');

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
      
      try {
        await initializeDatabase();
      } catch (error) {
        logger.warn('Database initialization failed:', error.message);
      }
      
      // Initialize group service
      try {
        await groupService.initialize();
      } catch (error) {
        logger.warn('Group service initialization failed:', error.message);
      }
      
      try {
        this.redisClient = await initializeRedis();
      } catch (error) {
        logger.warn('Redis initialization failed:', error.message);
        this.redisClient = null;
      }
      
      try {
        this.sessionManager = new SessionManager(this.redisClient);
        await this.sessionManager.initialize();
      } catch (error) {
        logger.warn('Session manager initialization failed:', error.message);
        this.sessionManager = null;
      }
      
      try {
        this.mediaSoupWorker = await initializeMediaSoup();
      } catch (error) {
        logger.warn('MediaSoup initialization failed:', error.message);
        this.mediaSoupWorker = null;
      }
      
      try {
        await initializeAudioRouting();
      } catch (error) {
        logger.warn('Audio routing initialization failed:', error.message);
      }
      
      try {
        this.matrixClient = await initializeMatrixClient();
      } catch (error) {
        logger.warn('Matrix client initialization failed:', error.message);
        this.matrixClient = null;
      }
      
      try {
        this.matrixAppService = await initializeMatrixAppService();
      } catch (error) {
        logger.warn('Matrix AppService initialization failed:', error.message);
        this.matrixAppService = null;
      }
      
      try {
        await initializeMatrixUserSync();
      } catch (error) {
        logger.warn('Matrix user sync initialization failed:', error.message);
      }
      
      try {
        this.sipGateway = await initializeSIPGateway();
      } catch (error) {
        logger.warn('SIP gateway initialization failed:', error.message);
        this.sipGateway = null;
      }

      // Initialize Zoom service
      try {
        const { initializeZoomService } = require('./services/zoomService');
        const zoomService = initializeZoomService();
        await zoomService.initialize();
        this.app.locals.zoomService = zoomService;
        logger.info('Zoom service initialized');
      } catch (error) {
        logger.warn('Zoom service initialization failed:', error.message);
      }

      // Initialize Zoom-Matrix bridge service
      try {
        const { initializeZoomMatrixBridge } = require('./services/zoomMatrixBridge');
        const zoomMatrixBridge = initializeZoomMatrixBridge();
        this.app.locals.zoomMatrixBridge = zoomMatrixBridge;
        logger.info('Zoom-Matrix bridge service initialized');
      } catch (error) {
        logger.warn('Zoom-Matrix bridge service initialization failed:', error.message);
      }

      // Initialize Teams service
      try {
        const { initializeTeamsService } = require('./services/teamsService');
        const teamsService = initializeTeamsService();
        await teamsService.initialize();
        this.app.locals.teamsService = teamsService;
        logger.info('Teams service initialized');
      } catch (error) {
        logger.warn('Teams service initialization failed:', error.message);
      }

      // Initialize Teams-Matrix bridge service
      try {
        const { initializeTeamsMatrixBridge } = require('./services/teamsMatrixBridge');
        const teamsMatrixBridge = initializeTeamsMatrixBridge();
        this.app.locals.teamsMatrixBridge = teamsMatrixBridge;
        logger.info('Teams-Matrix bridge service initialized');
      } catch (error) {
        logger.warn('Teams-Matrix bridge service initialization failed:', error.message);
      }
      
      // Setup routes and socket handlers
      setupRoutes(this.app);
      
      // Pass Socket.IO instance to authRoutes for presence tracking
      const authRoutesModule = require('./routes/authRoutes');
      if (authRoutesModule.setSocketIO) {
        authRoutesModule.setSocketIO(this.io);
      }
      
      // Setup WebSocket connection monitoring and throttling
      this.setupWebSocketMonitoring();
      
      // Setup socket handlers with proper throttling
      const socketHandler = setupSocketHandlers(this.io, {
        groupService,
        audioRoutingService: require('./services/audioRoutingService'),
        recordingService: require('./services/audioRecordingService')
      });
      this.app.locals.socketHandler = socketHandler;
      
      // Set subscriber audio routing in socket handler if available
      if (this.app.locals.subscriberAudioRouting) {
        socketHandler.subscriberAudioRouting = this.app.locals.subscriberAudioRouting;
      }
      
      // Set Socket.IO instance for Matrix service (after socket handlers are set up)
      const { matrixService } = require('./services/matrixService');
      if (matrixService && this.io) {
        matrixService.setSocketIO(this.io);
        logger.info('Matrix service Socket.IO instance configured for real-time updates');
        
        // Set up scheduled room archiving
        this.setupScheduledArchiving();
      }
      
      // Initialize audio recording service
      try {
        await setupAudioRecording(this.mediaSoupWorker);
      } catch (error) {
        logger.warn('Audio recording setup failed:', error.message);
      }

      // Initialize server role and subscriber/publisher services
      try {
        const serverRole = await initializeServerRole();
        
        if (serverRole.role === 'subscriber') {
          // Initialize subscriber service to connect to publisher
          const subscriberService = await initializeSubscriberService();
          
          // Initialize subscriber audio routing service
          const subscriberAudioRouting = new SubscriberAudioRoutingService(subscriberService);
          await subscriberAudioRouting.initialize();
          
          // Link audio routing service to subscriber service
          subscriberService.setAudioRoutingService(subscriberAudioRouting);
          
          // Store in app locals for access from routes/handlers
          this.app.locals.subscriberAudioRouting = subscriberAudioRouting;
          
          // Initialize orchestrator service (managed by subscribers)
          try {
            const orchestratorService = getOrchestratorService();
            await orchestratorService.initialize();
            this.app.locals.orchestratorService = orchestratorService;
            logger.info('Orchestrator service initialized');
          } catch (error) {
            logger.warn('Orchestrator service initialization failed:', error.message);
          }

          // Initialize Matrix federation service (for subscriber servers)
          try {
            const federationService = getMatrixFederationService();
            await federationService.initialize();
            this.app.locals.matrixFederationService = federationService;
            logger.info('Matrix federation service initialized');
          } catch (error) {
            logger.warn('Matrix federation service initialization failed:', error.message);
          }
        } else if (serverRole.role === 'publisher') {
          // Initialize publisher subscriber service to accept subscriber connections
          this.publisherSubscriberService = new PublisherSubscriberService(this.server);
          await this.publisherSubscriberService.initialize();
          // Store instance in app locals for access from routes
          this.app.locals.publisherSubscriberService = this.publisherSubscriberService;
        }
      } catch (error) {
        logger.warn('Server role initialization failed:', error.message);
      }

      // Initialize retention policy service (runs on all servers)
      try {
        await initializeRetentionPolicyService();
        logger.info('Retention policy service initialized');
      } catch (error) {
        logger.warn('Retention policy service initialization failed:', error.message);
      }
      
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

    // Rate limiting (exclude auth routes)
    const limiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 1000, // limit each IP to 1000 requests per windowMs (more generous for dev)
      message: 'Too many requests from this IP, please try again later.'
    });
    
    // Apply rate limiting to all API routes except auth
    // Disabled for development
    if (process.env.NODE_ENV === 'production') {
      this.app.use('/api/', (req, res, next) => {
        if (req.path.startsWith('/api/auth/')) {
          return next(); // Skip rate limiting for auth routes
        }
        return limiter(req, res, next);
      });
    }

    // CORS configuration
    const allowedOrigins = new Set([
      process.env.CLIENT_URL || "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3000",
      "https://127.0.0.1:3000",
      "https://localhost:3000",
      "https://192.168.1.41:3000",
      "http://192.168.1.41:3000"
    ]);

    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow non-browser or same-origin requests (no Origin header)
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);
        
        // Allow localhost and 127.0.0.1
        if (origin.startsWith('http://localhost:') || 
            origin.startsWith('https://localhost:') ||
            origin.startsWith('http://127.0.0.1:') ||
            origin.startsWith('https://127.0.0.1:')) {
          return callback(null, true);
        }
        
        // Allow local network IPs (192.168.x.x, 10.x.x.x, 172.x.x.x) for development
        const localNetworkRegex = /^https?:\/\/(192\.168\.|10\.|172\.\d{1,3}\.)/;
        if (localNetworkRegex.test(origin)) {
          return callback(null, true);
        }
        
        // Allow CLIENT_URL from env
        const clientUrl = process.env.CLIENT_URL;
        if (clientUrl && origin.startsWith(clientUrl)) {
          return callback(null, true);
        }
        
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
    this.app.use(express.static(path.join(__dirname, '../client/build')));
    
    // Root route
    this.app.get('/', (req, res) => {
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
        client: process.env.CLIENT_URL || 'http://localhost:3000'
      });
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
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
      
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async shutdown() {
    logger.info('Shutting down server gracefully...');
    
    try {
      if (this.mediaSoupWorker) {
        await this.mediaSoupWorker.close();
      }
      
      if (this.matrixClient) {
        await this.matrixClient.stopClient();
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
