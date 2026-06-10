const logger = require('../utils/logger');
const { pool } = require('./databaseService');

class LineOwnershipService {
  constructor({ redisService, sipGateway, serverId, leaseTtlMs = 15000, renewIntervalMs = 5000, refreshIntervalMs = 30000 }) {
    this.redisService = redisService;
    this.sipGateway = sipGateway;
    this.serverId = String(serverId || '');

    this.keyPrefix = (process.env.SIP_HA_KEY_PREFIX || 'sip').toString().trim() || 'sip';

    this.leaseTtlMs = leaseTtlMs;
    this.renewIntervalMs = renewIntervalMs;
    this.refreshIntervalMs = refreshIntervalMs;

    this._renewTimer = null;
    this._refreshTimer = null;

    this._candidateLineIds = new Set();
    this._candidateRoleByLineId = new Map(); // lineId -> 'home' | 'secondary' | 'legacy'
    this._ownedLineTokens = new Map(); // lineId -> fencingToken

    this._initialized = false;

    this._lastFailClosedAt = null;

    this._lastReconcileAt = null;

    // Lua script: renew only if we still own (value matches ownerServerId)
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

    // Lua script: delete lease only if we still own it (ownerServerId + fencingToken match)
    this._releaseScript = `
      local key = KEYS[1]
      local expectedOwner = ARGV[1]
      local expectedToken = tonumber(ARGV[2])

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

      redis.call('DEL', key)
      return 1
    `;
  }

  isEnabled() {
    return process.env.SIP_HA_ENABLED === 'true';
  }

  async initialize() {
    if (this._initialized) return;

    if (!this.isEnabled()) {
      logger.info('LineOwnershipService disabled (SIP_HA_ENABLED != true)');
      return;
    }

    if (!this.serverId) {
      logger.warn('LineOwnershipService cannot start: missing serverId');
      return;
    }

    if (!this.redisService || !this.redisService.client || !this.redisService.isConnected) {
      logger.warn('LineOwnershipService cannot start: Redis not connected');
      return;
    }

    if (!this.sipGateway) {
      logger.warn('LineOwnershipService cannot start: SIP gateway not available');
      return;
    }

    this._initialized = true;

    await this.refreshCandidates();
    await this.reconcile();

    this._renewTimer = setInterval(() => {
      this.reconcile().catch(e => {
        try { logger.warn('LineOwnershipService reconcile failed', e?.message || e); } catch {}
      });
    }, this.renewIntervalMs);

    this._refreshTimer = setInterval(() => {
      this.refreshCandidates().catch(e => {
        try { logger.warn('LineOwnershipService refreshCandidates failed', e?.message || e); } catch {}
      });
    }, this.refreshIntervalMs);

    logger.info('LineOwnershipService started', {
      serverId: this.serverId,
      leaseTtlMs: this.leaseTtlMs,
      renewIntervalMs: this.renewIntervalMs,
      refreshIntervalMs: this.refreshIntervalMs,
    });
  }

  async stop({ releaseLeases = false } = {}) {
    if (this._renewTimer) {
      clearInterval(this._renewTimer);
      this._renewTimer = null;
    }
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }

    if (releaseLeases) {
      try {
        await this.releaseAllLeases();
      } catch (e) {
        try { logger.warn('LineOwnershipService lease release failed', e?.message || e); } catch {}
      }
    }

