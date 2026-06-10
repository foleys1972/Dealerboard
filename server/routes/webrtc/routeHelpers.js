const { authenticateToken } = require('../authRoutes');

// Unauthenticated stats access is a development convenience only; never honor it in production.
const allowStatsNoAuth =
  process.env.NODE_ENV !== 'production' &&
  String(process.env.ALLOW_WEBRTC_STATS_NO_AUTH || '').toLowerCase() === 'true';

function attachAuthMiddleware(router) {
  router.use((req, res, next) => {
    try {
      if (allowStatsNoAuth && req.method === 'GET') {
        const p = req.path || '';
        if (
          /^\/producer\/[^/]+\/stats$/i.test(p) ||
          /^\/consumer\/[^/]+\/stats$/i.test(p) ||
          /^\/router\/stats$/i.test(p) ||
          /^\/groups\/[^/]+\/router\/dump$/i.test(p) ||
          /^\/routers$/i.test(p) ||
          /^\/sfu\/stats$/i.test(p)
        ) {
          return next();
        }
      }
    } catch {}

    return authenticateToken(req, res, next);
  });
}

function getScopedGroupId(req, groupId) {
  const tid = req.user?.tid || process.env.DEFAULT_TENANT_ID || 'tenant-default';
  const stid = req.user?.stid || process.env.DEFAULT_SUB_TENANT_ID || 'subtenant-default';
  const base = groupId || 'global';
  return `${tid}:${stid}:${base}`;
}

module.exports = {
  attachAuthMiddleware,
  getScopedGroupId,
};
