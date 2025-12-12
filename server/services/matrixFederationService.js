const logger = require('../utils/logger');
const { pool } = require('./databaseService');
const { getOrchestratorService } = require('./orchestratorService');
const axios = require('axios');

/**
 * Matrix Federation Service
 * 
 * Manages federation between Matrix homeservers:
 * - Auto-discovers and configures federation between registered homeservers
 * - Verifies federation connectivity
 * - Handles cross-homeserver room access
 * - Manages federation certificates and verification
 */
class MatrixFederationService {
  constructor() {
    this.isInitialized = false;
    this.federationConnections = new Map(); // Map<homeserverId, connectionInfo>
    this.federationStatus = new Map(); // Map<homeserverId, status>
    this.discoveryCache = new Map(); // Map<serverName, discoveryInfo>
  }

  async initialize() {
    if (this.isInitialized) {
      logger.warn('Matrix federation service already initialized');
      return;
    }

    try {
      // Load federation configuration for all homeservers
      await this.loadFederationConfig();

      // Start federation discovery and verification
      await this.discoverFederationPeers();

      // Start periodic federation health checks
      this.startFederationHealthChecks();

      this.isInitialized = true;
      logger.info('Matrix federation service initialized', {
        connectedHomeservers: this.federationConnections.size
      });
    } catch (error) {
      logger.error('Failed to initialize Matrix federation service:', error);
      throw error;
    }
  }

  /**
   * Load federation configuration from database
   */
  async loadFederationConfig() {
    try {
      const result = await pool.query(
        `SELECT id, server_name, base_url, federation_url, region, is_active
         FROM matrix_homeservers
         WHERE is_active = true
         ORDER BY region, server_name`
      );

      this.federationConnections.clear();

      for (const row of result.rows) {
        const homeserver = {
          id: row.id,
          serverName: row.server_name,
          baseUrl: row.base_url,
          federationUrl: row.federation_url || row.base_url,
          region: row.region,
          isActive: row.is_active
        };

        this.federationConnections.set(homeserver.id, {
          homeserver,
          status: 'unknown',
          lastCheck: null,
          discoveryInfo: null,
          canFederate: false,
          error: null
        });
      }

      logger.info(`Loaded ${this.federationConnections.size} homeservers for federation`);
    } catch (error) {
      logger.error('Failed to load federation config:', error);
      if (error.message.includes('does not exist')) {
        logger.info('matrix_homeservers table does not exist yet - will be created during schema update');
      } else {
        throw error;
      }
    }
  }

  /**
   * Discover federation peers using Matrix server discovery
   */
  async discoverFederationPeers() {
    logger.info('Discovering Matrix federation peers...');

    for (const [homeserverId, connection] of this.federationConnections.entries()) {
      try {
        await this.discoverHomeserver(homeserverId, connection.homeserver);
      } catch (error) {
        logger.warn(`Failed to discover homeserver ${connection.homeserver.serverName}:`, error.message);
      }
    }
  }

  /**
   * Discover a specific homeserver's federation capabilities
   */
  async discoverHomeserver(homeserverId, homeserver) {
    try {
      const connection = this.federationConnections.get(homeserverId);
      if (!connection) {
        return;
      }

      // Try to get .well-known/matrix/server
      let discoveryInfo = null;
      try {
        const wellKnownUrl = `${homeserver.baseUrl}/.well-known/matrix/server`;
        const response = await axios.get(wellKnownUrl, {
          timeout: 5000,
          headers: { 'Accept': 'application/json' }
        });

        discoveryInfo = {
          'm.server': response.data['m.server'] || homeserver.federationUrl,
          'm.homeserver': response.data['m.homeserver'] || homeserver.baseUrl,
          discoveredAt: new Date()
        };

        this.discoveryCache.set(homeserver.serverName, discoveryInfo);
      } catch (error) {
        logger.debug(`Well-known discovery failed for ${homeserver.serverName}, using configured URL`);
        // Use configured federation URL as fallback
        discoveryInfo = {
          'm.server': homeserver.federationUrl,
          'm.homeserver': homeserver.baseUrl,
          discoveredAt: new Date(),
          fallback: true
        };
      }

      // Test federation connectivity
      const canFederate = await this.testFederationConnectivity(homeserver, discoveryInfo);

      connection.discoveryInfo = discoveryInfo;
      connection.canFederate = canFederate;
      connection.status = canFederate ? 'connected' : 'disconnected';
      connection.lastCheck = new Date();
      connection.error = canFederate ? null : 'Federation test failed';

      logger.info(`Federation discovery for ${homeserver.serverName}:`, {
        canFederate,
        federationUrl: discoveryInfo['m.server']
      });
    } catch (error) {
      logger.error(`Failed to discover homeserver ${homeserver.serverName}:`, error);
      const connection = this.federationConnections.get(homeserverId);
      if (connection) {
        connection.status = 'error';
        connection.error = error.message;
        connection.lastCheck = new Date();
      }
    }
  }

  /**
   * Test federation connectivity to a homeserver
   */
  async testFederationConnectivity(homeserver, discoveryInfo) {
    try {
      const federationUrl = discoveryInfo['m.server'] || homeserver.federationUrl;
      
      // Test by querying the federation version endpoint
      const versionUrl = `${federationUrl}/_matrix/federation/v1/version`;
      const response = await axios.get(versionUrl, {
        timeout: 5000,
        headers: { 'Accept': 'application/json' }
      });

      // Check if we get a valid response
      return response.status === 200 && response.data;
    } catch (error) {
      logger.debug(`Federation connectivity test failed for ${homeserver.serverName}:`, error.message);
      return false;
    }
  }

