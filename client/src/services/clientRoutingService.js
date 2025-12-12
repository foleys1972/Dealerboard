/**
 * Client Routing Service
 * 
 * Handles routing clients to their assigned regional homeserver
 * - Detects user's region and assigned homeserver
 * - Routes API calls to appropriate server
 * - Handles failover to backup homeservers
 * - Manages connection health and automatic failover
 */

class ClientRoutingService {
  constructor() {
    this.currentHomeserver = null;
    this.failoverHomeservers = [];
    this.healthStatus = new Map(); // Map<homeserverId, status>
    this.isInitialized = false;
    // Default to explicit API URL, fallback to localhost:5000 if not set
    this.apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    this.defaultApiBase = this.apiBaseUrl;
  }

  /**
   * Initialize client routing with user's homeserver info
   */
  async initialize(user) {
    if (this.isInitialized && this.currentHomeserver?.id === user?.matrixHomeserver?.id) {
      return; // Already initialized with same homeserver
    }

    try {
      // Get user's assigned homeserver from login response
      if (user?.matrixHomeserver) {
        this.currentHomeserver = {
          id: user.matrixHomeserver.id,
          baseUrl: user.matrixHomeserver.baseUrl,
          region: user.matrixHomeserver.region,
          serverName: user.matrixHomeserver.serverName,
          federationUrl: user.matrixHomeserver.federationUrl
        };

        // Fetch backup homeservers for failover
        await this.loadFailoverHomeservers(user.region || user.matrixHomeserver.region);

        // Start health monitoring
        this.startHealthMonitoring();

        this.isInitialized = true;
        console.log('Client routing initialized:', {
          homeserver: this.currentHomeserver.serverName,
          region: this.currentHomeserver.region
        });
      } else {
        // No homeserver assigned, use default
        console.warn('No homeserver assigned to user, using default API URL');
        this.currentHomeserver = {
          id: 'default',
          baseUrl: this.defaultApiBase,
          region: 'US',
          serverName: 'Default Server'
        };
        this.isInitialized = true;
      }
    } catch (error) {
      console.error('Failed to initialize client routing:', error);
      // Fallback to default
      this.currentHomeserver = {
        id: 'default',
        baseUrl: this.defaultApiBase,
        region: 'US',
        serverName: 'Default Server'
      };
      this.isInitialized = true;
    }
  }

  /**
   * Load failover homeservers for the user's region
   */
  async loadFailoverHomeservers(region) {
    try {
      const response = await fetch(`${this.defaultApiBase}/api/matrix/homeservers?region=${region}`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const homeservers = data.homeservers || [];
        
        // Filter out current homeserver and get active ones
        this.failoverHomeservers = homeservers
          .filter(hs => hs.id !== this.currentHomeserver?.id && hs.isActive)
          .map(hs => ({
            id: hs.id,
            baseUrl: hs.baseUrl,
            region: hs.region,
            serverName: hs.serverName,
            federationUrl: hs.federationUrl
          }));

        console.log(`Loaded ${this.failoverHomeservers.length} failover homeservers for region ${region}`);
      }
    } catch (error) {
      console.warn('Failed to load failover homeservers:', error);
      this.failoverHomeservers = [];
    }
  }

  /**
   * Get the current API base URL (with failover support)
   */
  getApiBaseUrl() {
    if (!this.isInitialized) {
      return this.defaultApiBase;
    }

    // Check if current homeserver is healthy
    const health = this.healthStatus.get(this.currentHomeserver?.id);
    if (health && health.status === 'unhealthy' && this.failoverHomeservers.length > 0) {
      // Try failover homeserver
      const failover = this.failoverHomeservers.find(hs => {
        const failoverHealth = this.healthStatus.get(hs.id);
        return !failoverHealth || failoverHealth.status === 'healthy';
      });

      if (failover && failover.baseUrl && (failover.baseUrl.startsWith('http://') || failover.baseUrl.startsWith('https://'))) {
        console.warn(`Using failover homeserver: ${failover.serverName}`);
        return failover.baseUrl;
      }
    }

    // Use current homeserver or default - validate URL
    const homeserverUrl = this.currentHomeserver?.baseUrl;
    if (homeserverUrl && (homeserverUrl.startsWith('http://') || homeserverUrl.startsWith('https://'))) {
      return homeserverUrl;
    }
    
    // Fallback to default if homeserver URL is invalid
    return this.defaultApiBase;
  }

