const logger = require('../../utils/logger');
const { LineOperationError } = require('../../services/dealerboard/errors');
const { isAdminRole } = require('../../services/dealerboard/validators');

function handleServiceError(res, error, fallbackMessage) {
  if (error instanceof LineOperationError) {
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

function requireAdmin(req, res) {
  if (!isAdminRole(req.user.role)) {
    res.status(403).json({ error: 'Admin access required' });
    return false;
  }
  return true;
}

module.exports = {
  handleServiceError,
  requireAdmin,
};
