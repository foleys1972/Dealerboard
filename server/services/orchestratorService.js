const logger = require('../utils/logger');
const { pool } = require('./databaseService');
const { getServerRole } = require('../utils/serverRole');
const axios = require('axios');

/**
 * Orchestrator Service - Managed by Subscribers
 * 
 * Responsibilities:
 * - Room creation logic (decide which homeserver to create room on)
 * - Geographic routing decisions (route users to nearest homeserver)
 * - Participant tracking across regions
 * - Federation coordination between homeservers
 * 
 * This service runs on subscriber servers and coordinates with:
 * - Publisher (for cross-region coordination)
 * - Other subscribers (for peer-to-peer coordination)
 * - Matrix homeservers (for room management)
 */
class OrchestratorService {
  constructor() {
    this.isInitialized = false;
    this.serverRole = null;
    this.region = null; // US, UK, APAC
    this.managedHomeservers = new Map(); // Map<homeserverId, homeserverInfo>
    this.roomAssignments = new Map(); // Map<roomId, homeserverId>
    this.participantTracking = new Map(); // Map<roomId, Set<participantInfo>>
    this.homeserverHealth = new Map(); // Map<homeserverId, healthStatus>
    this.circuitBreakers = new Map(); // Map<homeserverId, circuitBreakerState>
    this.orchestratorConfig = {};
  }

  async initialize() {
    if (this.isInitialized) {
      logger.warn('Orchestrator service already initialized');
      return;
    }

    try {
      // Get server role - orchestrator only runs on subscribers
      this.serverRole = await getServerRole();
      
      if (!this.serverRole.enableSubscriber) {
        logger.info('Orchestrator service only runs when subscriber capability is enabled');
        this.isInitialized = true;
        return;
      }

      // Load region from subscriber config or location
      await this.loadRegion();

      // Load managed homeservers for this subscriber
      await this.loadManagedHomeservers();

      // Load orchestrator configuration
      await this.loadOrchestratorConfig();

      // Start health monitoring for homeservers
      this.startHomeserverHealthMonitoring();

      this.isInitialized = true;
      logger.info('Orchestrator service initialized', {
        region: this.region,
        homeserverCount: this.managedHomeservers.size
      });
    } catch (error) {
      logger.error('Failed to initialize orchestrator service:', error);
      throw error;
    }
  }

  /**
   * Load region from subscriber configuration or location
   */
  async loadRegion() {
    try {
      if (!this.serverRole.serverId) {
        throw new Error('Server ID not configured');
      }

      // Get subscriber record
      const result = await pool.query(
        `SELECT s.*, l.region 
         FROM subscribers s
         LEFT JOIN locations l ON s.location_id = l.id
         WHERE s.server_id = $1`,
        [this.serverRole.serverId]
      );

      if (result.rows.length > 0) {
        const subscriber = result.rows[0];
        
        // Get region from location, config, or metadata
        this.region = subscriber.region || 
                     subscriber.config?.region || 
                     subscriber.metadata?.region ||
                     this.detectRegionFromLocation(subscriber.location_id);
        
        if (!this.region) {
          logger.warn('Region not configured for subscriber, defaulting to US');
          this.region = 'US';
        }
      } else {
        // Fallback to environment variable
        this.region = process.env.MATRIX_REGION || 'US';
      }

      logger.info(`Orchestrator region: ${this.region}`);
    } catch (error) {
      logger.error('Failed to load region:', error);
      this.region = process.env.MATRIX_REGION || 'US';
    }
  }

  /**
   * Detect region from location
   */
  detectRegionFromLocation(locationId) {
    if (!locationId) return null;
    
    // Simple heuristic - could be enhanced with location metadata
    const locationName = locationId.toLowerCase();
    if (locationName.includes('us') || locationName.includes('america') || locationName.includes('new york')) {
      return 'US';
    }
    if (locationName.includes('uk') || locationName.includes('london') || locationName.includes('europe')) {
      return 'UK';
    }
    if (locationName.includes('apac') || locationName.includes('asia') || locationName.includes('singapore') || locationName.includes('tokyo')) {
      return 'APAC';
    }
    return null;
  }

