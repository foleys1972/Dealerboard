const logger = require('../utils/logger');
const { parseSbcProfile } = require('./dealerboard/sbcProfile');

function registerTimeoutMs() {
  const v = parseInt(process.env.SIP_SBC_REGISTER_TIMEOUT_MS || '5000', 10);
  return Number.isFinite(v) && v > 0 ? v : 5000;
}

function failbackIntervalMs() {
  const v = parseInt(process.env.SIP_SBC_FAILBACK_INTERVAL_MS || '60000', 10);
  return Number.isFinite(v) && v > 0 ? v : 60000;
}

function healthCheckIntervalMs() {
  const v = parseInt(process.env.SIP_SBC_HEALTH_CHECK_INTERVAL_MS || '30000', 10);
  return Number.isFinite(v) && v > 0 ? v : 30000;
}

function initSbcFailoverState(ua, sbcDetails) {
  const profile = parseSbcProfile(sbcDetails);
  ua._sbcProfile = profile;
  ua._sbcEndpoints = profile.endpoints;
  ua._activeEndpointIndex = 0;
  ua._failbackToPrimary = profile.failbackToPrimary !== false;
  ua._registerWaiters = [];
  ua._failbackTimer = null;
  ua._healthCheckTimer = null;
  ua._endpointHealth = profile.endpoints.map((ep) => ({
    role: ep.role,
    host: ep.host,
    port: ep.port || 5060,
    reachable: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
  }));
  applyActiveEndpoint(ua);
}

function applyActiveEndpoint(ua) {
  const ep = ua._sbcEndpoints?.[ua._activeEndpointIndex];
  if (!ep) return;

  ua.sbcHost = ep.host || process.env.SIP_HOST || 'localhost';
  ua.sbcPort = ep.port || parseInt(process.env.SIP_PORT, 10) || 5060;
  ua.username = ep.username || ua.uriAddress.split('@')[0];
  ua.password = ep.password || process.env.SIP_PASSWORD;
  ua.domain = ep.domain || ua.uriAddress.split('@')[1] || process.env.SIP_DOMAIN;
  ua._activeEndpointRole = ep.role || (ua._activeEndpointIndex === 0 ? 'primary' : 'secondary');
}

function getSbcEndpointStatus(ua) {
  return {
    lineId: ua.lineId,
    activeRole: ua._activeEndpointRole || 'primary',
    activeHost: ua.sbcHost,
    activePort: ua.sbcPort,
    registered: ua.registered === true,
    hasSecondary: (ua._sbcEndpoints?.length || 0) > 1,
    failbackToPrimary: ua._failbackToPrimary !== false,
    endpoints: ua._endpointHealth || [],
  };
}

function addRegisterWaiter(ua, { cseq, resolve, reject, timer, isFailbackProbe }) {
  ua._registerWaiters.push({ cseq, resolve, reject, timer, isFailbackProbe: !!isFailbackProbe });
}

function settleRegisterWaiter(ua, cseq, ok, reason) {
  const idx = ua._registerWaiters.findIndex((w) => w.cseq === cseq);
  if (idx < 0) return null;
  const [waiter] = ua._registerWaiters.splice(idx, 1);
  if (waiter.timer) {
    try { clearTimeout(waiter.timer); } catch {}
  }
  if (ok) {
    waiter.resolve(true);
  } else {
    waiter.reject(new Error(reason || 'REGISTER failed'));
  }
  return waiter;
}

async function failoverToSecondary(ua, reason) {
  if ((ua._sbcEndpoints?.length || 0) < 2) return false;
  if (ua._activeEndpointIndex >= 1) return false;

  logger.warn(`SBC failover: line ${ua.lineId} primary → secondary (${reason})`);
  ua._activeEndpointIndex = 1;
  applyActiveEndpoint(ua);
  ua.registered = false;

  if (ua._endpointHealth?.[0]) {
    ua._endpointHealth[0].reachable = false;
    ua._endpointHealth[0].lastFailureAt = new Date().toISOString();
    ua._endpointHealth[0].lastFailureReason = reason;
  }

  try {
    await ua.register({ expiresSeconds: ua._registerExpiresSeconds, _isFailoverAttempt: true });
    notifySbcPathChanged(ua);
    return true;
  } catch (error) {
    logger.error(`Secondary SBC registration failed for line ${ua.lineId}`, error?.message || error);
    return false;
  }
}

