const logger = require('../utils/logger');
const mediasoup = require('mediasoup');
const { pool } = require('./databaseService');

let worker = null;
let router = null;
let workers = [];
let routers = new Map(); // Group ID -> Router mapping
let transports = new Map(); // Transport ID -> Transport mapping
let producers = new Map(); // Producer ID -> Producer mapping
let consumers = new Map(); // Consumer ID -> Consumer mapping
let audioLevelObservers = new Map(); // Group ID -> AudioLevelObserver mapping

let config = {
  numWorkers: process.env.MEDIASOUP_NUM_WORKERS || 4,
  rtcMinPort: parseInt(process.env.RTC_MIN_PORT) || 10000,
  rtcMaxPort: parseInt(process.env.RTC_MAX_PORT) || 10200,
  listenIp: process.env.LISTEN_IP || '0.0.0.0',
  announcedIp: process.env.ANNOUNCED_IP || null,
  logLevel: process.env.MEDIASOUP_LOG_LEVEL || 'warn',
  maxConcurrentGroups: process.env.MAX_CONCURRENT_GROUPS || 50,
  maxParticipantsPerGroup: process.env.MAX_PARTICIPANTS_PER_GROUP || 300,
};

const DEFAULT_ROUTER_MEDIA_CODECS = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    parameters: {
      minptime: 10,
      useinbandfec: 1,
    },
  },
  // Support SIP codecs for bridging
  {
    kind: 'audio',
    mimeType: 'audio/PCMU',
    clockRate: 8000,
    channels: 1,
  },
  {
    kind: 'audio',
    mimeType: 'audio/PCMA',
    clockRate: 8000,
    channels: 1,
  },
  // Video codecs for WebRTC and Zoom bridging
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000
    }
  },
  {
    kind: 'video',
    mimeType: 'video/VP9',
    clockRate: 90000,
    parameters: {
      'profile-id': 2,
      'x-google-start-bitrate': 1000
    }
  },
  {
    kind: 'video',
    mimeType: 'video/h264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1
    }
  },
];

function getTransportById(transportId) {
  return transports.get(transportId);
}

function getGroupRouter(groupId) {
  return routers.get(groupId);
}

function listGroupRouterIds() {
  return Array.from(routers.keys());
}

/**
 * Load port configuration from system settings
 * Falls back to environment variables or defaults
 */
async function loadPortConfigFromSettings() {
  try {
    // Check if pool is available
    if (!pool) {
      logger.warn('Database pool not available, using environment variables for port configuration');
      return false;
    }

    const result = await pool.query(
      `SELECT settings FROM system_settings WHERE id = 'global'`
    );

    if (result.rows.length > 0 && result.rows[0].settings?.ports) {
      const ports = result.rows[0].settings.ports;
      
      if (ports.rtcMinPort !== undefined && ports.rtcMaxPort !== undefined) {
        const dbMinPort = parseInt(ports.rtcMinPort);
        const dbMaxPort = parseInt(ports.rtcMaxPort);
        
        if (!isNaN(dbMinPort) && !isNaN(dbMaxPort) && dbMinPort > 0 && dbMaxPort > 0) {
          config.rtcMinPort = dbMinPort;
          config.rtcMaxPort = dbMaxPort;
          logger.info(`✅ Port configuration loaded from system settings: ${config.rtcMinPort}-${config.rtcMaxPort}`);
          return true;
        } else {
          logger.warn('Invalid port values in database settings, using environment variables');
        }
      } else {
        logger.debug('No port configuration found in database settings, using environment variables');
      }
    } else {
      logger.debug('No system settings found in database, using environment variables');
    }
  } catch (error) {
    logger.warn('Failed to load port configuration from system settings, using environment/default:', error.message);
    logger.debug('Port config load error details:', { error: error.message, stack: error.stack });
  }

  // Fallback to environment variables or defaults
  const envMinPort = parseInt(process.env.RTC_MIN_PORT);
  const envMaxPort = parseInt(process.env.RTC_MAX_PORT);
  
  if (!isNaN(envMinPort) && envMinPort > 0) {
    config.rtcMinPort = envMinPort;
  } else {
    config.rtcMinPort = 10000; // Default
  }
  
  if (!isNaN(envMaxPort) && envMaxPort > 0) {
    config.rtcMaxPort = envMaxPort;
  } else {
    config.rtcMaxPort = 10200; // Default
  }
  
  logger.info(`Using port configuration from environment/default: ${config.rtcMinPort}-${config.rtcMaxPort}`);
  return false;
}

