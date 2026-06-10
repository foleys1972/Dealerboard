const logger = require('../../utils/logger');
const { getSubscriberByAuthToken } = require('../../db/subscribers/subscribers');
const { SubscriberApiError } = require('../../services/subscriberApi/errors');

async function authenticateSubscriber(req, res, next) {
  try {
    const authToken = req.headers['x-subscriber-token'] || req.query.token;

    if (!authToken) {
      return res.status(401).json({ error: 'Subscriber authentication token required' });
    }

    const subscriber = await getSubscriberByAuthToken(authToken);
    if (!subscriber) {
      return res.status(401).json({ error: 'Invalid subscriber token' });
    }

    req.subscriber = subscriber;
    next();
  } catch (error) {
    logger.error('Subscriber authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

function getSocketHandler(req) {
  return req.app?.locals?.socketHandler;
}

function handleServiceError(res, error, fallbackMessage) {
  if (error instanceof SubscriberApiError) {
    const body = { error: error.message };
    if (error.details) body.details = error.details;
    return res.status(error.status).json(body);
  }
  logger.error(fallbackMessage, error);
  return res.status(500).json({
    error: fallbackMessage,
    details: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
}

module.exports = {
  authenticateSubscriber,
  getSocketHandler,
  handleServiceError,
};