const logger = require('../../utils/logger');
const { SubscriberError } = require('../../services/subscribers/errors');

function requirePlatformAdmin(req, res, next) {
  if (req.user?.role !== 'platform_admin') {
    return res.status(403).json({ error: 'Platform admin access required' });
  }
  return next();
}

function handleServiceError(res, error, fallbackMessage) {
  if (error instanceof SubscriberError) {
    const body = { error: error.message };
    if (error.details) body.details = error.details;
    if (error.extra) Object.assign(body, error.extra);
    return res.status(error.status).json(body);
  }
  logger.error(fallbackMessage, error);
  return res.status(500).json({
    error: fallbackMessage,
    details: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
}

function actorId(req) {
  return req.user?.id || req.user?.userId || null;
}

module.exports = {
  requirePlatformAdmin,
  handleServiceError,
  actorId,
};
