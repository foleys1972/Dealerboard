const logger = require('../utils/logger');

class SIPGateway {
  constructor() {
    this.isEnabled = process.env.SIP_ENABLED === 'true';
    this.host = process.env.SIP_HOST || 'localhost';
    this.port = parseInt(process.env.SIP_PORT) || 5060;
    this.username = process.env.SIP_USERNAME;
    this.password = process.env.SIP_PASSWORD;
    this.domain = process.env.SIP_DOMAIN;
    
    this.socket = null;
    this.connected = false;
    this.callId = 1;
    this.activeCalls = new Map();
    this.sipUsers = new Map();
    this.sequence = 1;
    
    if (this.isEnabled) {
      this.initialize();
    }
  }

  async initialize() {
    try {
      logger.warn('SIP Gateway not available - install sip.js for full functionality');
      return null;
    } catch (error) {
      logger.error('Failed to initialize SIP Gateway:', error);
      throw error;
    }
  }

  async stop() {
    this.connected = false;
    this.activeCalls.clear();
    logger.info('SIP Gateway stopped');
  }

  getActiveCalls() {
    return Array.from(this.activeCalls.values());
  }

  getCall(callId) {
    return this.activeCalls.get(callId);
  }

  async endCall(callId) {
    throw new Error('SIP integration not available');
  }

  async bridgeWebRTCToSIP(webrtcCallId, sipUri) {
    throw new Error('SIP integration not available');
  }

  async bridgeSIPToWebRTC(sipCallId, webrtcRoomId) {
    throw new Error('SIP integration not available');
  }
}

async function initializeSIPGateway() {
  try {
    if (process.env.SIP_ENABLED !== 'true') {
      logger.info('SIP Gateway disabled');
      return null;
    }

    const sipGateway = new SIPGateway();
    logger.info('SIP Gateway initialized successfully');
    return sipGateway;
  } catch (error) {
    logger.error('Failed to initialize SIP Gateway:', error);
    throw error;
  }
}

module.exports = {
  initializeSIPGateway,
  SIPGateway,
};
