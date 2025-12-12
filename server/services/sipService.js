const dgram = require('dgram');
const crypto = require('crypto');
const { pool } = require('./databaseService');
const logger = require('../utils/logger');

class SIPUserAgent {
  constructor(lineId, uriAddress, sbcDetails, mode) {
    this.lineId = lineId;
    this.uriAddress = uriAddress;
    this.sbcDetails = sbcDetails || {};
    this.mode = mode; // ARD, MRD, HOOT
    this.socket = null;
    this.connected = false;
    this.registered = false;
    this.callId = 1;
    this.activeCalls = new Map();
    this.sequence = 1;
    this.tag = crypto.randomBytes(4).toString('hex');
    
    // Extract SBC details
    this.sbcHost = this.sbcDetails.host || process.env.SIP_HOST || 'localhost';
    this.sbcPort = this.sbcDetails.port || parseInt(process.env.SIP_PORT) || 5060;
    this.username = this.sbcDetails.username || this.uriAddress.split('@')[0];
    this.password = this.sbcDetails.password || process.env.SIP_PASSWORD;
    this.domain = this.sbcDetails.domain || this.uriAddress.split('@')[1] || process.env.SIP_DOMAIN;
    
    this.localPort = null;
    this.contactUri = null;
  }

  async initialize() {
    try {
      // Create UDP socket for SIP
      this.socket = dgram.createSocket('udp4');
      
      // Bind to random port
      this.socket.bind(0, () => {
        this.localPort = this.socket.address().port;
        this.contactUri = `sip:${this.username}@${this.domain}:${this.localPort}`;
        logger.info(`SIP UA initialized for line ${this.lineId}`, {
          uri: this.uriAddress,
          localPort: this.localPort,
          mode: this.mode
        });
      });

      // Handle incoming SIP messages
      this.socket.on('message', (msg, rinfo) => {
        this.handleSIPMessage(msg.toString(), rinfo);
      });

      this.socket.on('error', (err) => {
        logger.error(`SIP socket error for line ${this.lineId}:`, err);
      });

      // Register with SBC
      await this.register();
      
      this.connected = true;
      return true;
    } catch (error) {
      logger.error(`Failed to initialize SIP UA for line ${this.lineId}:`, error);
      throw error;
    }
  }

  async register() {
    try {
      const callId = this.generateCallId();
      const branch = this.generateBranch();
      const cseq = this.sequence++;
      
      const registerMessage = `REGISTER sip:${this.domain} SIP/2.0\r
Via: SIP/2.0/UDP ${this.sbcHost}:${this.localPort};branch=${branch}\r
From: <sip:${this.username}@${this.domain}>;tag=${this.tag}\r
To: <sip:${this.username}@${this.domain}>\r
Call-ID: ${callId}\r
CSeq: ${cseq} REGISTER\r
Contact: <${this.contactUri}>\r
Expires: 3600\r
Content-Length: 0\r
\r
`;

      await this.sendMessage(registerMessage);
      this.registered = true;
      logger.info(`SIP registration sent for line ${this.lineId}`);
    } catch (error) {
      logger.error(`Failed to register SIP UA for line ${this.lineId}:`, error);
      throw error;
    }
  }

  async makeCall(targetUri, options = {}) {
    try {
      const callId = this.generateCallId();
      const branch = this.generateBranch();
      const cseq = this.sequence++;
      const fromTag = this.tag;
      const toTag = crypto.randomBytes(4).toString('hex');
      
      const call = {
        callId,
        lineId: this.lineId,
        targetUri,
        status: 'initiating',
        mode: this.mode,
        createdAt: new Date(),
        fromTag,
        toTag,
        localSdp: null,
        remoteSdp: null,
        ...options
      };

      this.activeCalls.set(callId, call);

      // Build SDP offer
      const sdpOffer = this.buildSDPOffer(callId);

      const inviteMessage = `INVITE ${targetUri} SIP/2.0\r
Via: SIP/2.0/UDP ${this.sbcHost}:${this.localPort};branch=${branch}\r
From: <sip:${this.username}@${this.domain}>;tag=${fromTag}\r
To: <${targetUri}>\r
Call-ID: ${callId}\r
CSeq: ${cseq} INVITE\r
Contact: <${this.contactUri}>\r
Content-Type: application/sdp\r
Content-Length: ${sdpOffer.length}\r
\r
${sdpOffer}`;

      await this.sendMessage(inviteMessage);
      call.status = 'ringing';
      
      logger.info(`SIP INVITE sent for line ${this.lineId}`, {
        callId,
        targetUri,
        mode: this.mode
      });

      return callId;
    } catch (error) {
      logger.error(`Failed to make SIP call for line ${this.lineId}:`, error);
      throw error;
    }
  }

