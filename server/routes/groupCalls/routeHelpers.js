const {
  createCallSession,
  getCallSession,
  updateCallSession,
  getLineConfiguration
} = require('../../services/databaseService');
const logger = require('../../utils/logger');
const crypto = require('crypto');

function getSocketHandler(req) {
  return req.app?.locals?.socketHandler;
}

module.exports = {
  createCallSession,
  getCallSession,
  updateCallSession,
  getLineConfiguration,
  getSocketHandler,
  logger,
  crypto,
};