  /**
   * Load Matrix homeservers managed by this subscriber
   */
  async loadManagedHomeservers() {
    try {
      const result = await pool.query(
        `SELECT mh.*, l.region as location_region
         FROM matrix_homeservers mh
         LEFT JOIN locations l ON mh.location_id = l.id
         WHERE mh.subscriber_id = $1 AND mh.is_active = true
         ORDER BY mh.region, mh.server_name`,
        [this.serverRole.serverId]
      );

      this.managedHomeservers.clear();

      for (const row of result.rows) {
        const homeserver = {
          id: row.id,
          region: row.region || row.location_region || this.region,
          serverName: row.server_name,
          baseUrl: row.base_url,
          federationUrl: row.federation_url,
          isActive: row.is_active,
          capacity: row.capacity || 1000,
          currentLoad: row.current_load || 0,
          locationId: row.location_id,
          subscriberId: row.subscriber_id,
          isSelfHosted: row.is_self_hosted || false,
          externalProvider: row.external_provider || null,
          healthStatus: 'unknown',
          lastHealthCheck: null,
          metadata: row.metadata || {}
        };

        this.managedHomeservers.set(homeserver.id, homeserver);
        this.homeserverHealth.set(homeserver.id, {
          status: 'unknown',
          lastCheck: null,
          responseTime: null,
          errorCount: 0
        });
      }

      logger.info(`Loaded ${this.managedHomeservers.size} managed homeservers`);
    } catch (error) {
      logger.error('Failed to load managed homeservers:', error);
      // If table doesn't exist yet, that's okay - we'll create it
      if (error.message.includes('does not exist')) {
        logger.info('matrix_homeservers table does not exist yet - will be created during schema update');
      } else {
        throw error;
      }
    }
  }

  /**
   * Load orchestrator configuration
   */
  async loadOrchestratorConfig() {
    try {
      const result = await pool.query(
        `SELECT key, value FROM orchestrator_config`
      );

      this.orchestratorConfig = {};
      for (const row of result.rows) {
        try {
          this.orchestratorConfig[row.key] = JSON.parse(row.value);
        } catch {
          this.orchestratorConfig[row.key] = row.value;
        }
      }

      // Set defaults
      this.orchestratorConfig.roomPlacementStrategy = this.orchestratorConfig.roomPlacementStrategy || 'majority_region';
      this.orchestratorConfig.enableFailover = this.orchestratorConfig.enableFailover !== false;
      this.orchestratorConfig.healthCheckInterval = this.orchestratorConfig.healthCheckInterval || 30000; // 30 seconds
      this.orchestratorConfig.circuitBreakerThreshold = this.orchestratorConfig.circuitBreakerThreshold || 5; // Fail after 5 consecutive errors
      this.orchestratorConfig.circuitBreakerTimeout = this.orchestratorConfig.circuitBreakerTimeout || 60000; // 60 seconds before retry
      this.orchestratorConfig.maxRetries = this.orchestratorConfig.maxRetries || 3;
      this.orchestratorConfig.retryDelay = this.orchestratorConfig.retryDelay || 1000; // Base delay in ms
    } catch (error) {
      logger.error('Failed to load orchestrator config:', error);
      // Set defaults if table doesn't exist
      this.orchestratorConfig = {
        roomPlacementStrategy: 'majority_region',
        enableFailover: true,
        healthCheckInterval: 30000,
        circuitBreakerThreshold: 5,
        circuitBreakerTimeout: 60000,
        maxRetries: 3,
        retryDelay: 1000
      };
    }
  }

  /**
   * Start health monitoring for managed homeservers
   */
  startHomeserverHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    const interval = this.orchestratorConfig.healthCheckInterval || 30000;

    this.healthCheckTimer = setInterval(async () => {
      await this.checkHomeserverHealth();
    }, interval);