  /**
   * Get the current homeserver info
   */
  getCurrentHomeserver() {
    return this.currentHomeserver;
  }

  /**
   * Get user's region
   */
  getUserRegion(user) {
    return user?.region || user?.matrixHomeserver?.region || 'US';
  }

  /**
   * Start health monitoring for homeservers
   */
  startHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Check health every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.checkHomeserverHealth();
    }, 30000);

    // Initial check
    this.checkHomeserverHealth();
  }

  /**
   * Check health of current and failover homeservers
   */
  async checkHomeserverHealth() {
    const homeserversToCheck = [
      this.currentHomeserver,
      ...this.failoverHomeservers
    ].filter(Boolean);

    for (const homeserver of homeserversToCheck) {
      try {
        const startTime = Date.now();
        const token = this.getAuthToken();
        const response = await fetch(`${homeserver.baseUrl}/api/matrix/status`, {
          method: 'GET',
          headers: token ? {
            'Authorization': `Bearer ${token}`
          } : {},
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });

        const responseTime = Date.now() - startTime;
        const isHealthy = response.ok;

        this.healthStatus.set(homeserver.id, {
          status: isHealthy ? 'healthy' : 'unhealthy',
          lastCheck: new Date(),
          responseTime,
          errorCount: isHealthy ? 0 : (this.healthStatus.get(homeserver.id)?.errorCount || 0) + 1
        });

        if (!isHealthy && homeserver.id === this.currentHomeserver?.id) {
          console.warn(`Current homeserver ${homeserver.serverName} is unhealthy, will use failover`);
        }
      } catch (error) {
        this.healthStatus.set(homeserver.id, {
          status: 'unhealthy',
          lastCheck: new Date(),
          responseTime: null,
          errorCount: (this.healthStatus.get(homeserver.id)?.errorCount || 0) + 1,
          error: error.message
        });

        if (homeserver.id === this.currentHomeserver?.id) {
          console.warn(`Current homeserver ${homeserver.serverName} health check failed:`, error.message);
        }
      }
    }
  }

  /**
   * Get health status for a homeserver
   */
  getHomeserverHealth(homeserverId) {
    return this.healthStatus.get(homeserverId) || {
      status: 'unknown',
      lastCheck: null,
      responseTime: null,
      errorCount: 0
    };
  }

  /**
   * Get all homeserver health statuses
   */
  getAllHomeserverHealth() {
    const allHomeservers = [
      this.currentHomeserver,
      ...this.failoverHomeservers
    ].filter(Boolean);

    return allHomeservers.map(hs => ({
      homeserver: hs,
      health: this.getHomeserverHealth(hs.id)
    }));
  }

  /**
   * Force failover to next available homeserver
   */
  async forceFailover() {
    if (this.failoverHomeservers.length === 0) {
      console.warn('No failover homeservers available');
      return false;
    }

    // Find first healthy failover homeserver
    const failover = this.failoverHomeservers.find(hs => {
      const health = this.healthStatus.get(hs.id);
      return !health || health.status === 'healthy';
    });

    if (failover) {
      console.log(`Failing over to: ${failover.serverName}`);
      this.currentHomeserver = failover;
      // Remove from failover list and add old one
      this.failoverHomeservers = this.failoverHomeservers.filter(hs => hs.id !== failover.id);
      return true;
    }

    return false;
  }

  /**
   * Get auth token from storage
   */
  getAuthToken() {
    try {
      const stored = localStorage.getItem('auth-storage');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed?.state?.token;
      }
    } catch (error) {
      console.warn('Failed to get auth token:', error);
    }
    return null;
  }

  /**
   * Reset routing (on logout)
   */
  reset() {
    this.currentHomeserver = null;
    this.failoverHomeservers = [];
    this.healthStatus.clear();
    this.isInitialized = false;
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}

// Singleton instance
let clientRoutingServiceInstance = null;

export function getClientRoutingService() {
  if (!clientRoutingServiceInstance) {
    clientRoutingServiceInstance = new ClientRoutingService();
  }
  return clientRoutingServiceInstance;
}

export default getClientRoutingService();

