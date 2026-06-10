const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const { pool } = require('./databaseService');
const logger = require('../utils/logger');
const { getServerRole } = require('../utils/serverRole');

class UcSentinelDeliveryService {
  constructor() {
    this._enabled = String(process.env.UC_SENTINEL_ENABLED || '').toLowerCase() === 'true';
    this._baseUrl = String(process.env.UC_SENTINEL_URL || '').trim();
    this._token = String(process.env.UC_SENTINEL_TOKEN || '').trim();

    this._flushIntervalMs = parseInt(process.env.UC_SENTINEL_FLUSH_INTERVAL_MS || '5000', 10) || 5000;
    this._healthIntervalMs = parseInt(process.env.UC_SENTINEL_HEALTH_INTERVAL_MS || '30000', 10) || 30000;
    this._batchSize = Math.min(parseInt(process.env.UC_SENTINEL_BATCH_SIZE || '50', 10) || 50, 500);
    this._maxAttempts = Math.min(parseInt(process.env.UC_SENTINEL_MAX_ATTEMPTS || '25', 10) || 25, 100);

    this._flushTimer = null;
    this._healthTimer = null;
    this._inFlight = false;
  }

  isEnabled() {
    return this._enabled && !!this._baseUrl && !!this._token;
  }

  async initialize() {
    if (!this._enabled) {
      return;
    }

    if (!this._baseUrl || !this._token) {
      logger.warn('UC Sentinel enabled but missing UC_SENTINEL_URL or UC_SENTINEL_TOKEN');
      return;
    }

    this._enabled = true;
  }

  async start() {
    if (!this.isEnabled()) return;

    if (!this._flushTimer) {
      this._flushTimer = setInterval(() => {
        this.flush().catch(() => {});
      }, this._flushIntervalMs);
    }

    if (!this._healthTimer) {
      this._healthTimer = setInterval(() => {
        this.enqueueHealth().catch(() => {});
      }, this._healthIntervalMs);
    }

    await this.enqueueHealth();
    await this.flush();
  }

