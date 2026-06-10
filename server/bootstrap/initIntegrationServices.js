const { initializeSIPGateway } = require('../services/sipService');
const logger = require('../utils/logger');

async function initIntegrationServices(server) {
  try {
    server.sipGateway = await initializeSIPGateway();
  } catch (error) {
    logger.warn('SIP gateway initialization failed:', error.message);
    server.sipGateway = null;
  }

  server.app.locals.sipGateway = server.sipGateway;

  try {
    const { initializeZoomService } = require('../services/zoomService');
    const zoomService = initializeZoomService();
    await zoomService.initialize();
    server.app.locals.zoomService = zoomService;
    logger.info('Zoom service initialized');
  } catch (error) {
    logger.warn('Zoom service initialization failed:', error.message);
  }

  try {
    const { initializeZoomMatrixBridge } = require('../services/zoomMatrixBridge');
    const zoomMatrixBridge = initializeZoomMatrixBridge();
    server.app.locals.zoomMatrixBridge = zoomMatrixBridge;
    logger.info('Zoom-Matrix bridge service initialized');
  } catch (error) {
    logger.warn('Zoom-Matrix bridge service initialization failed:', error.message);
  }

  try {
    const { initializeTeamsService } = require('../services/teamsService');
    const teamsService = initializeTeamsService();
    await teamsService.initialize();
    server.app.locals.teamsService = teamsService;
    logger.info('Teams service initialized');
  } catch (error) {
    logger.warn('Teams service initialization failed:', error.message);
  }

  try {
    const { initializeTeamsMatrixBridge } = require('../services/teamsMatrixBridge');
    const teamsMatrixBridge = initializeTeamsMatrixBridge();
    server.app.locals.teamsMatrixBridge = teamsMatrixBridge;
    logger.info('Teams-Matrix bridge service initialized');
  } catch (error) {
    logger.warn('Teams-Matrix bridge service initialization failed:', error.message);
  }
}

module.exports = { initIntegrationServices };
