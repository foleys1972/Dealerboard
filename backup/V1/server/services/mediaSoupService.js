const logger = require('../utils/logger');
const mediasoup = require('mediasoup');

let worker = null;
let router = null;
let workers = [];
let routers = new Map(); // Group ID -> Router mapping
let transports = new Map(); // Transport ID -> Transport mapping
let producers = new Map(); // Producer ID -> Producer mapping
let consumers = new Map(); // Consumer ID -> Consumer mapping
let audioLevelObservers = new Map(); // Group ID -> AudioLevelObserver mapping

const config = {
  numWorkers: process.env.MEDIASOUP_NUM_WORKERS || 4,
  rtcMinPort: parseInt(process.env.RTC_MIN_PORT) || 10000,
  rtcMaxPort: parseInt(process.env.RTC_MAX_PORT) || 20000,
  listenIp: process.env.LISTEN_IP || '0.0.0.0',
  announcedIp: process.env.ANNOUNCED_IP || null,
  logLevel: process.env.MEDIASOUP_LOG_LEVEL || 'warn',
  maxConcurrentGroups: process.env.MAX_CONCURRENT_GROUPS || 50,
  maxParticipantsPerGroup: process.env.MAX_PARTICIPANTS_PER_GROUP || 300,
};

async function initializeMediaSoup() {
  try {
    logger.info('Initializing MediaSoup SFU...', {
      numWorkers: config.numWorkers,
      rtcPorts: `${config.rtcMinPort}-${config.rtcMaxPort}`,
      listenIp: config.listenIp,
      announcedIp: config.announcedIp
    });

    // Create workers
    for (let i = 0; i < config.numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        logLevel: config.logLevel,
        rtcMinPort: config.rtcMinPort,
        rtcMaxPort: config.rtcMaxPort,
        dtlsCertificateFile: process.env.DTLS_CERT_FILE,
        dtlsPrivateKeyFile: process.env.DTLS_PRIVATE_KEY_FILE,
      });

      worker.on('died', () => {
        logger.error('MediaSoup worker died, exiting in 2 seconds...');
        setTimeout(() => process.exit(1), 2000);
      });

      workers.push(worker);
      logger.info(`MediaSoup worker ${i + 1} created`);
    }

    // Use the first worker as the main worker for now
    worker = workers[0];

    // Create a default router for basic operations (non group-specific flows)
    router = await worker.createRouter({
      mediaCodecs: [
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
      ],
    });

    logger.info('MediaSoup SFU initialized successfully', {
      workers: workers.length,
      rtcPorts: `${config.rtcMinPort}-${config.rtcMaxPort}`,
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
      logger.warn(`Router already exists for group ${groupId}`);
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
      throw new Error(`No producer found with ID ${producerId}`);
    }

    return await producer.getStats();
  } catch (error) {
    logger.error(`Failed to get producer stats for ${producerId}:`, error);
    return {};
  }
}

async function getConsumerStats(consumerId) {
  try {
    const consumer = consumers.get(consumerId);
    if (!consumer) {
      throw new Error(`No consumer found with ID ${consumerId}`);
    }

    return await consumer.getStats();
  } catch (error) {
    logger.error(`Failed to get consumer stats for ${consumerId}:`, error);
    return {};
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
  createWebRtcTransport,
  connectTransport,
  produceMedia,
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
};