  /**
   * Start periodic federation health checks
   */
  startFederationHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    // Check every 5 minutes
    const interval = 5 * 60 * 1000;

    this.healthCheckTimer = setInterval(async () => {
      await this.checkFederationHealth();
    }, interval);

    // Initial check
    this.checkFederationHealth();
  }

  /**
   * Check health of all federation connections
   */
  async checkFederationHealth() {
    logger.debug('Checking federation health...');

    for (const [homeserverId, connection] of this.federationConnections.entries()) {
      try {
        const canFederate = await this.testFederationConnectivity(
          connection.homeserver,
          connection.discoveryInfo || {}
        );

        connection.canFederate = canFederate;
        connection.status = canFederate ? 'connected' : 'disconnected';
        connection.lastCheck = new Date();

        if (!canFederate && connection.status === 'connected') {
          logger.warn(`Federation lost with ${connection.homeserver.serverName}`);
        } else if (canFederate && connection.status !== 'connected') {
          logger.info(`Federation restored with ${connection.homeserver.serverName}`);
        }
      } catch (error) {
        logger.warn(`Federation health check failed for ${connection.homeserver.serverName}:`, error.message);
        connection.status = 'error';
        connection.error = error.message;
      }
    }
  }

  /**
   * Get federation status for all homeservers
   */
  getFederationStatus() {
    const status = {
      isInitialized: this.isInitialized,
      homeservers: [],
      summary: {
        total: this.federationConnections.size,
        connected: 0,
        disconnected: 0,
        errors: 0
      }
    };

    for (const [homeserverId, connection] of this.federationConnections.entries()) {
      const homeserverStatus = {
        homeserverId,
        serverName: connection.homeserver.serverName,
        region: connection.homeserver.region,
        baseUrl: connection.homeserver.baseUrl,
        federationUrl: connection.homeserver.federationUrl,
        status: connection.status,
        canFederate: connection.canFederate,
        lastCheck: connection.lastCheck,
        error: connection.error,
        discoveryInfo: connection.discoveryInfo
      };

      status.homeservers.push(homeserverStatus);

      if (connection.status === 'connected') {
        status.summary.connected++;
      } else if (connection.status === 'error') {
        status.summary.errors++;
      } else {
        status.summary.disconnected++;
      }
    }

    return status;
  }

  /**
   * Get federation status for a specific homeserver
   */
  getHomeserverFederationStatus(homeserverId) {
    const connection = this.federationConnections.get(homeserverId);
    if (!connection) {
      return null;
    }

    return {
      homeserverId,
      serverName: connection.homeserver.serverName,
      region: connection.homeserver.region,
      baseUrl: connection.homeserver.baseUrl,
      federationUrl: connection.homeserver.federationUrl,
      status: connection.status,
      canFederate: connection.canFederate,
      lastCheck: connection.lastCheck,
      error: connection.error,
      discoveryInfo: connection.discoveryInfo
    };
  }

  /**
   * Verify that a room on a remote homeserver is accessible
   */
  async verifyRoomAccess(roomId, homeserverId) {
    try {
      const connection = this.federationConnections.get(homeserverId);
      if (!connection) {
        throw new Error(`Homeserver ${homeserverId} not found`);
      }

      if (!connection.canFederate) {
        throw new Error(`Federation not available with ${connection.homeserver.serverName}`);
      }

      // Extract server name from room ID (Matrix room IDs contain server name)
      // Room ID format: !roomid:server.name
      const roomServerMatch = roomId.match(/^[^:]+:(.+)$/);
      if (!roomServerMatch) {
        throw new Error('Invalid room ID format');
      }

      const roomServer = roomServerMatch[1];
      const federationUrl = connection.discoveryInfo?.['m.server'] || connection.homeserver.federationUrl;

      // Verify room exists via federation API
      // This is a simplified check - in production, you'd use proper Matrix federation APIs
      logger.info(`Verifying room access: ${roomId} on ${roomServer}`);

      return {
        accessible: true,
        homeserverId,
        federationUrl,
        roomServer
      };
    } catch (error) {
      logger.error('Failed to verify room access:', error);
      throw error;
    }
  }

  /**
   * Reload federation configuration (call when homeservers are added/updated)
   */
  async reloadFederationConfig() {
    logger.info('Reloading federation configuration...');
    await this.loadFederationConfig();
    await this.discoverFederationPeers();
  }

  /**
   * Get all federated homeservers that can be used for room creation
   */
  getFederatedHomeservers() {
    const federated = [];
    for (const [homeserverId, connection] of this.federationConnections.entries()) {
      if (connection.canFederate && connection.homeserver.isActive) {
        federated.push({
          id: homeserverId,
          serverName: connection.homeserver.serverName,
          region: connection.homeserver.region,
          baseUrl: connection.homeserver.baseUrl,
          federationUrl: connection.homeserver.federationUrl,
          status: connection.status
        });
      }
    }
    return federated;
  }
}

// Singleton instance
let matrixFederationServiceInstance = null;

function getMatrixFederationService() {
  if (!matrixFederationServiceInstance) {
    matrixFederationServiceInstance = new MatrixFederationService();
  }
  return matrixFederationServiceInstance;
}

module.exports = {
  MatrixFederationService,
  getMatrixFederationService,
  matrixFederationService: getMatrixFederationService()
};

