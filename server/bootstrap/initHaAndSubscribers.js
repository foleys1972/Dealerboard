const { initializeServerRole } = require('../utils/serverRole');
const PublisherSubscriberService = require('../services/publisherSubscriberService');
const { initializeSubscriberService } = require('../services/subscriberService');
const SubscriberAudioRoutingService = require('../services/subscriberAudioRoutingService');
const { getOrchestratorService } = require('../services/orchestratorService');
const { getMatrixFederationService } = require('../services/matrixFederationService');
const { getUcSentinelDeliveryService } = require('../services/ucSentinelDeliveryService');
const { SubscriberHaService, parseSiteIdsFromEnv } = require('../services/subscriberHaService');
const { LineOwnershipService } = require('../services/lineOwnershipService');
const { pool } = require('../services/databaseService');
const logger = require('../utils/logger');

async function initHaAndSubscribers(server) {
  try {
    const serverRole = await initializeServerRole();

    try {
      const siteIds = parseSiteIdsFromEnv();
      const localUrl = server.computeLocalServerUrl();

      let preferredSiteIds = [];
      try {
        const preferred = await pool.query(
          `SELECT site_id
           FROM ha_site_subscriber_endpoints
           WHERE is_active = true AND priority = 0 AND server_url = $1`,
          [String(localUrl)]
        );
        preferredSiteIds = preferred.rows.map((r) => String(r.site_id)).filter(Boolean);
      } catch (e) {
        logger.warn('Failed to detect preferred HA sites for this node (DB query):', e?.message || e);
      }

      const ha = new SubscriberHaService({
        redisService: server.redisClient,
        serverId: serverRole.serverId,
        siteIds,
        preferredSiteIds,
      });
      await ha.start();
      server.app.locals.subscriberHaService = ha;
      server.app.locals.localServerUrl = localUrl;
      server.app.locals.siteIds = siteIds;
    } catch (e) {
      logger.warn('Subscriber HA initialization failed', e?.message || e);
      server.app.locals.subscriberHaService = null;
    }

    if (serverRole.enablePublisher) {
      server.publisherSubscriberService = new PublisherSubscriberService(server.server);
      await server.publisherSubscriberService.initialize();
      server.app.locals.publisherSubscriberService = server.publisherSubscriberService;
    }

    if (serverRole.enableSubscriber) {
      const subscriberService = await initializeSubscriberService();
      const subscriberAudioRouting = new SubscriberAudioRoutingService(subscriberService);
      await subscriberAudioRouting.initialize();
      subscriberService.setAudioRoutingService(subscriberAudioRouting);
      server.app.locals.subscriberAudioRouting = subscriberAudioRouting;

      try {
        const orchestratorService = getOrchestratorService();
        await orchestratorService.initialize();
        server.app.locals.orchestratorService = orchestratorService;
        logger.info('Orchestrator service initialized');
      } catch (error) {
        logger.warn('Orchestrator service initialization failed:', error.message);
      }

      try {
        const federationService = getMatrixFederationService();
        await federationService.initialize();
        server.app.locals.matrixFederationService = federationService;
        logger.info('Matrix federation service initialized');
      } catch (error) {
        logger.warn('Matrix federation service initialization failed:', error.message);
      }

      try {
        const ucSentinel = getUcSentinelDeliveryService();
        await ucSentinel.initialize();
        await ucSentinel.start();
        server.app.locals.ucSentinelDeliveryService = ucSentinel;
        logger.info('UC Sentinel delivery service initialized');
      } catch (e) {
        logger.warn('UC Sentinel delivery service initialization failed:', e?.message || e);
      }
    }

    try {
      if (process.env.SIP_HA_ENABLED === 'true' && server.redisClient && server.sipGateway && serverRole?.serverId) {
        const leaseTtlMs = parseInt(process.env.SIP_HA_LEASE_TTL_MS || '15000', 10) || 15000;
        const renewIntervalMs = parseInt(process.env.SIP_HA_RENEW_INTERVAL_MS || '5000', 10) || 5000;
        const refreshIntervalMs = parseInt(process.env.SIP_HA_REFRESH_INTERVAL_MS || '30000', 10) || 30000;

        const lineOwnership = new LineOwnershipService({
          redisService: server.redisClient,
          sipGateway: server.sipGateway,
          serverId: serverRole.serverId,
          leaseTtlMs,
          renewIntervalMs,
          refreshIntervalMs,
        });
        await lineOwnership.initialize();
        server.app.locals.lineOwnershipService = lineOwnership;
        logger.info('SIP line ownership service initialized');
      }
    } catch (e) {
      logger.warn('Failed to initialize SIP line ownership service:', e?.message || e);
    }
  } catch (error) {
    logger.warn('Server role initialization failed:', error.message);
  }
}

module.exports = { initHaAndSubscribers };