async function attemptFailbackToPrimary(ua) {
  if (!ua._failbackToPrimary) return;
  if ((ua._sbcEndpoints?.length || 0) < 2) return;
  if (ua._activeEndpointIndex === 0) return;
  if (ua.activeCalls?.size > 0) return;

  const savedIndex = ua._activeEndpointIndex;
  ua._activeEndpointIndex = 0;
  applyActiveEndpoint(ua);

  try {
    await ua.register({
      expiresSeconds: ua._registerExpiresSeconds,
      _isFailbackProbe: true,
    });
    notifySbcPathChanged(ua);
    logger.info(`SBC failback to primary for line ${ua.lineId}`);
  } catch (error) {
    ua._activeEndpointIndex = savedIndex;
    applyActiveEndpoint(ua);
    logger.debug(`Primary SBC still unavailable for line ${ua.lineId}`, error?.message || error);
  }
}

function startSbcResilienceTimers(ua) {
  stopSbcResilienceTimers(ua);

  if ((ua._sbcEndpoints?.length || 0) > 1 && ua._failbackToPrimary) {
    ua._failbackTimer = setInterval(() => {
      attemptFailbackToPrimary(ua).catch(() => {});
    }, failbackIntervalMs());
  }

  ua._healthCheckTimer = setInterval(async () => {
    try {
      if (!ua.registered && (ua._sbcEndpoints?.length || 0) > 1) {
        await ua.register({ expiresSeconds: ua._registerExpiresSeconds, _isHealthRefresh: true });
      }
    } catch (error) {
      if (ua._activeEndpointIndex === 0) {
        await failoverToSecondary(ua, `health_refresh: ${error?.message || error}`);
      }
    }
  }, healthCheckIntervalMs());
}

function stopSbcResilienceTimers(ua) {
  if (ua._failbackTimer) {
    clearInterval(ua._failbackTimer);
    ua._failbackTimer = null;
  }
  if (ua._healthCheckTimer) {
    clearInterval(ua._healthCheckTimer);
    ua._healthCheckTimer = null;
  }
  if (Array.isArray(ua._registerWaiters)) {
    for (const waiter of ua._registerWaiters) {
      if (waiter.timer) {
        try { clearTimeout(waiter.timer); } catch {}
      }
      try { waiter.reject(new Error('UA stopped')); } catch {}
    }
    ua._registerWaiters = [];
  }
}

function markEndpointSuccess(ua) {
  const health = ua._endpointHealth?.[ua._activeEndpointIndex];
  if (!health) return;
  health.reachable = true;
  health.lastSuccessAt = new Date().toISOString();
  health.lastFailureReason = null;
}

function markEndpointFailure(ua, reason) {
  const health = ua._endpointHealth?.[ua._activeEndpointIndex];
  if (!health) return;
  health.reachable = false;
  health.lastFailureAt = new Date().toISOString();
  health.lastFailureReason = reason;
}

function notifySbcPathChanged(ua) {
  try {
    ua.onSbcPathChanged?.();
  } catch (error) {
    logger.warn(`SBC path change callback failed for line ${ua.lineId}`, error?.message || error);
  }
}

module.exports = {
  registerTimeoutMs,
  initSbcFailoverState,
  applyActiveEndpoint,
  getSbcEndpointStatus,
  addRegisterWaiter,
  settleRegisterWaiter,
  failoverToSecondary,
  attemptFailbackToPrimary,
  startSbcResilienceTimers,
  stopSbcResilienceTimers,
  markEndpointSuccess,
  markEndpointFailure,
  notifySbcPathChanged,
};