async function createWorkerInstance() {
  const newWorker = await mediasoup.createWorker({
    logLevel: config.logLevel,
    rtcMinPort: config.rtcMinPort,
    rtcMaxPort: config.rtcMaxPort,
    dtlsCertificateFile: process.env.DTLS_CERT_FILE,
    dtlsPrivateKeyFile: process.env.DTLS_PRIVATE_KEY_FILE,
  });

  newWorker.on('died', () => {
    handleWorkerDeath(newWorker).catch((err) => {
      logger.error('MediaSoup worker respawn failed fatally, exiting:', err);
      process.exit(1);
    });
  });

  return newWorker;
}

/**
 * Remove map entries for resources that were closed by a worker death.
 * mediasoup closes routers/transports/producers/consumers on the dead worker
 * automatically; without purging, stale entries block group recreation.
 */
function purgeClosedMediaResources() {
  let purged = { routers: 0, transports: 0, producers: 0, consumers: 0 };

  for (const [id, c] of consumers) {
    if (c.closed) { consumers.delete(id); purged.consumers++; }
  }
  for (const [id, p] of producers) {
    if (p.closed) { producers.delete(id); purged.producers++; }
  }
  for (const [id, t] of transports) {
    if (t.closed) { transports.delete(id); purged.transports++; }
  }
  for (const [groupId, r] of routers) {
    if (r.closed) {
      routers.delete(groupId);
      audioLevelObservers.delete(groupId);
      purged.routers++;
    }
  }

  return purged;
}

/**
 * Respawn a dead mediasoup worker instead of killing the whole server.
 * Calls and groups hosted on the dead worker are lost (their routers are
 * closed), but the server keeps serving everything else and new groups
 * can be created immediately on the replacement worker.
 */
async function handleWorkerDeath(deadWorker) {
  logger.error(`MediaSoup worker died (pid ${deadWorker.pid}) — respawning`);

  const idx = workers.indexOf(deadWorker);
  if (idx !== -1) workers.splice(idx, 1);

  const wasMain = worker === deadWorker;
  const purged = purgeClosedMediaResources();
  logger.warn('Purged media resources lost with dead worker:', purged);

  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const replacement = await createWorkerInstance();
      workers.splice(idx === -1 ? workers.length : idx, 0, replacement);

      if (wasMain) {
        worker = replacement;
        router = await replacement.createRouter({ mediaCodecs: DEFAULT_ROUTER_MEDIA_CODECS });
        logger.info(`Main MediaSoup worker replaced (pid ${replacement.pid}); default router rebuilt`);
      } else {
        logger.info(`MediaSoup worker replaced (pid ${replacement.pid})`);
      }
      return;
    } catch (error) {
      logger.error(`MediaSoup worker respawn attempt ${attempt}/${maxAttempts} failed:`, error.message);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  throw new Error(`Unable to respawn MediaSoup worker after ${maxAttempts} attempts`);
}