  async sendRingingSignal(targetUri) {
    try {
      // For MRD mode, send a re-INVITE with early media
      const callId = this.generateCallId();
      const branch = this.generateBranch();
      const cseq = this.sequence++;
      
      const sdpOffer = this.buildSDPOffer(callId);
      
      const inviteMessage = `INVITE ${targetUri} SIP/2.0\r
Via: SIP/2.0/UDP ${this.sbcHost}:${this.localPort};branch=${branch}\r
From: <sip:${this.username}@${this.domain}>;tag=${this.tag}\r
To: <${targetUri}>\r
Call-ID: ${callId}\r
CSeq: ${cseq} INVITE\r
Contact: <${this.contactUri}>\r
Content-Type: application/sdp\r
Content-Length: ${sdpOffer.length}\r
\r
${sdpOffer}`;

      await this.sendMessage(inviteMessage);
      logger.info(`Ringing signal sent for line ${this.lineId}`, { targetUri });
    } catch (error) {
      logger.error(`Failed to send ringing signal for line ${this.lineId}:`, error);
      throw error;
    }
  }

  async sendDTMF(callId, digit) {
    try {
      const call = this.activeCalls.get(callId);
      if (!call) {
        throw new Error(`Call ${callId} not found`);
      }

      // Send DTMF via RFC 2833 (in-band) or INFO method
      const branch = this.generateBranch();
      const cseq = this.sequence++;
      
      const infoMessage = `INFO ${call.targetUri} SIP/2.0\r
Via: SIP/2.0/UDP ${this.sbcHost}:${this.localPort};branch=${branch}\r
From: <sip:${this.username}@${this.domain}>;tag=${call.fromTag}\r
To: <${call.targetUri}>;tag=${call.toTag}\r
Call-ID: ${callId}\r
CSeq: ${cseq} INFO\r
Content-Type: application/dtmf-relay\r
Content-Length: 22\r
\r
Signal=${digit}\r
Duration=200\r
`;

      await this.sendMessage(infoMessage);
      logger.info(`DTMF digit ${digit} sent for line ${this.lineId}`, { callId });
    } catch (error) {
      logger.error(`Failed to send DTMF for line ${this.lineId}:`, error);
      throw error;
    }
  }

  async endCall(callId) {
    try {
      const call = this.activeCalls.get(callId);
      if (!call) {
        throw new Error(`Call ${callId} not found`);
      }

      const branch = this.generateBranch();
      const cseq = this.sequence++;
      
      const byeMessage = `BYE ${call.targetUri} SIP/2.0\r
Via: SIP/2.0/UDP ${this.sbcHost}:${this.localPort};branch=${branch}\r
From: <sip:${this.username}@${this.domain}>;tag=${call.fromTag}\r
To: <${call.targetUri}>;tag=${call.toTag}\r
Call-ID: ${callId}\r
CSeq: ${cseq} BYE\r
Content-Length: 0\r
\r
`;

      await this.sendMessage(byeMessage);
      call.status = 'ended';
      this.activeCalls.delete(callId);
      
      logger.info(`SIP call ended for line ${this.lineId}`, { callId });
    } catch (error) {
      logger.error(`Failed to end SIP call for line ${this.lineId}:`, error);
      throw error;
    }
  }

  handleSIPMessage(message, rinfo) {
    try {
      const lines = message.split('\r\n');
      const requestLine = lines[0];
      
      if (requestLine.startsWith('SIP/2.0')) {
        // Response
        this.handleSIPResponse(message, rinfo);
      } else {
        // Request
        this.handleSIPRequest(message, rinfo);
      }
    } catch (error) {
      logger.error(`Error handling SIP message for line ${this.lineId}:`, error);
    }
  }