  stop() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    if (this._healthTimer) {
      clearInterval(this._healthTimer);
      this._healthTimer = null;
    }
  }

  async enqueue(eventType, payload) {
    if (!this.isEnabled()) return;

    const id = uuidv4();
    await pool.query(
      `INSERT INTO uc_sentinel_outbox (id, event_type, payload)
       VALUES ($1, $2, $3)`,
      [id, eventType, payload]
    );
  }

  async enqueueAudit({ action, serviceName, success, result, error }) {
    return this.enqueue('audit', {
      kind: 'agent-service-control',
      action,
      serviceName,
      success: !!success,
      result: result || null,
      error: error || null,
      at: new Date().toISOString(),
    });
  }

  async enqueueAlert({ kind, severity, title, message, details }) {
    return this.enqueue('alert', {
      kind: kind || 'alert',
      severity: severity || 'warning', // info|warning|error|critical
      title: title || null,
      message: message || null,
      details: details || null,
      at: new Date().toISOString(),
    });
  }

  async enqueueHealth() {
    if (!this.isEnabled()) return;

    let role = null;
    try {
      role = await getServerRole();
    } catch {
      role = null;
    }

    const payload = {
      kind: 'subscriber-health',
      serverId: role?.serverId || process.env.SERVER_ID || null,
      serverName: role?.serverName || process.env.SERVER_NAME || null,
      role: role?.role || process.env.SERVER_ROLE || null,
      enableSubscriber: !!role?.enableSubscriber,
      enablePublisher: !!role?.enablePublisher,
      port: parseInt(process.env.PORT || '5000', 10) || 5000,
      announcedIp: process.env.ANNOUNCED_IP || process.env.LISTEN_IP || null,
      delivery: null,
      recordings: null,
      at: new Date().toISOString(),
    };

    // Include delivery queue stats (cheap DB query)
    try {
      const q = await pool.query(
        `SELECT COUNT(*)::int AS pending_count,
                MIN(created_at) AS oldest_pending_at
         FROM uc_sentinel_outbox
         WHERE attempts < $1`,
        [this._maxAttempts]
      );
      payload.delivery = {
        outboxPendingCount: q.rows?.[0]?.pending_count ?? null,
        outboxOldestPendingAt: q.rows?.[0]?.oldest_pending_at ? new Date(q.rows[0].oldest_pending_at).toISOString() : null,
      };
    } catch (e) {
      payload.delivery = { error: e?.message || String(e) };
    }

    // Optional: include recording archive/reconcile health (can be expensive if it scans the recording dir)
    try {
      const includeRecordingHealth = String(process.env.UC_SENTINEL_INCLUDE_RECORDING_HEALTH || '').toLowerCase() === 'true';
      if (includeRecordingHealth) {
        const { audioRecordingService } = require('./audioRecordingService');
        const { getArchiveHealth } = require('./recordingArchiveService');
        const { getRecordingReconcileHealth } = require('./recordingReconcileService');

        const recordingDir = audioRecordingService?.recordingDir;
        const archive = recordingDir ? await getArchiveHealth({ recordingDir }) : { error: 'recordingDir_not_available' };
        const reconcile = getRecordingReconcileHealth ? getRecordingReconcileHealth() : null;

        payload.recordings = { archive, reconcile };
      } else {
        // Cheap always-on reconcile stats
        try {
          const { getRecordingReconcileHealth } = require('./recordingReconcileService');
          payload.recordings = { reconcile: getRecordingReconcileHealth ? getRecordingReconcileHealth() : null };
        } catch {
          payload.recordings = null;
        }
      }
    } catch (e) {
      payload.recordings = { error: e?.message || String(e) };
    }

    await this.enqueue('health', payload);
  }

  async flush() {
    if (!this.isEnabled()) return;
    if (this._inFlight) return;

    this._inFlight = true;
    try {
      const now = new Date().toISOString();
      const result = await pool.query(
        `SELECT id, event_type, payload, attempts
         FROM uc_sentinel_outbox
         WHERE next_attempt_at <= $1
           AND attempts < $2
         ORDER BY created_at ASC
         LIMIT $3`,
        [now, this._maxAttempts, this._batchSize]
      );

      for (const row of result.rows) {
        const id = row.id;
        const eventType = String(row.event_type || '').toLowerCase();
        const payload = row.payload;

        try {
          await this._postEvent(eventType, payload);
          await pool.query('DELETE FROM uc_sentinel_outbox WHERE id = $1', [id]);
        } catch (e) {
          const attempts = (parseInt(row.attempts || 0, 10) || 0) + 1;
          const delayMs = this._computeBackoffMs(attempts);
          const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();

          await pool.query(
            `UPDATE uc_sentinel_outbox
             SET attempts = $2,
                 last_error = $3,
                 next_attempt_at = $4
             WHERE id = $1`,
            [id, attempts, String(e?.message || e || 'unknown_error'), nextAttemptAt]
          );
        }
      }
    } finally {
      this._inFlight = false;
    }
  }

  _computeBackoffMs(attempts) {
    const base = Math.min(60000, 1000 * Math.pow(2, Math.min(attempts, 10)));
    const jitter = Math.floor(Math.random() * 250);
    return base + jitter;
  }

  async _postEvent(eventType, payload) {
    const endpoint = this._endpointForEventType(eventType);
    if (!endpoint) {
      throw new Error(`Unknown eventType: ${eventType}`);
    }

    const url = `${this._baseUrl.replace(/\/+$/, '')}${endpoint}`;

    await axios.post(url, payload, {
      timeout: parseInt(process.env.UC_SENTINEL_HTTP_TIMEOUT_MS || '8000', 10) || 8000,
      headers: {
        Authorization: `Bearer ${this._token}`
      }
    });
  }

  _endpointForEventType(eventType) {
    if (eventType === 'audit') return '/api/v1/ingest/audit';
    if (eventType === 'alert' || eventType === 'alerts') return '/api/v1/ingest/alerts';
    if (eventType === 'health') return '/api/v1/ingest/health';
    return null;
  }
}

let instance = null;

function getUcSentinelDeliveryService() {
  if (!instance) instance = new UcSentinelDeliveryService();
  return instance;
}

module.exports = {
  UcSentinelDeliveryService,
  getUcSentinelDeliveryService,
};
