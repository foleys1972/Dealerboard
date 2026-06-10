/**
 * Client Routing Service
 * 
 * Handles routing clients to their assigned regional homeserver
 * - Detects user's region and assigned homeserver
 * - Routes API calls to appropriate server
 * - Handles failover to backup homeservers
 * - Manages connection health and automatic failover
 */

// Shared base-URL normalizer used by API routing (this service), axios setup
// (utils/api.js), and Socket.IO (useSocket). Historical note: this used to
// downgrade https→http because the dev backend was plain HTTP; the dev backend
// now runs TLS (HTTPS_ENABLED=true), so the configured scheme is trusted as-is.
export function normalizeDevApiUrl(rawBaseUrl) {
  const normalized = rawBaseUrl ? String(rawBaseUrl).trim() : '';
  return normalized.replace(/\/+$/, '');
}

class ClientRoutingService {
  constructor() {
    this.currentHomeserver = null;
    this.failoverHomeservers = [];
    this.healthStatus = new Map(); // Map<homeserverId, status>
    this.isInitialized = false;
    // Default to explicit API URL, fallback to same-origin for enterprise deployments
    // (works behind reverse proxies, avoids hardcoding backend ports).
    this.apiBaseUrl = ClientRoutingService.normalizeDevApiUrl(
      process.env.REACT_APP_API_URL ||
      (typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost:5000')
    );
    this.defaultApiBase = this.apiBaseUrl;
  }

  _normalizeBaseUrl(baseUrl) {
    const raw = baseUrl ? String(baseUrl).trim() : '';
    if (!raw) return raw;

    let normalized = raw;
    while (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    if (normalized.toLowerCase().endsWith('/api')) {
      normalized = normalized.slice(0, -4);
    }
    while (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return ClientRoutingService.normalizeDevApiUrl(normalized);
  }

  static normalizeDevApiUrl(rawBaseUrl) {
    return normalizeDevApiUrl(rawBaseUrl);
  }

  _notifyRoutingChanged(prevBaseUrl, nextBaseUrl) {
    try {
      if (typeof window === 'undefined') return;
      const prev = prevBaseUrl ? String(prevBaseUrl) : '';
      const next = nextBaseUrl ? String(nextBaseUrl) : '';
      if (!next || prev === next) return;
      window.dispatchEvent(new CustomEvent('client-routing-changed', {
        detail: { prevBaseUrl: prev, nextBaseUrl: next }
      }));
    } catch {
      // ignore
    }
  }

  /**
   * Initialize client routing with user's homeserver info
   */
  async initialize(user) {
    if (this.isInitialized && this.currentHomeserver?.id === user?.matrixHomeserver?.id) {
      return; // Already initialized with same homeserver
    }

    try {
      const prevBaseUrl = this.currentHomeserver?.baseUrl || null;

      // Hybrid site-based routing: allow backend to instruct client to talk to the correct
      // subscriber for the user's effective site.
      if (user?.recommendedSubscriberUrl) {
        const baseUrl = this._normalizeBaseUrl(user.recommendedSubscriberUrl);
        if (baseUrl) {
          this.currentHomeserver = {
            id: `site:${user.effectiveSiteId || 'unknown'}`,
            baseUrl,
            region: user.region || null,
            serverName: `Subscriber (Site ${user.effectiveSiteId || 'unknown'})`,
            federationUrl: null,
          };
          this.failoverHomeservers = [];
          this.startHealthMonitoring();
          this.isInitialized = true;
          this._notifyRoutingChanged(prevBaseUrl, baseUrl);
          console.log('Client routing initialized (recommendedSubscriberUrl):', {
            baseUrl,
            effectiveSiteId: user.effectiveSiteId || null,
          });
          return;
        }
      }

      // Prefer location-based subscriber routing if provided by the backend.
      // This is used for per-location subscriber assignments and travel overrides.
      if (user?.subscriberRouting?.primary?.serverUrl) {
        const primary = user.subscriberRouting.primary;
        const routingLocationId = user.routingLocationId || user.locationId || null;

        const primaryBaseUrl = this._normalizeBaseUrl(primary.serverUrl);

        this.currentHomeserver = {
          id: primary.serverId || primary.subscriberId || 'subscriber-primary',
          baseUrl: primaryBaseUrl,
          region: user.region || null,
          serverName: primary.name || primary.serverId || 'Subscriber (Primary)',
          federationUrl: null,
          locationId: routingLocationId
        };

        // If a secondary exists, treat it as failover.
        const secondary = user?.subscriberRouting?.secondary;
        const secondaryBaseUrl = this._normalizeBaseUrl(secondary?.serverUrl);
        this.failoverHomeservers = secondary?.serverUrl
          ? [{
              id: secondary.serverId || secondary.subscriberId || 'subscriber-secondary',
              baseUrl: secondaryBaseUrl,
              region: user.region || null,
              serverName: secondary.name || secondary.serverId || 'Subscriber (Secondary)',
              federationUrl: null,
              locationId: routingLocationId
            }]
          : [];

        this.startHealthMonitoring();
        this.isInitialized = true;
        this._notifyRoutingChanged(prevBaseUrl, this.currentHomeserver?.baseUrl);
        console.log('Client routing initialized (subscriberRouting):', {
          serverName: this.currentHomeserver.serverName,
          baseUrl: this.currentHomeserver.baseUrl,
          routingLocationId
        });
        return;
      }

      // Get user's assigned homeserver from login response
      if (user?.matrixHomeserver) {
        this.currentHomeserver = {
          id: user.matrixHomeserver.id,
          baseUrl: this._normalizeBaseUrl(user.matrixHomeserver.baseUrl),
          region: user.matrixHomeserver.region,
          serverName: user.matrixHomeserver.serverName,
          federationUrl: user.matrixHomeserver.federationUrl
        };

        // Fetch backup homeservers for failover
        await this.loadFailoverHomeservers(user.region || user.matrixHomeserver.region);

        // Start health monitoring
        this.startHealthMonitoring();

        this.isInitialized = true;
        this._notifyRoutingChanged(prevBaseUrl, this.currentHomeserver?.baseUrl);
        console.log('Client routing initialized:', {
          homeserver: this.currentHomeserver.serverName,
          region: this.currentHomeserver.region
        });
      } else {
        // No homeserver assigned, use default (this is normal for single-server deployments)
        // Only log once in development mode to reduce noise
        if (!this._hasLoggedNoHomeserver && process.env.NODE_ENV === 'development') {
          console.debug('No homeserver assigned to user, using default API URL (this is normal for single-server deployments)');
          this._hasLoggedNoHomeserver = true;
        }
        this.currentHomeserver = {
          id: 'default',
          baseUrl: this._normalizeBaseUrl(this.defaultApiBase),
          region: 'US',
          serverName: 'Default Server'
        };
        this.isInitialized = true;
        this._notifyRoutingChanged(prevBaseUrl, this.currentHomeserver?.baseUrl);
      }
    } catch (error) {
      console.error('Failed to initialize client routing:', error);
      // Fallback to default
      this.currentHomeserver = {
        id: 'default',
        baseUrl: this._normalizeBaseUrl(this.defaultApiBase),
        region: 'US',
        serverName: 'Default Server'
      };
      this.isInitialized = true;
      this._notifyRoutingChanged(this.currentHomeserver?.baseUrl || null, this.defaultApiBase);
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
            baseUrl: this._normalizeBaseUrl(hs.baseUrl),
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
    const homeserverUrl = this._normalizeBaseUrl(this.currentHomeserver?.baseUrl);
    if (homeserverUrl && (homeserverUrl.startsWith('http://') || homeserverUrl.startsWith('https://'))) {
      return homeserverUrl;
    }
    
    // Fallback to default if homeserver URL is invalid
    return this._normalizeBaseUrl(this.defaultApiBase);
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
   * Start health monitoring for homeservers with adaptive intervals
   * - Faster checks (10s) when unhealthy
   * - Slower checks (60s) when healthy
   */
  startHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearTimeout(this.healthCheckInterval);
    }

    const performCheck = () => {
      this.checkHomeserverHealth().then(() => {
        // Adaptive interval: faster when unhealthy, slower when healthy
        const currentHealth = this.getHomeserverHealth(this.currentHomeserver?.id);
        const isUnhealthy = currentHealth.status === 'unhealthy';
        const interval = isUnhealthy ? 10000 : 60000; // 10s if unhealthy, 60s if healthy

        // Schedule next check
        this.healthCheckInterval = setTimeout(performCheck, interval);
      });
    };

    // Initial check
    performCheck();
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
          // Only log in development to reduce noise
          if (process.env.NODE_ENV === 'development') {
            console.warn(`Current homeserver ${homeserver.serverName} is unhealthy, will use failover`);
          }
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
          // Only log in development to reduce noise
          if (process.env.NODE_ENV === 'development') {
            console.warn(`Current homeserver ${homeserver.serverName} health check failed:`, error.message);
          }
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
      clearTimeout(this.healthCheckInterval);
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