    // Initial check
    this.checkHomeserverHealth();
  }

  /**
   * Check health of all managed homeservers
   */
  async checkHomeserverHealth() {
    for (const [homeserverId, homeserver] of this.managedHomeservers.entries()) {
      // Skip if circuit breaker is open (unless timeout has passed)
      const circuitBreaker = this.circuitBreakers.get(homeserverId);
      if (circuitBreaker && circuitBreaker.state === 'open') {
        const timeSinceOpen = Date.now() - circuitBreaker.openedAt;
        if (timeSinceOpen < this.orchestratorConfig.circuitBreakerTimeout) {
          continue; // Circuit breaker still open, skip health check
        } else {
          // Timeout passed, attempt to close circuit breaker (half-open state)
          circuitBreaker.state = 'half-open';
          circuitBreaker.attemptCount = 0;
          logger.info(`Circuit breaker for ${homeserver.serverName} entering half-open state`);
        }
      }

      try {
        const startTime = Date.now();
        
        // Check homeserver health (simple ping to well-known endpoint)
        const healthUrl = `${homeserver.baseUrl}/_matrix/client/versions`;
        const response = await axios.get(healthUrl, {
          headers: { 'Accept': 'application/json' },
          timeout: 5000 // 5 second timeout
        });

        const responseTime = Date.now() - startTime;
        const isHealthy = response.status === 200;

        const health = this.homeserverHealth.get(homeserverId);
        if (!health) {
          this.homeserverHealth.set(homeserverId, {
            status: 'healthy',
            lastCheck: new Date(),
            responseTime: 0,
            errorCount: 0
          });
        }

        const currentHealth = this.homeserverHealth.get(homeserverId);
        currentHealth.status = isHealthy ? 'healthy' : 'unhealthy';
        currentHealth.lastCheck = new Date();
        currentHealth.responseTime = responseTime;
        
        if (isHealthy) {
          currentHealth.errorCount = 0;
          // Close circuit breaker if it was half-open
          if (circuitBreaker && circuitBreaker.state === 'half-open') {
            circuitBreaker.state = 'closed';
            circuitBreaker.attemptCount = 0;
            logger.info(`Circuit breaker for ${homeserver.serverName} closed (recovered)`);
          }
        } else {
          currentHealth.errorCount++;
          // Check if we should open circuit breaker
          if (currentHealth.errorCount >= this.orchestratorConfig.circuitBreakerThreshold) {
            if (!circuitBreaker || circuitBreaker.state !== 'open') {
              this.circuitBreakers.set(homeserverId, {
                state: 'open',
                openedAt: Date.now(),
                attemptCount: 0
              });
              logger.warn(`Circuit breaker opened for ${homeserver.serverName} (${currentHealth.errorCount} consecutive errors)`);
            }
          }
        }

        // Update homeserver current load if available
        if (isHealthy && response.headers['x-matrix-load']) {
          homeserver.currentLoad = parseInt(response.headers['x-matrix-load']) || 0;
        }

        logger.debug(`Homeserver ${homeserver.serverName} health: ${isHealthy ? 'healthy' : 'unhealthy'} (${responseTime}ms)`);
      } catch (error) {
        const health = this.homeserverHealth.get(homeserverId);
        if (!health) {
          this.homeserverHealth.set(homeserverId, {
            status: 'unhealthy',
            lastCheck: new Date(),
            responseTime: null,
            errorCount: 1
          });
        } else {
          health.status = 'unhealthy';
          health.lastCheck = new Date();
          health.errorCount++;
          
          // Check if we should open circuit breaker
          if (health.errorCount >= this.orchestratorConfig.circuitBreakerThreshold) {
            if (!circuitBreaker || circuitBreaker.state !== 'open') {
              this.circuitBreakers.set(homeserverId, {
                state: 'open',
                openedAt: Date.now(),
                attemptCount: 0
              });
              logger.warn(`Circuit breaker opened for ${homeserver.serverName} (${health.errorCount} consecutive errors)`);
            }
          }
        }
        logger.warn(`Homeserver ${homeserver.serverName} health check failed:`, error.message);
      }
    }
  }

  /**
   * Determine which homeserver to create a room on
   * Strategy: Majority region (where most participants are located)
   */
  async selectHomeserverForRoom(participantIds, roomMetadata = {}) {
    try {
      if (this.managedHomeservers.size === 0) {
        throw new Error('No homeservers managed by this subscriber');
      }

      // Get participant regions
      const participantRegions = await this.getParticipantRegions(participantIds);
      
      // Count participants by region
      const regionCounts = {};
      for (const region of participantRegions) {
        regionCounts[region] = (regionCounts[region] || 0) + 1;
      }

      // Find majority region
      let majorityRegion = this.region; // Default to subscriber's region
      let maxCount = 0;
      for (const [region, count] of Object.entries(regionCounts)) {
        if (count > maxCount) {
          maxCount = count;
          majorityRegion = region;
        }
      }

      // If tie, prefer subscriber's region
      if (maxCount === 0 || (regionCounts[this.region] && regionCounts[this.region] === maxCount)) {
        majorityRegion = this.region;
      }

      logger.info(`Room placement decision: majority region = ${majorityRegion}`, {
        participantRegions,
        regionCounts
      });

      // Find best homeserver in majority region
      const candidateHomeservers = Array.from(this.managedHomeservers.values())
        .filter(hs => hs.region === majorityRegion && hs.isActive);

      if (candidateHomeservers.length === 0) {
        // Fallback to any available homeserver
        logger.warn(`No homeservers in majority region ${majorityRegion}, using any available`);
        const allHomeservers = Array.from(this.managedHomeservers.values())
          .filter(hs => hs.isActive);
        
        if (allHomeservers.length === 0) {
          throw new Error('No active homeservers available');
        }
        const selected = this.selectBestHomeserver(allHomeservers);
        
        // Verify selected homeserver is available (not circuit breaker open)
        if (!this.isHomeserverAvailable(selected.id)) {
          // Try failover
          const failover = await this.getFailoverHomeserver(selected.id, majorityRegion);
          if (failover) {
            logger.info(`Automatic failover during room creation: ${selected.serverName} -> ${failover.serverName}`);
            return failover;
          }
        }
        
        return selected;
      }

      const selected = this.selectBestHomeserver(candidateHomeservers);
      
      // Verify selected homeserver is available (not circuit breaker open)
      if (!this.isHomeserverAvailable(selected.id)) {
        // Try failover within same region
        const failover = await this.getFailoverHomeserver(selected.id, majorityRegion);
        if (failover) {
          logger.info(`Automatic failover during room creation: ${selected.serverName} -> ${failover.serverName}`);
          return failover;
        }
      }
      
      return selected;
    } catch (error) {
      logger.error('Failed to select homeserver for room:', error);
      throw error;
    }
  }

  /**
   * Select best homeserver from candidates based on load and health
   * Excludes homeservers with open circuit breakers
   */
  selectBestHomeserver(candidates) {
    // Filter to healthy homeservers with closed circuit breakers
    const healthyCandidates = candidates.filter(hs => {
      const health = this.homeserverHealth.get(hs.id);
      const circuitBreaker = this.circuitBreakers.get(hs.id);
      
      // Exclude if circuit breaker is open
      if (circuitBreaker && circuitBreaker.state === 'open') {
        return false;
      }
      
      // Prefer healthy homeservers
      return health && health.status === 'healthy';
    });

    // If no healthy candidates, allow half-open circuit breakers (recovery attempts)
    const candidatesToUse = healthyCandidates.length > 0 
      ? healthyCandidates 
      : candidates.filter(hs => {
          const circuitBreaker = this.circuitBreakers.get(hs.id);
          return !circuitBreaker || circuitBreaker.state !== 'open';
        });

    if (candidatesToUse.length === 0) {
      // Last resort: use any candidate (even with open circuit breaker)
      return candidates[0];
    }

    // Sort by load (ascending) and select lowest load
    candidatesToUse.sort((a, b) => {
      const loadA = a.currentLoad / a.capacity;
      const loadB = b.currentLoad / b.capacity;
      return loadA - loadB;
    });

    return candidatesToUse[0];
  }

  /**
   * Check if a homeserver is available (not circuit breaker open)
   */
  isHomeserverAvailable(homeserverId) {
    const circuitBreaker = this.circuitBreakers.get(homeserverId);
    if (circuitBreaker && circuitBreaker.state === 'open') {
      const timeSinceOpen = Date.now() - circuitBreaker.openedAt;
      if (timeSinceOpen < this.orchestratorConfig.circuitBreakerTimeout) {
        return false; // Circuit breaker still open
      }
      // Timeout passed, allow half-open attempts
    }
    return true;
  }

  /**
   * Execute operation with retry and failover
   */
  async executeWithResilience(operation, primaryHomeserverId, region, maxRetries = null) {
    const retries = maxRetries || this.orchestratorConfig.maxRetries;
    let lastError = null;
    let currentHomeserverId = primaryHomeserverId;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Check if current homeserver is available
        if (!this.isHomeserverAvailable(currentHomeserverId)) {
          // Try failover
          const failoverHomeserver = await this.getFailoverHomeserver(currentHomeserverId, region);
          if (failoverHomeserver && failoverHomeserver.id !== currentHomeserverId) {
            logger.info(`Failover attempt ${attempt + 1}: ${currentHomeserverId} -> ${failoverHomeserver.id}`);
            currentHomeserverId = failoverHomeserver.id;
          }
        }

        // Execute operation
        const result = await operation(currentHomeserverId);
        
        // Success - reset circuit breaker if it was half-open
        const circuitBreaker = this.circuitBreakers.get(currentHomeserverId);
        if (circuitBreaker && circuitBreaker.state === 'half-open') {
          circuitBreaker.state = 'closed';
          circuitBreaker.attemptCount = 0;
          logger.info(`Circuit breaker closed for homeserver ${currentHomeserverId} after successful operation`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        // Update circuit breaker on failure
        const circuitBreaker = this.circuitBreakers.get(currentHomeserverId);
        if (circuitBreaker && circuitBreaker.state === 'half-open') {
          // Half-open attempt failed, reopen circuit breaker
          circuitBreaker.state = 'open';
          circuitBreaker.openedAt = Date.now();
          logger.warn(`Circuit breaker reopened for homeserver ${currentHomeserverId} after failed half-open attempt`);
        }
        
        // If not last attempt, try failover
        if (attempt < retries) {
          try {
            const failoverHomeserver = await this.getFailoverHomeserver(currentHomeserverId, region);
            if (failoverHomeserver && failoverHomeserver.id !== currentHomeserverId) {
              logger.info(`Retry attempt ${attempt + 1} with failover: ${currentHomeserverId} -> ${failoverHomeserver.id}`);
              currentHomeserverId = failoverHomeserver.id;
              
              // Exponential backoff
              const delay = this.orchestratorConfig.retryDelay * Math.pow(2, attempt);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          } catch (failoverError) {
            logger.warn('Failover attempt failed:', failoverError.message);
          }
        }
        
        // Exponential backoff before retry
        if (attempt < retries) {
          const delay = this.orchestratorConfig.retryDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Operation failed after all retries');
  }

  /**
   * Get regions for a list of participant IDs
   */
  async getParticipantRegions(participantIds) {
    try {
      if (!participantIds || participantIds.length === 0) {
        return [this.region]; // Default to subscriber's region
      }

      const result = await pool.query(
        `SELECT u.id, u.region, l.region as location_region
         FROM users u
         LEFT JOIN locations l ON u.location_id = l.id
         WHERE u.id = ANY($1::text[])`,
        [participantIds]
      );

      const regions = [];
      for (const row of result.rows) {
        const region = row.region || row.location_region || this.region;
        regions.push(region);
      }

      // Fill missing participants with default region
      while (regions.length < participantIds.length) {
        regions.push(this.region);
      }

      return regions;
    } catch (error) {
      logger.error('Failed to get participant regions:', error);
      // Return default region for all participants
      return new Array(participantIds.length).fill(this.region);
    }
  }

  /**
   * Get assigned homeserver for a user
   */
  async getUserHomeserver(userId) {
    try {
      // Check user's explicit assignment
      const result = await pool.query(
        `SELECT uha.homeserver_id, mh.*
         FROM user_homeserver_assignments uha
         INNER JOIN matrix_homeservers mh ON uha.homeserver_id = mh.id
         WHERE uha.user_id = $1 AND uha.is_primary = true
         LIMIT 1`,
        [userId]
      );

      if (result.rows.length > 0) {
        const assignment = result.rows[0];
        const homeserver = this.managedHomeservers.get(assignment.homeserver_id);
        if (homeserver && homeserver.isActive) {
          return homeserver;
        }
      }

      // Auto-assign based on user's region
      const userRegion = await this.getUserRegion(userId);
      const regionalHomeservers = Array.from(this.managedHomeservers.values())
        .filter(hs => hs.region === userRegion && hs.isActive);

      if (regionalHomeservers.length > 0) {
        return this.selectBestHomeserver(regionalHomeservers);
      }

      // Fallback to any available homeserver
      const allHomeservers = Array.from(this.managedHomeservers.values())
        .filter(hs => hs.isActive);
      
      if (allHomeservers.length === 0) {
        // In single-node / early-boot scenarios the orchestrator may not have any managed homeservers yet.
        // Callers should be able to fall back to the publisher base URL without failing auth flows.
        return null;
      }

      return this.selectBestHomeserver(allHomeservers);
    } catch (error) {
      logger.error('Failed to get user homeserver:', error);
      throw error;
    }
  }

  /**
   * Get user's region
   */
  async getUserRegion(userId) {
    try {
      const result = await pool.query(
        `SELECT u.region, l.region as location_region
         FROM users u
         LEFT JOIN locations l ON u.location_id = l.id
         WHERE u.id = $1`,
        [userId]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        return row.region || row.location_region || this.region;
      }

      return this.region;
    } catch (error) {
      logger.error('Failed to get user region:', error);
      return this.region;
    }
  }

  /**
   * Track participant in a room (cross-region tracking)
   */
  async trackParticipant(roomId, userId, homeserverId) {
    try {
      if (!this.participantTracking.has(roomId)) {
        this.participantTracking.set(roomId, new Set());
      }

      const participants = this.participantTracking.get(roomId);
      participants.add({
        userId,
        homeserverId,
        joinedAt: new Date(),
        region: await this.getUserRegion(userId)
      });

      // Persist to database
      await pool.query(
        `INSERT INTO matrix_room_participants (room_id, user_id, homeserver_id, joined_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (room_id, user_id) DO UPDATE SET
           homeserver_id = EXCLUDED.homeserver_id,
           last_seen = NOW()`,
        [roomId, userId, homeserverId]
      );
    } catch (error) {
      logger.error('Failed to track participant:', error);
    }
  }

  /**
   * Get all participants for a room (cross-region)
   */
  async getRoomParticipants(roomId) {
    try {
      const result = await pool.query(
        `SELECT mrp.*, u.username, u.display_name, u.region, mh.region as homeserver_region
         FROM matrix_room_participants mrp
         INNER JOIN users u ON mrp.user_id = u.id
         INNER JOIN matrix_homeservers mh ON mrp.homeserver_id = mh.id
         WHERE mrp.room_id = $1`,
        [roomId]
      );

      return result.rows.map(row => ({
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
        region: row.region || row.homeserver_region,
        homeserverId: row.homeserver_id,
        joinedAt: row.joined_at,
        lastSeen: row.last_seen
      }));
    } catch (error) {
      logger.error('Failed to get room participants:', error);
      // Fallback to in-memory tracking
      const participants = this.participantTracking.get(roomId);
      if (participants) {
        return Array.from(participants);
      }
      return [];
    }
  }

  /**
   * Coordinate room creation with other subscribers (via publisher)
   * This is called when we need to coordinate cross-region
   */
  async coordinateRoomCreation(roomData, participantIds) {
    try {
      // For now, this subscriber makes the decision
      // In future, could coordinate with publisher/other subscribers
      const selectedHomeserver = await this.selectHomeserverForRoom(participantIds, roomData);
      
      return {
        homeserverId: selectedHomeserver.id,
        homeserver: selectedHomeserver,
        region: selectedHomeserver.region,
        decision: 'majority_region'
      };
    } catch (error) {
      logger.error('Failed to coordinate room creation:', error);
      throw error;
    }
  }

  /**
   * Handle failover - select alternative homeserver if primary is down
   */
  async getFailoverHomeserver(primaryHomeserverId, region) {
    try {
      const primary = this.managedHomeservers.get(primaryHomeserverId);
      if (!primary) {
        throw new Error('Primary homeserver not found');
      }

      const health = this.homeserverHealth.get(primaryHomeserverId);
      if (health && health.status === 'healthy') {
        return primary; // Primary is healthy, no failover needed
      }

      // Find alternative in same region
      const alternatives = Array.from(this.managedHomeservers.values())
        .filter(hs => hs.region === region && 
                     hs.id !== primaryHomeserverId && 
                     hs.isActive);

      if (alternatives.length > 0) {
        const selected = this.selectBestHomeserver(alternatives);
        logger.info(`Failover: ${primary.serverName} -> ${selected.serverName}`);
        return selected;
      }

      // Fallback to any region
      const anyAlternatives = Array.from(this.managedHomeservers.values())
        .filter(hs => hs.id !== primaryHomeserverId && hs.isActive);

      if (anyAlternatives.length > 0) {
        const selected = this.selectBestHomeserver(anyAlternatives);
        logger.warn(`Failover to different region: ${primary.serverName} (${primary.region}) -> ${selected.serverName} (${selected.region})`);
        return selected;
      }

      throw new Error('No failover homeservers available');
    } catch (error) {
      logger.error('Failed to get failover homeserver:', error);
      throw error;
    }
  }

  /**
   * Get circuit breaker status for all homeservers
   */
  getCircuitBreakerStatus() {
    const status = {};
    for (const [homeserverId, circuitBreaker] of this.circuitBreakers.entries()) {
      const homeserver = this.managedHomeservers.get(homeserverId);
      const health = this.homeserverHealth.get(homeserverId);
      
      status[homeserverId] = {
        homeserverName: homeserver?.serverName,
        state: circuitBreaker.state,
        openedAt: circuitBreaker.openedAt,
        timeSinceOpen: circuitBreaker.state === 'open' 
          ? Date.now() - circuitBreaker.openedAt 
          : null,
        healthStatus: health?.status,
        errorCount: health?.errorCount || 0
      };
    }
    return status;
  }

  /**
   * Get orchestrator status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      region: this.region,
      managedHomeservers: Array.from(this.managedHomeservers.values()).map(hs => ({
        id: hs.id,
        serverName: hs.serverName,
        region: hs.region,
        isActive: hs.isActive,
        currentLoad: hs.currentLoad,
        capacity: hs.capacity,
        health: this.homeserverHealth.get(hs.id) || { status: 'unknown' },
        circuitBreaker: this.circuitBreakers.get(hs.id) || { state: 'closed' }
      })),
      circuitBreakers: this.getCircuitBreakerStatus(),
      config: this.orchestratorConfig
    };
  }
}

// Singleton instance
let orchestratorServiceInstance = null;

function getOrchestratorService() {
  if (!orchestratorServiceInstance) {
    orchestratorServiceInstance = new OrchestratorService();
  }
  return orchestratorServiceInstance;
}

module.exports = {
  OrchestratorService,
  getOrchestratorService,
  orchestratorService: getOrchestratorService()
};

