const logger = require('../utils/logger');

class SubscriberHaService {
  constructor({ redisService, serverId, siteIds, preferredSiteIds }) {
    this.redisService = redisService;
    this.redis = redisService?.client;
    this.serverId = String(serverId || '').trim();
    this.siteIds = Array.isArray(siteIds)
      ? siteIds.map(s => String(s || '').trim()).filter(Boolean)
      : [];

    this.preferredSiteIds = new Set(
      Array.isArray(preferredSiteIds)
        ? preferredSiteIds.map(s => String(s || '').trim()).filter(Boolean)
        : []
    );

    this.leaseTtlMs = parseInt(process.env.SUBSCRIBER_HA_LEASE_TTL_MS || '15000', 10) || 15000;
    this.renewIntervalMs = parseInt(process.env.SUBSCRIBER_HA_RENEW_INTERVAL_MS || '5000', 10) || 5000;
    this.pollIntervalMs = parseInt(process.env.SUBSCRIBER_HA_POLL_INTERVAL_MS || '2000', 10) || 2000;

    // Nodes can be biased to become primary by setting acquire delay.
    // In this runtime implementation we support:
    // - SUBSCRIBER_HA_ACQUIRE_DELAY_MS / _JITTER for all sites
    // - plus per-site preference via preferredSiteIds (0 delay on those sites)
    this.acquireDelayMs = parseInt(process.env.SUBSCRIBER_HA_ACQUIRE_DELAY_MS || '0', 10) || 0;
    this.acquireDelayJitterMs = parseInt(process.env.SUBSCRIBER_HA_ACQUIRE_DELAY_JITTER_MS || '250', 10) || 250;

    this._timers = new Map();
    this._states = new Map();

    this._renewScript = `
      local key = KEYS[1]
      local expectedOwner = ARGV[1]
      local expectedToken = tonumber(ARGV[2])
      local newValue = ARGV[3]
      local ttlMs = tonumber(ARGV[4])

      local current = redis.call('GET', key)
      if not current then
        return 0
      end

      local ok, decoded = pcall(cjson.decode, current)
      if (not ok) then
        return 0
      end

      if decoded["ownerServerId"] ~= expectedOwner then
        return 0
      end

      if decoded["fencingToken"] ~= expectedToken then
        return 0
      end

      redis.call('PSETEX', key, ttlMs, newValue)
      return 1
    `;
  }

  isPrimary(siteId) {
    const s = this._states.get(String(siteId || '').trim());
    return !!s?.isPrimary;
  }

  isEnabled() {
    return process.env.SUBSCRIBER_HA_ENABLED !== 'false';
  }

  getPrimarySiteIds() {
    return Array.from(this._states.values())
      .filter(s => !!s?.isPrimary)
      .map(s => s.siteId);
  }

  getStatus() {
    return {
      enabled: this.isEnabled(),
      serverId: this.serverId,
      sites: Array.from(this._states.values()).map(s => ({
        siteId: s.siteId,
        role: s.role,
        isPrimary: s.isPrimary,
        primaryServerId: s.primaryServerId,
        fencingToken: s.fencingToken,
        lastElectedAt: s.lastElectedAt,
        lastRenewOkAt: s.lastRenewOkAt,
        lastError: s.lastError,
        preferred: this.preferredSiteIds.has(s.siteId)
      })),
    };
  }

  async start() {
    if (!this.isEnabled()) {
      logger.info('Subscriber HA disabled (SUBSCRIBER_HA_ENABLED=false)');
      return;
    }

    if (!this.redis) {
      logger.warn('Subscriber HA not started: Redis not available');
      return;
    }

    if (!this.serverId) {
      logger.warn('Subscriber HA not started: missing serverId');
      return;
    }

    if (!this.siteIds.length) {
      logger.warn('Subscriber HA not started: no SITE_IDS configured');
      return;
    }

    for (const siteId of this.siteIds) {
      if (this._timers.has(siteId)) continue;
      this._states.set(siteId, {
        siteId,
        role: 'unknown',
        isPrimary: false,
        primaryServerId: null,
        fencingToken: null,
        lastElectedAt: null,
        lastRenewOkAt: null,
        nextAcquireAtMs: 0,
        lastError: null,
      });

      const t = setInterval(() => {
        this._tick(siteId).catch(() => {});
      }, this.pollIntervalMs);
      this._timers.set(siteId, t);
      await this._tick(siteId);
    }

    logger.info('Subscriber HA started', { serverId: this.serverId, sites: this.siteIds });
  }

  async stop() {
    for (const [, t] of this._timers.entries()) {
      try { clearInterval(t); } catch {}
    }
    this._timers.clear();
  }

