/**
 * Local capacity / load telemetry for this server node.
 *
 * A subscriber reports this snapshot in its heartbeat so the publisher can make
 * load-aware routing decisions (overflow users from a busy subscriber to its
 * secondary). "Load" is primarily the live connected-user count vs a configured
 * capacity; SFU media counts are included as secondary diagnostics.
 */

let activeUsersProvider = null;

/**
 * Register a function returning the current connected-user count. index.js wires
 * this to the Socket.IO engine once the server is up.
 */
function setActiveUsersProvider(fn) {
  activeUsersProvider = typeof fn === 'function' ? fn : null;
}

function getConfiguredCapacity() {
  const n = parseInt(process.env.SUBSCRIBER_MAX_USERS, 10);
  return Number.isFinite(n) && n > 0 ? n : 200;
}

/**
 * Compute a load snapshot for this node. Never throws.
 * @returns {Promise<{activeUsers:number, capacity:number, loadRatio:number,
 *   sfu:{routers:number,transports:number,producers:number,consumers:number}|null,
 *   updatedAt:string}>}
 */
async function getLocalLoadSnapshot() {
  let activeUsers = 0;
  try {
    activeUsers = activeUsersProvider ? Number(activeUsersProvider()) || 0 : 0;
  } catch {
    activeUsers = 0;
  }

  let sfu = null;
  try {
    const { getSFUStats } = require('./mediaSoupService');
    const s = await getSFUStats();
    if (s) {
      sfu = {
        routers: s.routers || 0,
        transports: s.transports || 0,
        producers: s.producers || 0,
        consumers: s.consumers || 0,
      };
    }
  } catch {
    sfu = null;
  }

  const capacity = getConfiguredCapacity();
  const loadRatio = capacity > 0 ? Math.min(1, activeUsers / capacity) : 0;

  return {
    activeUsers,
    capacity,
    loadRatio: Number(loadRatio.toFixed(4)),
    sfu,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  setActiveUsersProvider,
  getLocalLoadSnapshot,
  getConfiguredCapacity,
};
