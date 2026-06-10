const { initializeMatrixClient } = require('../services/matrixService');
const { initializeMatrixAppService } = require('../services/matrixAppService');
const { initializeMatrixUserSync } = require('../services/matrixUserSync');
const logger = require('../utils/logger');

async function initMatrixServices(server) {
  try {
    server.matrixClient = await initializeMatrixClient();
  } catch (error) {
    logger.warn('Matrix client initialization failed:', error.message);
    server.matrixClient = null;
  }

  try {
    server.matrixAppService = await initializeMatrixAppService();
  } catch (error) {
    logger.warn('Matrix AppService initialization failed:', error.message);
    server.matrixAppService = null;
  }

  try {
    await initializeMatrixUserSync();
  } catch (error) {
    logger.warn('Matrix user sync initialization failed:', error.message);
  }
}

module.exports = { initMatrixServices };