  _leaseKey(siteId) {
    return `subscriber:ha:primary:${siteId}`;
  }

  _fencingKey(siteId) {
    return `subscriber:ha:fencing:${siteId}`;
  }

  async _readCurrent(siteId) {
    try {
      const raw = await this.redis.get(this._leaseKey(siteId));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async _acquire(siteId) {
    const fencingToken = await this.redis.incr(this._fencingKey(siteId));
    const value = {
      siteId,
      ownerServerId: this.serverId,
      fencingToken: Number(fencingToken),
      electedAt: new Date().toISOString(),
    };

    const ok = await this.redis.set(
      this._leaseKey(siteId),
      JSON.stringify(value),
      'PX',
      this.leaseTtlMs,
      'NX'
    );

    return ok === 'OK' ? value : null;
  }

  async _renew(siteId, state) {
    const value = {
      siteId,
      ownerServerId: this.serverId,
      fencingToken: Number(state.fencingToken),
      electedAt: state.lastElectedAt,
    };

    const res = await this.redis.eval(
      this._renewScript,
      1,
      this._leaseKey(siteId),
      this.serverId,
      String(state.fencingToken),
      JSON.stringify(value),
      String(this.leaseTtlMs)
    );

    return Number(res) === 1;
  }

  _getAcquireDelayForSite(siteId, state) {
    // Preferred sites should attempt to acquire immediately.
    if (this.preferredSiteIds.has(siteId)) return 0;
    return Math.max(0, this.acquireDelayMs);
  }

  async _tick(siteId) {
    const state = this._states.get(siteId);
    if (!state) return;

    try {
      const current = await this._readCurrent(siteId);

      state.primaryServerId = current?.ownerServerId || null;

      // If someone else currently holds the lease, clear any acquire backoff.
      if (current?.ownerServerId && current.ownerServerId !== this.serverId) {
        state.nextAcquireAtMs = 0;
      }

      if (state.isPrimary) {
        const renewOk = await this._renew(siteId, state);
        if (!renewOk) {
          state.isPrimary = false;
          state.role = 'secondary';
          state.fencingToken = null;
          state.lastRenewOkAt = null;
        } else {
          state.role = 'primary';
          state.lastRenewOkAt = new Date().toISOString();
          state.primaryServerId = this.serverId;
        }
        state.lastError = null;
        return;
      }

      if (current?.ownerServerId && current.ownerServerId !== this.serverId) {
        state.isPrimary = false;
        state.role = 'secondary';
        state.fencingToken = null;
        state.lastRenewOkAt = null;
        state.lastError = null;
        return;
      }

      // Lease is empty (or unreadable) and we are not currently primary.
      // Apply acquire delay to allow preferred nodes to win primary.
      const nowMs = Date.now();
      const delayMs = this._getAcquireDelayForSite(siteId, state);
      if (delayMs > 0) {
        if (!state.nextAcquireAtMs || state.nextAcquireAtMs <= 0) {
          const jitter = Math.max(0, this.acquireDelayJitterMs);
          const extra = jitter > 0 ? Math.floor(Math.random() * (jitter + 1)) : 0;
          state.nextAcquireAtMs = nowMs + delayMs + extra;
        }
        if (nowMs < state.nextAcquireAtMs) {
          state.isPrimary = false;
          state.role = 'secondary';
          state.fencingToken = null;
          state.lastRenewOkAt = null;
          state.lastError = null;
          return;
        }
      }

      const acquired = await this._acquire(siteId);
      if (acquired) {
        state.isPrimary = true;
        state.role = 'primary';
        state.primaryServerId = this.serverId;
        state.fencingToken = acquired.fencingToken;
        state.lastElectedAt = acquired.electedAt;
        state.lastRenewOkAt = new Date().toISOString();
        state.nextAcquireAtMs = 0;
        state.lastError = null;
      } else {
        state.isPrimary = false;
        state.role = 'secondary';
        state.fencingToken = null;
        state.lastRenewOkAt = null;
        state.lastError = null;
      }
    } catch (e) {
      state.lastError = e?.message || String(e);
      if (state.isPrimary) {
        state.isPrimary = false;
        state.role = 'secondary';
        state.fencingToken = null;
        state.lastRenewOkAt = null;
      }
    }
  }
}

function parseSiteIdsFromEnv() {
  const raw = (process.env.SITE_IDS || process.env.SITE_ID || '').trim();
  if (!raw) return [];
  return raw.split(',').map(s => String(s || '').trim()).filter(Boolean);
}

module.exports = {
  SubscriberHaService,
  parseSiteIdsFromEnv,
};
