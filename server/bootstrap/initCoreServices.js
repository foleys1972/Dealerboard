const { initializeDatabase } = require('../services/databaseService');
const { initializeRedis } = require('../services/redisService');
const { SessionManager } = require('../services/sessionManager');
const { groupService } = require('../services/groupService');
const { initializeMediaSoup } = require('../services/mediaSoupService');
const { initializeAudioRouting } = require('../services/audioRoutingService');
const logger = require('../utils/logger');

async function initCoreServices(server) {
  try {
    await initializeDatabase();
  } catch (error) {
    logger.warn('Database initialization failed:', error.message);
  }

  try {
    await groupService.initialize();
  } catch (error) {
    logger.warn('Group service initialization failed:', error.message);
  }

  try {
    server.redisClient = await initializeRedis();
  } catch (error) {
    logger.warn('Redis initialization failed:', error.message);
    server.redisClient = null;
  }

  try {
    server.sessionManager = new SessionManager(server.redisClient);
    await server.sessionManager.initialize();
  } catch (error) {
    logger.warn('Session manager initialization failed:', error.message);
    server.sessionManager = null;
  }

  try {
    server.mediaSoupWorker = await initializeMediaSoup();
  } catch (error) {
    logger.warn('MediaSoup initialization failed:', error.message);
    server.mediaSoupWorker = null;
  }

  try {
    await initializeAudioRouting();
  } catch (error) {
    logger.warn('Audio routing initialization failed:', error.message);
  }
}

module.exports = { initCoreServices };