    this._candidateLineIds.clear();
    this._ownedLineTokens.clear();
    this._initialized = false;
  }

  getStatus() {
    return {
      enabled: this.isEnabled(),
      initialized: this._initialized,
      serverId: this.serverId,
      redisConnected: Boolean(this.redisService?.isConnected),
      leaseTtlMs: this.leaseTtlMs,
      renewIntervalMs: this.renewIntervalMs,
      refreshIntervalMs: this.refreshIntervalMs,
      candidateLineIds: Array.from(this._candidateLineIds || []),
      ownedLineIds: Array.from(this._ownedLineTokens?.keys() || []),
      ownedLineTokens: Array.from(this._ownedLineTokens?.entries() || []).map(([lineId, token]) => ({ lineId, token })),
      lastReconcileAt: this._lastReconcileAt ? new Date(this._lastReconcileAt).toISOString() : null,
      lastFailClosedAt: this._lastFailClosedAt ? new Date(this._lastFailClosedAt).toISOString() : null,
    };
  }

  async _tryRelease(lineId, fencingToken) {
    const redis = this.redisService?.client;
    if (!redis) return false;
    const key = this._leaseKey(lineId);
    try {
      const result = await redis.eval(this._releaseScript, 1, key, this.serverId, String(fencingToken));
      return Number(result) === 1;
    } catch {
      return false;
    }
  }

  async releaseAllLeases() {
    if (!this.isEnabled()) return;
    if (!this.serverId) return;
    if (!this.redisService?.isConnected || !this.redisService?.client) return;

    const entries = Array.from(this._ownedLineTokens.entries());
    if (entries.length === 0) return;

    for (const [lineId, token] of entries) {
      await this._tryRelease(String(lineId), token);
    }
  }

  async refreshCandidates() {
    if (!this.isEnabled()) return;
    if (!this.serverId) return;

    // Determine this server's subscriber record (if any)
    const subRes = await pool.query(
      `SELECT id FROM subscribers WHERE server_id = $1 LIMIT 1`,
      [this.serverId]
    );

    if (subRes.rows.length === 0) {
      this._candidateLineIds.clear();
      return;
    }

    const subscriberDbId = subRes.rows[0].id;

    const candidates = new Set();

    const roleByLineId = new Map();

    // Private wires
    const pw = await pool.query(
      `
        SELECT id, subscriber_id, home_subscriber_id, secondary_subscriber_id
        FROM dealerboard_private_wires
        WHERE is_active = true
          AND (
            home_subscriber_id = $1
            OR secondary_subscriber_id = $1
            OR subscriber_id = $1
          )
      `,
      [subscriberDbId]
    );
    for (const r of pw.rows) {
      const lineId = String(r.id);
      candidates.add(lineId);
      if (r.home_subscriber_id && String(r.home_subscriber_id) === String(subscriberDbId)) {
        roleByLineId.set(lineId, 'home');
      } else if (r.secondary_subscriber_id && String(r.secondary_subscriber_id) === String(subscriberDbId)) {
        roleByLineId.set(lineId, 'secondary');
      } else {
        roleByLineId.set(lineId, 'legacy');
      }
    }

    // DDI
    const ddi = await pool.query(
      `
        SELECT id, subscriber_id, home_subscriber_id, secondary_subscriber_id
        FROM dealerboard_ddi_lines
        WHERE is_active = true
          AND (
            home_subscriber_id = $1
            OR secondary_subscriber_id = $1
            OR subscriber_id = $1
          )
      `,
      [subscriberDbId]
    );
    for (const r of ddi.rows) {
      const lineId = String(r.id);
      candidates.add(lineId);
      if (r.home_subscriber_id && String(r.home_subscriber_id) === String(subscriberDbId)) {
        roleByLineId.set(lineId, 'home');
      } else if (r.secondary_subscriber_id && String(r.secondary_subscriber_id) === String(subscriberDbId)) {
        roleByLineId.set(lineId, 'secondary');
      } else {
        roleByLineId.set(lineId, 'legacy');
      }
    }

    this._candidateLineIds = candidates;
    this._candidateRoleByLineId = roleByLineId;
  }

  _secondaryAcquireDelayMs() {
    const v = parseInt(process.env.SIP_HA_SECONDARY_ACQUIRE_DELAY_MS || '2000', 10);
    return Number.isFinite(v) ? Math.max(0, v) : 2000;
  }

  async _isLeaseHeldBySomeone(lineId) {
    const redis = this.redisService?.client;
    if (!redis) return false;
    try {
      const key = this._leaseKey(lineId);
      const exists = await redis.exists(key);
      return Number(exists) === 1;
    } catch {
      return false;
    }
  }

  _leaseKey(lineId) {
    return `${this.keyPrefix}:line-lease:${String(lineId)}`;
  }

  _fenceKey(lineId) {
    return `${this.keyPrefix}:line-fence:${String(lineId)}`;
  }

  async _tryAcquire(lineId) {
    const redis = this.redisService?.client;
    if (!redis) return false;
    const key = this._leaseKey(lineId);

    const fencingToken = await redis.incr(this._fenceKey(lineId));
    const valueObj = {
      ownerServerId: this.serverId,
      fencingToken: Number(fencingToken),
      acquiredAt: new Date().toISOString(),
    };

    const value = JSON.stringify(valueObj);
    const result = await redis.set(key, value, 'PX', this.leaseTtlMs, 'NX');

    if (result === 'OK') {
      this._ownedLineTokens.set(String(lineId), Number(fencingToken));
      return true;
    }

    return false;
  }

  async _tryRenew(lineId, fencingToken) {
    const redis = this.redisService?.client;
    if (!redis) return false;
    const key = this._leaseKey(lineId);

    const valueObj = {
      ownerServerId: this.serverId,
      fencingToken: Number(fencingToken),
      renewedAt: new Date().toISOString(),
    };

    const value = JSON.stringify(valueObj);

    try {
      const result = await redis.eval(this._renewScript, 1, key, this.serverId, String(fencingToken), value, String(this.leaseTtlMs));
      return Number(result) === 1;
    } catch (e) {
      try { logger.warn('Redis renew eval failed', e?.message || e); } catch {}
      return false;
    }
  }

  async reconcile() {
    if (!this.isEnabled()) return;

    this._lastReconcileAt = Date.now();

    // Fail closed if Redis is down to avoid split-brain.
    if (!this.redisService?.isConnected || !this.redisService?.client) {
      await this._failClosed('redis_disconnected');
      return;
    }

    const desired = this._candidateLineIds;
    const newlyOwned = new Set();

    // First, attempt to renew any currently-owned leases.
    for (const [lineId, token] of Array.from(this._ownedLineTokens.entries())) {
      if (!desired.has(lineId)) {
        this._ownedLineTokens.delete(lineId);
        continue;
      }

      const ok = await this._tryRenew(lineId, token);
      if (ok) {
        newlyOwned.add(lineId);
      } else {
        this._ownedLineTokens.delete(lineId);
      }
    }

    // Then, attempt to acquire for desired-but-not-owned.
    for (const lineId of desired) {
      if (newlyOwned.has(lineId)) continue;
      if (this._ownedLineTokens.has(lineId)) continue;

      const role = this._candidateRoleByLineId.get(String(lineId)) || 'legacy';

      if (role === 'secondary') {
        // Avoid thrash: only try secondary takeover if there is no current lease.
        const held = await this._isLeaseHeldBySomeone(lineId);
        if (held) continue;

        const delayMs = this._secondaryAcquireDelayMs();
        if (delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          // Re-check after delay.
          const heldAfter = await this._isLeaseHeldBySomeone(lineId);
          if (heldAfter) continue;
        }
      }

      const acquired = await this._tryAcquire(lineId);
      if (acquired) {
        newlyOwned.add(lineId);
      }
    }

    // Apply to SIP gateway.
    try {
      if (typeof this.sipGateway.applyOwnedLineIds === 'function') {
        await this.sipGateway.applyOwnedLineIds(newlyOwned);
      }
    } catch (e) {
      try { logger.warn('Failed to apply owned line IDs to SIP gateway', e?.message || e); } catch {}
    }
  }

  async _failClosed(reason) {
    // Only log when state actually changes to avoid spam.
    const hadAny = this._ownedLineTokens.size > 0;
    this._ownedLineTokens.clear();

    try {
      if (typeof this.sipGateway.applyOwnedLineIds === 'function') {
        await this.sipGateway.applyOwnedLineIds(new Set());
      }
    } catch (e) {
      try { logger.warn('Fail-closed: unable to deactivate SIP lines', e?.message || e); } catch {}
    }

    if (hadAny || !this._lastFailClosedAt) {
      this._lastFailClosedAt = Date.now();
      try {
        logger.warn('LineOwnershipService fail-closed (SIP lines deactivated)', { reason });
      } catch {}
    }
  }
}

module.exports = {
  LineOwnershipService,
};