async function initializeMediaSoup() {
  try {
    // Load port configuration from system settings first
    await loadPortConfigFromSettings();

    logger.info('Initializing MediaSoup SFU...', {
      numWorkers: config.numWorkers,
      rtcPorts: `${config.rtcMinPort}-${config.rtcMaxPort}`,
      listenIp: config.listenIp,
      announcedIp: config.announcedIp
    });

    // Validate port range
    if (config.rtcMinPort >= config.rtcMaxPort) {
      throw new Error(`Invalid port range: rtcMinPort (${config.rtcMinPort}) must be less than rtcMaxPort (${config.rtcMaxPort})`);
    }

    if (config.rtcMinPort < 1024 || config.rtcMaxPort > 65535) {
      throw new Error(`Port range must be between 1024 and 65535`);
    }

    const portRange = config.rtcMaxPort - config.rtcMinPort + 1;
    if (portRange < 200) {
      logger.warn(`Port range is ${portRange} ports, which is less than the recommended 200 ports`);
    }

    // Create workers
    for (let i = 0; i < config.numWorkers; i++) {
      const newWorker = await createWorkerInstance();
      workers.push(newWorker);
      logger.info(`MediaSoup worker ${i + 1} created (pid ${newWorker.pid})`);
    }

    // Use the first worker as the main worker for now
    worker = workers[0];

    // Create a default router for basic operations (non group-specific flows)
    router = await worker.createRouter({ mediaCodecs: DEFAULT_ROUTER_MEDIA_CODECS });

    logger.info('MediaSoup SFU initialized successfully', {
      workers: workers.length,
      rtcPorts: `${config.rtcMinPort}-${config.rtcMaxPort}`,
      listenIp: config.listenIp,
      announcedIp: config.announcedIp
    });

    return worker;
  } catch (error) {
    logger.error('Failed to initialize MediaSoup worker:', error);
    throw error;
  }
}

// Group management
async function createGroupRouter(groupId) {
  try {
    if (!worker) {
      throw new Error('MediaSoup worker not initialized');
    }

    if (routers.has(groupId)) {
      // Router already exists - this is expected when multiple clients connect to the same group
      // Return existing router without logging (getOrCreateRouter should be used for this case)
      return routers.get(groupId);
    }

    const router = await worker.createRouter({
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
          parameters: {
            minptime: 10,
            useinbandfec: 1
          }
        },
        // Support SIP codecs for bridging
        {
          kind: 'audio',
          mimeType: 'audio/PCMU',
          clockRate: 8000,
          channels: 1,
        },
        {
          kind: 'audio',
          mimeType: 'audio/PCMA',
          clockRate: 8000,
          channels: 1,
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: {
            'x-google-start-bitrate': 1000
          }
        },
        {
          kind: 'video',
          mimeType: 'video/VP9',
          clockRate: 90000,
          parameters: {
            'profile-id': 2,
            'x-google-start-bitrate': 1000
          }
        },
        {
          kind: 'video',
          mimeType: 'video/h264',
          clockRate: 90000,
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '4d0032',
            'level-asymmetry-allowed': 1,
            'x-google-start-bitrate': 1000
          }
        }
      ]
    });

    routers.set(groupId, router);
    
    // Create audio level observer for the group
    const audioLevelObserver = await router.createAudioLevelObserver({
      maxEntries: 10,
      threshold: -80,
      interval: 800
    });

    audioLevelObserver.on('volumes', (volumes) => {
      // Emit audio level events for the group
      logger.debug(`Audio levels for group ${groupId}:`, volumes);
    });

    audioLevelObservers.set(groupId, audioLevelObserver);

    logger.info(`Router created for group ${groupId}`);
    return router;
  } catch (error) {
    logger.error(`Failed to create router for group ${groupId}:`, error);
    throw error;
  }
}

async function deleteGroupRouter(groupId) {
  try {
    const router = routers.get(groupId);
    if (!router) {
      logger.warn(`No router found for group ${groupId}`);
      return;
    }

    // Close all transports for this group
    for (const [transportId, transport] of transports) {
      if (transport.router === router) {
        await closeTransport(transportId);
      }
    }

    // Close audio level observer
    const audioLevelObserver = audioLevelObservers.get(groupId);
    if (audioLevelObserver) {
      audioLevelObserver.close();
      audioLevelObservers.delete(groupId);
    }

    // Close router
    router.close();
    routers.delete(groupId);

    logger.info(`Router deleted for group ${groupId}`);
  } catch (error) {
    logger.error(`Failed to delete router for group ${groupId}:`, error);
    throw error;
  }
}

async function createPlainTransport(groupId, options = {}) {
  try {
    const routerForGroup = await getOrCreateRouter(groupId);
    if (!routerForGroup) {
      throw new Error(`Failed to get router for group ${groupId}`);
    }

    const plainTransport = await routerForGroup.createPlainTransport({
      listenIp: options.listenIp || { ip: '0.0.0.0', announcedIp: config.announcedIp },
      rtcpMux: options.rtcpMux !== false, // Default to true
      comedia: options.comedia || false,
    });

    transports.set(plainTransport.id, plainTransport);

    logger.info(`PlainTransport created for group ${groupId}`, {
      transportId: plainTransport.id,
      rtpPort: plainTransport.tuple.localPort,
      rtcpPort: plainTransport.rtcpTuple?.localPort
    });

    return plainTransport;
  } catch (error) {
    logger.error(`Failed to create PlainTransport for group ${groupId}:`, error);
    throw error;
  }
}