  handleSIPResponse(message, rinfo) {
    const statusMatch = message.match(/SIP\/2\.0 (\d{3})/);
    if (!statusMatch) return;
    
    const statusCode = parseInt(statusMatch[1]);
    const callIdMatch = message.match(/Call-ID:\s*([^\r\n]+)/);
    const callId = callIdMatch ? callIdMatch[1].trim() : null;
    
    const call = callId ? this.activeCalls.get(callId) : null;

    if (statusCode === 100) {
      // Trying
      logger.debug(`SIP 100 Trying for line ${this.lineId}`, { callId });
    } else if (statusCode === 180) {
      // Ringing
      if (call) {
        call.status = 'ringing';
      }
      logger.info(`SIP 180 Ringing for line ${this.lineId}`, { callId });
    } else if (statusCode === 200) {
        // OK
        if (message.includes('INVITE')) {
          // Call answered
          if (call) {
            call.status = 'connected';
            // Extract SDP from response
            const sdpMatch = message.match(/\r\n\r\n([\s\S]+)/);
            if (sdpMatch) {
              call.remoteSdp = sdpMatch[1];
            }
            
            // Emit event for bridge to connect
            if (this.onCallConnected) {
              this.onCallConnected(callId, call);
            }
          }
          
          // Send ACK
          this.sendACK(callId, rinfo);
          logger.info(`SIP call connected for line ${this.lineId}`, { callId });
        } else if (message.includes('REGISTER')) {
          logger.info(`SIP registration successful for line ${this.lineId}`);
        }
      } else if (statusCode >= 400) {
      // Error
      if (call) {
        call.status = 'failed';
        this.activeCalls.delete(callId);
      }
      logger.warn(`SIP error ${statusCode} for line ${this.lineId}`, { callId });
    }
  }

  handleSIPRequest(message, rinfo) {
    // Handle incoming INVITE, BYE, etc.
    if (message.includes('INVITE')) {
      this.handleIncomingInvite(message, rinfo);
    } else if (message.includes('BYE')) {
      this.handleIncomingBye(message, rinfo);
    }
  }

  async handleIncomingInvite(message, rinfo) {
    try {
      const callIdMatch = message.match(/Call-ID:\s*([^\r\n]+)/);
      const callId = callIdMatch ? callIdMatch[1].trim() : null;
      
      if (!callId) return;

      // Extract SDP
      const sdpMatch = message.match(/\r\n\r\n([\s\S]+)/);
      const remoteSdp = sdpMatch ? sdpMatch[1] : null;

      const call = {
        callId,
        lineId: this.lineId,
        status: 'incoming',
        mode: this.mode,
        createdAt: new Date(),
        remoteSdp,
        rinfo
      };

      this.activeCalls.set(callId, call);

      // Auto-answer for ARD mode, or send 180 Ringing for others
      if (this.mode === 'ARD') {
        // Auto-answer
        const localSdp = this.buildSDPOffer(callId);
        await this.sendResponse(200, callId, rinfo, localSdp);
        call.status = 'connected';
        call.localSdp = localSdp;
      } else {
        // Send 180 Ringing
        await this.sendResponse(180, callId, rinfo);
        call.status = 'ringing';
      }

      logger.info(`Incoming SIP call for line ${this.lineId}`, { callId, mode: this.mode });
    } catch (error) {
      logger.error(`Error handling incoming INVITE for line ${this.lineId}:`, error);
    }
  }

  async handleIncomingBye(message, rinfo) {
    const callIdMatch = message.match(/Call-ID:\s*([^\r\n]+)/);
    const callId = callIdMatch ? callIdMatch[1].trim() : null;
    
    if (callId) {
      const call = this.activeCalls.get(callId);
      if (call) {
        call.status = 'ended';
        this.activeCalls.delete(callId);
      }
      
      // Send 200 OK
      await this.sendResponse(200, callId, rinfo);
      logger.info(`Incoming BYE handled for line ${this.lineId}`, { callId });
    }
  }

  async sendResponse(statusCode, callId, rinfo, sdp = null) {
    try {
      const statusText = this.getStatusText(statusCode);
      const branch = this.generateBranch();
      
      let response = `SIP/2.0 ${statusCode} ${statusText}\r
Via: SIP/2.0/UDP ${rinfo.address}:${rinfo.port};branch=${branch}\r
From: <sip:${this.username}@${this.domain}>;tag=${this.tag}\r
To: <sip:${this.username}@${this.domain}>;tag=${crypto.randomBytes(4).toString('hex')}\r
Call-ID: ${callId}\r
CSeq: 1 INVITE\r
Contact: <${this.contactUri}>\r
`;

      if (sdp) {
        response += `Content-Type: application/sdp\r
Content-Length: ${sdp.length}\r
\r
${sdp}`;
      } else {
        response += `Content-Length: 0\r
\r
`;
      }

      await this.sendMessage(response, rinfo.address, rinfo.port);
    } catch (error) {
      logger.error(`Failed to send SIP response for line ${this.lineId}:`, error);
      throw error;
    }
  }

