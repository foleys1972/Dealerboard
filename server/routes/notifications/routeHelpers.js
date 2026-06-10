const { getUserFromRequest } = require('../../middleware/auth');

function getUserIdFromReq(req) {
  const payload = getUserFromRequest(req);
  if (!payload) return null;
  return String(payload.userId || payload.id || payload.sub || '');
}

module.exports = { getUserIdFromReq };