async function getOrCreateRouter(groupId) {
  let routerForGroup = routers.get(groupId);
  if (!routerForGroup) {
    routerForGroup = await createGroupRouter(groupId);
  }
  return routerForGroup;
}

async function createWebRtcTransport(groupId, socketId, direction = 'sendrecv') {
  try {
    let routerForGroup = routers.get(groupId);
    if (!routerForGroup) {
      routerForGroup = router;
      if (!routerForGroup) {
        throw new Error(`No router available for group ${groupId}`);
      }
    }

    const transport = await routerForGroup.createWebRtcTransport({
      listenIps: [
        {
          ip: config.listenIp,
          announcedIp: config.announcedIp
        }
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
      minimumAvailableOutgoingBitrate: 600000,
      maxSctpMessageSize: 262144,
      maxIncomingBitrate: 1500000
    });

    const transportId = `${groupId}_${socketId}_${Date.now()}`;
    transports.set(transportId, transport);

    logger.info(`WebRTC transport created for group ${groupId}, socket ${socketId}`);
    
    return {
      id: transportId,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters
    };
  } catch (error) {
    logger.error(`Failed to create WebRTC transport for group ${groupId}:`, error);
    throw error;
  }
}

async function createProducer(groupId, transportId, kind, rtpParameters) {
  try {
    const transport = transports.get(transportId);
    if (!transport) {
      throw new Error(`No transport found with ID ${transportId}`);
    }

    const producer = await transport.produce({
      kind,
      rtpParameters,
      appData: { ...(transport.appData || {}), groupId, transportId }
    });

    producers.set(producer.id, producer);

    // Add producer to audio level observer if it's audio
    if (kind === 'audio') {
      const audioLevelObserver = audioLevelObservers.get(groupId);
      if (audioLevelObserver) {
        await audioLevelObserver.addProducer({ producerId: producer.id });
      }
    }

    logger.info(`Producer created for group ${groupId}: ${producer.id}`);
    
    return {
      id: producer.id,
      kind: producer.kind,
      rtpParameters: producer.rtpParameters
    };
  } catch (error) {
    logger.error(`Failed to create producer for group ${groupId}:`, error);
    throw error;
  }
}

async function createConsumer(groupId, transportId, producerId, rtpCapabilities) {
  try {
    const transport = transports.get(transportId);
    if (!transport) {
      throw new Error(`No transport found with ID ${transportId}`);
    }

    const router = routers.get(groupId);
    if (!router) {
      throw new Error(`No router found for group ${groupId}`);
    }

    // Check if router can consume the producer
    if (!router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Router cannot consume this producer');
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false
    });

    consumers.set(consumer.id, consumer);

    logger.info(`Consumer created for group ${groupId}: ${consumer.id}`);
    
    return {
      id: consumer.id,
      producerId: consumer.producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      paused: consumer.paused
    };
  } catch (error) {
    logger.error(`Failed to create consumer for group ${groupId}:`, error);
    throw error;
  }
}

function getRouterRtpCapabilities(groupId) {
  try {
    const router = routers.get(groupId);
    if (!router) {
      throw new Error(`No router found for group ${groupId}`);
    }

    return router.rtpCapabilities;
  } catch (error) {
    logger.error(`Failed to get RTP capabilities for group ${groupId}:`, error);
    return {
      codecs: [],
      headerExtensions: [],
      fecMechanisms: []
    };
  }
}

async function getProducerStats(producerId) {
  try {
    const producer = producers.get(producerId);
    if (!producer) {
      return null;
    }

    return await producer.getStats();
  } catch (error) {
    // Producers can be closed between polling intervals; treat as expected.
    logger.warn(`Failed to get producer stats for ${producerId}: ${error?.message || error}`);
    return null;
  }
}