  async sendACK(callId, rinfo) {
    try {
      const branch = this.generateBranch();
      const ackMessage = `ACK ${this.uriAddress} SIP/2.0\r
Via: SIP/2.0/UDP ${this.sbcHost}:${this.localPort};branch=${branch}\r
From: <sip:${this.username}@${this.domain}>;tag=${this.tag}\r
To: <${this.uriAddress}>\r
Call-ID: ${callId}\r
CSeq: 1 ACK\r
Content-Length: 0\r
\r
`;

      await this.sendMessage(ackMessage, rinfo.address, rinfo.port);
    } catch (error) {
      logger.error(`Failed to send ACK for line ${this.lineId}:`, error);
    }
  }

  buildSDPOffer(callId) {
    const sessionId = Date.now();
    const rtpPort = 10000 + (this.localPort % 1000);
    
    return `v=0\r
o=- ${sessionId} ${sessionId} IN IP4 ${this.sbcHost}\r
s=Intercom Call\r
c=IN IP4 ${this.sbcHost}\r
t=0 0\r
m=audio ${rtpPort} RTP/AVP 0 8 101\r
a=rtpmap:0 PCMU/8000\r
a=rtpmap:8 PCMA/8000\r
a=rtpmap:101 telephone-event/8000\r
a=sendrecv\r
`;
  }