async function getConsumerStats(consumerId) {
  try {
    const consumer = consumers.get(consumerId);
    if (!consumer) {
      return null;
    }

    return await consumer.getStats();
  } catch (error) {
    // Consumers can be closed between polling intervals; treat as expected.
    logger.warn(`Failed to get consumer stats for ${consumerId}: ${error?.message || error}`);
    return null;
  }
}

async function closeTransport(transportId) {
  try {
    const transport = transports.get(transportId);
    if (!transport) {
      logger.warn(`No transport found with ID ${transportId}`);
      return;
    }

    transport.close();
    transports.delete(transportId);

    logger.info(`Transport closed: ${transportId}`);
  } catch (error) {
    logger.error(`Failed to close transport ${transportId}:`, error);
  }
}

async function closeProducer(producerId) {
  try {
    const producer = producers.get(producerId);
    if (!producer) {
      logger.warn(`No producer found with ID ${producerId}`);
      return;
    }

    producer.close();
    producers.delete(producerId);

    logger.info(`Producer closed: ${producerId}`);
  } catch (error) {
    logger.error(`Failed to close producer ${producerId}:`, error);
  }
}

async function closeConsumer(consumerId) {
  try {
    const consumer = consumers.get(consumerId);
    if (!consumer) {
      logger.warn(`No consumer found with ID ${consumerId}`);
      return;
    }

    consumer.close();
    consumers.delete(consumerId);
    
    logger.info(`Consumer closed: ${consumerId}`);
  } catch (error) {
    logger.error(`Failed to close consumer ${consumerId}:`, error);
  }
}

// SFU management and monitoring
function getProducersByGroup(groupId) {
  const producerList = [];
  for (const producer of producers.values()) {
    const producerGroupId = producer.appData?.groupId;
    if (!groupId || producerGroupId === groupId) {
      producerList.push({
        id: producer.id,
        kind: producer.kind,
        appData: producer.appData,
        score: producer.score,
      });
    }
  }
  return producerList;
}

async function getSFUStats() {
  try {
    const stats = {
      workers: workers.length,
      routers: routers.size,
      transports: transports.size,
      producers: producers.size,
      consumers: consumers.size,
      audioLevelObservers: audioLevelObservers.size,
      config: {
        numWorkers: config.numWorkers,
        rtcPorts: `${config.rtcMinPort}-${config.rtcMaxPort}`,
        listenIp: config.listenIp,
        announcedIp: config.announcedIp,
        maxConcurrentGroups: config.maxConcurrentGroups,
        maxParticipantsPerGroup: config.maxParticipantsPerGroup
      }
    };

    // Get worker stats
    if (workers.length > 0) {
      stats.workerStats = await Promise.all(
        workers.map(async (worker, index) => {
          try {
            const workerStats = await worker.getResourceUsage();
            return {
              index,
              pid: worker.pid,
              ...workerStats
            };
          } catch (error) {
            return {
              index,
              pid: worker.pid,
              error: error.message
            };
          }
        })
      );
    }

    return stats;
  } catch (error) {
    logger.error('Failed to get SFU stats:', error);
    return {
      error: error.message,
      workers: workers.length,
      routers: routers.size,
      transports: transports.size,
      producers: producers.size,
      consumers: consumers.size
    };
  }
}

async function cleanup() {
  try {
    logger.info('Cleaning up MediaSoup SFU...');

    // Close all consumers
    for (const [consumerId] of consumers) {
      await closeConsumer(consumerId);
    }

    // Close all producers
    for (const [producerId] of producers) {
      await closeProducer(producerId);
    }

    // Close all transports
    for (const [transportId] of transports) {
      await closeTransport(transportId);
    }

    // Close all routers
    for (const [groupId] of routers) {
      await deleteGroupRouter(groupId);
    }

    // Close all workers
    for (const worker of workers) {
      worker.close();
    }

    workers = [];
    routers.clear();
    transports.clear();
    producers.clear();
    consumers.clear();
    audioLevelObservers.clear();

    logger.info('MediaSoup SFU cleanup completed');
  } catch (error) {
    logger.error('Failed to cleanup MediaSoup SFU:', error);
  }
}