  async sendMessage(message, host = this.sbcHost, port = this.sbcPort) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('SIP socket not initialized'));
        return;
      }

      const buffer = Buffer.from(message);
      this.socket.send(buffer, 0, buffer.length, port, host, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  generateCallId() {
    return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}@${this.domain}`;
  }

  generateBranch() {
    return `z9hG4bK${crypto.randomBytes(8).toString('hex')}`;
  }

  getStatusText(code) {
    const statusTexts = {
      100: 'Trying',
      180: 'Ringing',
      200: 'OK',
      400: 'Bad Request',
      401: 'Unauthorized',
      404: 'Not Found',
      486: 'Busy Here',
      487: 'Request Terminated',
      500: 'Server Internal Error'
    };
    return statusTexts[code] || 'Unknown';
  }

  async stop() {
    try {
      // End all active calls
      for (const [callId] of this.activeCalls) {
        await this.endCall(callId);
      }

      // Unregister
      if (this.registered) {
        const callId = this.generateCallId();
        const branch = this.generateBranch();
        const cseq = this.sequence++;
        
        const unregisterMessage = `REGISTER sip:${this.domain} SIP/2.0\r
Via: SIP/2.0/UDP ${this.sbcHost}:${this.localPort};branch=${branch}\r
From: <sip:${this.username}@${this.domain}>;tag=${this.tag}\r
To: <sip:${this.username}@${this.domain}>\r
Call-ID: ${callId}\r
CSeq: ${cseq} REGISTER\r
Contact: <${this.contactUri}>\r
Expires: 0\r
Content-Length: 0\r
\r
`;

        await this.sendMessage(unregisterMessage);
      }

      if (this.socket) {
        this.socket.close();
      }

      this.connected = false;
      this.registered = false;
      logger.info(`SIP UA stopped for line ${this.lineId}`);
    } catch (error) {
      logger.error(`Error stopping SIP UA for line ${this.lineId}:`, error);
    }
  }

  getActiveCalls() {
    return Array.from(this.activeCalls.values());
  }

  getCall(callId) {
    return this.activeCalls.get(callId);
  }
}

class SIPGateway {
  constructor() {
    this.isEnabled = process.env.SIP_ENABLED === 'true';
    this.userAgents = new Map(); // lineId -> SIPUserAgent
    this.initialized = false;
  }

  async initialize() {
    if (!this.isEnabled) {
      logger.info('SIP Gateway disabled');
      return;
    }

    try {
      // Load all active private wires and DDI lines
      await this.loadLines();
      this.initialized = true;
      logger.info('SIP Gateway initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize SIP Gateway:', error);
      throw error;
    }
  }

  async loadLines() {
    try {
      // Load private wires
      const privateWires = await pool.query(
        `SELECT id, uri_address, sbc_details, mode, is_active 
         FROM dealerboard_private_wires 
         WHERE is_active = true`
      );

      for (const wire of privateWires.rows) {
        try {
          const ua = new SIPUserAgent(
            wire.id,
            wire.uri_address,
            wire.sbc_details,
            wire.mode
          );
          await ua.initialize();
          this.userAgents.set(wire.id, ua);
          logger.info(`SIP UA loaded for private wire ${wire.id}`);
        } catch (error) {
          logger.error(`Failed to load SIP UA for private wire ${wire.id}:`, error);
        }
      }

      // Load DDI lines
      const ddiLines = await pool.query(
        `SELECT id, line_number, sbc_details, connection_details, is_active 
         FROM dealerboard_ddi_lines 
         WHERE is_active = true`
      );

      for (const line of ddiLines.rows) {
        try {
          const uriAddress = line.connection_details?.uri || `sip:${line.line_number}@${process.env.SIP_DOMAIN || 'localhost'}`;
          const ua = new SIPUserAgent(
            line.id,
            uriAddress,
            line.sbc_details,
            'DDI'
          );
          await ua.initialize();
          this.userAgents.set(line.id, ua);
          logger.info(`SIP UA loaded for DDI line ${line.id}`);
        } catch (error) {
          logger.error(`Failed to load SIP UA for DDI line ${line.id}:`, error);
        }
      }
    } catch (error) {
      logger.error('Failed to load SIP lines:', error);
      throw error;
    }
  }

  getUserAgent(lineId) {
    return this.userAgents.get(lineId);
  }

  setCallConnectedCallback(lineId, callback) {
    const ua = this.getUserAgent(lineId);
    if (ua) {
      ua.onCallConnected = callback;
    }
  }

  async makeCall(lineId, targetUri, options = {}) {
    const ua = this.getUserAgent(lineId);
    if (!ua) {
      throw new Error(`SIP UA not found for line ${lineId}`);
    }
    return await ua.makeCall(targetUri, options);
  }

  async sendRingingSignal(lineId, targetUri) {
    const ua = this.getUserAgent(lineId);
    if (!ua) {
      throw new Error(`SIP UA not found for line ${lineId}`);
    }
    return await ua.sendRingingSignal(targetUri);
  }

  async sendDTMF(lineId, callId, digit) {
    const ua = this.getUserAgent(lineId);
    if (!ua) {
      throw new Error(`SIP UA not found for line ${lineId}`);
    }
    return await ua.sendDTMF(callId, digit);
  }

  async endCall(lineId, callId) {
    const ua = this.getUserAgent(lineId);
    if (!ua) {
      throw new Error(`SIP UA not found for line ${lineId}`);
    }
    return await ua.endCall(callId);
  }

  getActiveCalls(lineId = null) {
    if (lineId) {
      const ua = this.getUserAgent(lineId);
      return ua ? ua.getActiveCalls() : [];
    }
    
    const allCalls = [];
    for (const ua of this.userAgents.values()) {
      allCalls.push(...ua.getActiveCalls());
    }
    return allCalls;
  }

  async stop() {
    for (const [lineId, ua] of this.userAgents) {
      try {
        await ua.stop();
      } catch (error) {
        logger.error(`Error stopping SIP UA for line ${lineId}:`, error);
      }
    }
    this.userAgents.clear();
    this.initialized = false;
    logger.info('SIP Gateway stopped');
  }
}

let sipGatewayInstance = null;

async function initializeSIPGateway() {
  try {
    if (process.env.SIP_ENABLED !== 'true') {
      logger.info('SIP Gateway disabled');
      return null;
    }

    sipGatewayInstance = new SIPGateway();
    await sipGatewayInstance.initialize();
    logger.info('SIP Gateway initialized successfully');
    return sipGatewayInstance;
  } catch (error) {
    logger.error('Failed to initialize SIP Gateway:', error);
    throw error;
  }
}

function getSIPGateway() {
  return sipGatewayInstance;
}

module.exports = {
  initializeSIPGateway,
  getSIPGateway,
  SIPGateway,
  SIPUserAgent,
};