// Connect transport with DTLS parameters
async function connectTransport(transportId, dtlsParameters) {
  try {
    const transport = transports.get(transportId);
    if (!transport) {
      throw new Error(`Transport not found: ${transportId}`);
    }

    await transport.connect({ dtlsParameters });
    logger.info(`Transport connected: ${transportId}`);
    
    return true;
  } catch (error) {
    logger.error('Failed to connect transport:', error);
    throw error;
  }
}

// Produce media (audio/video)
async function produceMedia(transportId, kind, rtpParameters, appData = {}) {
  try {
    const transport = transports.get(transportId);
    if (!transport) {
      throw new Error(`Transport not found: ${transportId}`);
    }

    const producer = await transport.produce({
      kind,
      rtpParameters,
      appData
    });

    producers.set(producer.id, producer);

    producer.on('transportclose', () => {
      logger.info(`Producer transport closed: ${producer.id}`);
      producers.delete(producer.id);
    });

    logger.info(`Producer created: ${producer.id}, kind: ${kind}`);
    
    return producer;
  } catch (error) {
    logger.error('Failed to produce media:', error);
    throw error;
  }
}

function trackProducer(producer, groupId) {
  if (!producer) return producer;
  producer.appData = {
    ...(producer.appData || {}),
    groupId: groupId || producer.appData?.groupId,
  };
  producers.set(producer.id, producer);
  producer.on('transportclose', () => {
    producers.delete(producer.id);
  });
  return producer;
}

async function pipeProducerToRouter(sourceGroupId, producerId, targetGroupId) {
  const sourceRouter = await getOrCreateRouter(sourceGroupId);
  const targetRouter = await getOrCreateRouter(targetGroupId);
  if (!sourceRouter || !targetRouter) {
    throw new Error('Router unavailable for pipeToRouter');
  }

  const result = await sourceRouter.pipeToRouter({
    producerId,
    router: targetRouter,
  });

  if (result?.pipeProducer) {
    trackProducer(result.pipeProducer, targetGroupId);
  }

  return result;
}

async function closePipePair(pair) {
  if (!pair) return;
  try {
    if (pair.pipeConsumer) pair.pipeConsumer.close();
  } catch {}
  try {
    if (pair.pipeProducer) pair.pipeProducer.close();
  } catch {}
}

// Consume media (audio/video)
async function consumeMedia(transportId, producerId, rtpCapabilities) {
  try {
    const transport = transports.get(transportId);
    if (!transport) {
      throw new Error(`Transport not found: ${transportId}`);
    }

    const producer = producers.get(producerId);
    if (!producer) {
      throw new Error(`Producer not found: ${producerId}`);
    }

    // Check if router can consume
    const routerId = producer.appData?.routerId;
    const routerToUse = routerId ? routers.get(routerId) : router;
    
    if (!routerToUse) {
      throw new Error('Router not found');
    }

    if (!routerToUse.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Cannot consume producer');
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false
    });

    consumers.set(consumer.id, consumer);

    consumer.on('transportclose', () => {
      logger.info(`Consumer transport closed: ${consumer.id}`);
      consumers.delete(consumer.id);
    });

    consumer.on('producerclose', () => {
      logger.info(`Consumer producer closed: ${consumer.id}`);
      consumers.delete(consumer.id);
    });

    logger.info(`Consumer created: ${consumer.id}, producer: ${producerId}`);
    
    return consumer;
  } catch (error) {
    logger.error('Failed to consume media:', error);
    throw error;
  }
}

module.exports = {
  initializeMediaSoup,
  createGroupRouter,
  deleteGroupRouter,
  createPlainTransport,
  getOrCreateRouter,
  getTransportById,
  createWebRtcTransport,
  connectTransport,
  produceMedia,
  trackProducer,
  pipeProducerToRouter,
  closePipePair,
  consumeMedia,
  createProducer,
  createConsumer,
  getRouterRtpCapabilities,
  getProducerStats,
  getConsumerStats,
  closeTransport,
  closeProducer,
  closeConsumer,
  getProducersByGroup,
  getSFUStats,
  cleanup,
  getWorker: () => worker,
  getRouter: () => router,
  getGroupRouter,
  listGroupRouterIds,
};