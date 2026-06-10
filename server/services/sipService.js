const dgram = require('dgram');
const crypto = require('crypto');
const { pool } = require('./databaseService');
const logger = require('../utils/logger');
const {
  registerTimeoutMs,
  initSbcFailoverState,
  getSbcEndpointStatus,
  addRegisterWaiter,
  settleRegisterWaiter,
  failoverToSecondary,
  startSbcResilienceTimers,
  stopSbcResilienceTimers,
  markEndpointSuccess,
  markEndpointFailure,
} = require('./sipSbcFailover');
const { parseWwwAuthenticate, buildAuthorizationHeader } = require('./sip/sipDigestAuth');
const { buildAudioOffer, getAnnouncedIp } = require('./sip/sipSdp');
const { getCallMediaSession, releaseCallMedia, allocateCallMedia } = require('./sip/sipLineMedia');
const { scopeLineMediaGroupId, ensureLineMediaRouter } = require('./dealerboard/lineMediaService');
const { resolveSbcDetailsForDdiRow } = require('./dealerboard/sipRouteResolver');

class SIPUserAgent {
  constructor(lineId, uriAddress, sbcDetails, mode, options = {}) {
    this.lineId = lineId;
    this.uriAddress = uriAddress;
    this.sbcDetails = sbcDetails || {};
    this.mode = mode; // ARD, MRD, HOOT
    this.ringTimeoutSeconds = Number.isFinite(options?.ringTimeoutSeconds)
      ? options.ringTimeoutSeconds
      : (parseInt(process.env.SIP_RING_TIMEOUT_SECONDS || '30', 10) || 30);
    this.socket = null;
    this.connected = false;
    this.registered = false;
    this.callId = 1;
    this.activeCalls = new Map();
    this.sequence = 1;
    this.tag = crypto.randomBytes(4).toString('hex');

    initSbcFailoverState(this, this.sbcDetails);
    
    this.localPort = null;
    this.contactUri = null;

    this._registerInterval = null;
    this._registerExpiresSeconds = null;

    // Optional callbacks (set by server)
    this.onIncomingCall = null;
    this.onCallEnded = null;
    this.onCallStateChanged = null;
    this.onSbcPathChanged = null;
    this.onSipLegReplaced = null;

    this._authChallenge = null;
    this._authNc = 0;
  }

  async initialize() {
    try {
      // Create UDP socket for SIP
      this.socket = dgram.createSocket('udp4');

      // Bind to random port (await binding before attempting REGISTER)
      await new Promise((resolve, reject) => {
        const onError = (err) => {
          try { this.socket?.off('listening', onListening); } catch {}
          reject(err);
        };
        const onListening = () => {
          try { this.socket?.off('error', onError); } catch {}
          resolve();
        };

        try {
          this.socket.once('error', onError);
          this.socket.once('listening', onListening);
          this.socket.bind(0);
        } catch (e) {
          reject(e);
        }
      });

      this.localPort = this.socket.address().port;
      this.contactUri = `sip:${this.username}@${this.domain}:${this.localPort}`;
      logger.info(`SIP UA initialized for line ${this.lineId}`, {
        uri: this.uriAddress,
        localPort: this.localPort,
        mode: this.mode,
        sbcHost: this.sbcHost,
        sbcRole: this._activeEndpointRole,
        hasSecondarySbc: (this._sbcEndpoints?.length || 0) > 1,
      });

      // Handle incoming SIP messages
      this.socket.on('message', (msg, rinfo) => {
        this.handleSIPMessage(msg.toString(), rinfo);
      });

      this.socket.on('error', (err) => {
        logger.error(`SIP socket error for line ${this.lineId}:`, err);
      });

      // Register with SBC
      // If HA is enabled, keep REGISTER expiry short so failover can re-register quickly.
      // If HA is disabled, keep long expiry to reduce traffic.
      this._registerExpiresSeconds = process.env.SIP_HA_ENABLED === 'true'
        ? (parseInt(process.env.SIP_REGISTER_EXPIRES_SECONDS || '30', 10) || 30)
        : (parseInt(process.env.SIP_REGISTER_EXPIRES_SECONDS || '3600', 10) || 3600);

      await this.register({ expiresSeconds: this._registerExpiresSeconds });
      startSbcResilienceTimers(this);

      // Periodic re-register to maintain registration and support fast failover.
      // Renew at ~50% of expiry.
      const renewSeconds = Math.max(5, Math.floor(this._registerExpiresSeconds / 2));
      this._registerInterval = setInterval(() => {
        this.register({ expiresSeconds: this._registerExpiresSeconds }).catch((e) => {
          try { logger.warn(`SIP REGISTER refresh failed for line ${this.lineId}: ${e?.message || e}`); } catch {}
        });
      }, renewSeconds * 1000);
      
      this.connected = true;
      return true;
    } catch (error) {
      logger.error(`Failed to initialize SIP UA for line ${this.lineId}:`, error);
      throw error;
    }
  }

  async register(options = {}) {
    const { expiresSeconds, _isFailoverAttempt, _isFailbackProbe, _isHealthRefresh } = options;

    let lastError = null;
    for (let authAttempt = 0; authAttempt < 2; authAttempt += 1) {
      try {
        await this._sendRegister({
          expiresSeconds,
          withAuth: authAttempt > 0,
          isFailbackProbe: _isFailbackProbe,
        });
        this.registered = true;
        markEndpointSuccess(this);
        logger.info(`SIP registration successful for line ${this.lineId}`, {
          role: this._activeEndpointRole,
          host: this.sbcHost,
          digestAuth: authAttempt > 0,
        });
        return;
      } catch (error) {
        lastError = error;
        if (authAttempt === 0 && error?.code === 'SIP_AUTH_REQUIRED') {
          continue;
        }
        break;
      }
    }

    this.registered = false;
    markEndpointFailure(this, lastError?.message || String(lastError));

    if (!_isFailoverAttempt && !_isFailbackProbe && !_isHealthRefresh) {
      const switched = await failoverToSecondary(this, `register_failed: ${lastError?.message || lastError}`);
      if (switched) return;
    }

    if (_isFailbackProbe || _isHealthRefresh) {
      throw lastError;
    }

    logger.error(`Failed to register SIP UA for line ${this.lineId}:`, lastError);
    throw lastError;
  }

  async _sendRegister({ expiresSeconds, withAuth = false, isFailbackProbe = false }) {
    const callId = this.generateCallId();
    const branch = this.generateBranch();
    const cseq = this.sequence++;

    const exp = Number.isFinite(expiresSeconds)
      ? expiresSeconds
      : (parseInt(process.env.SIP_REGISTER_EXPIRES_SECONDS || '3600', 10) || 3600);

    const uri = `sip:${this.domain}`;
    let registerMessage = `REGISTER ${uri} SIP/2.0\r
Via: SIP/2.0/UDP ${this.sbcHost}:${this.localPort};branch=${branch}\r
From: <sip:${this.username}@${this.domain}>;tag=${this.tag}\r
To: <sip:${this.username}@${this.domain}>\r
Call-ID: ${callId}\r
CSeq: ${cseq} REGISTER\r
Contact: <${this.contactUri}>\r
Expires: ${exp}\r
`;

    if (withAuth && this._authChallenge) {
      this._authNc += 1;
      const authHeader = buildAuthorizationHeader({
        username: this.username,
        password: this.password,
        method: 'REGISTER',
        uri,
        challenge: this._authChallenge,
        nc: String(this._authNc).padStart(8, '0'),
      });
      if (authHeader) {
        registerMessage += `${authHeader}\r\n`;
      }
    }

    registerMessage += `Content-Length: 0\r
\r
`;

    const registerPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        settleRegisterWaiter(this, cseq, false, 'REGISTER timeout');
      }, registerTimeoutMs());

      addRegisterWaiter(this, {
        cseq,
        resolve: () => resolve(true),
        reject,
        timer,
        isFailbackProbe: !!isFailbackProbe,
      });
    });

    await this.sendMessage(registerMessage);
    await registerPromise;
  }

  async _sendInvite(call, { withAuth = false } = {}) {
    const { callId, targetUri, fromTag } = call;
    const branch = this.generateBranch();
    const cseq = this.sequence++;

    const sdpOffer = call.localSdp || this.buildSDPOffer(callId);

    let inviteMessage = `INVITE ${targetUri} SIP/2.0\r
Via: SIP/2.0/UDP ${this.sbcHost}:${this.localPort};branch=${branch}\r
From: <sip:${this.username}@${this.domain}>;tag=${fromTag}\r
To: <${targetUri}>\r
Call-ID: ${callId}\r
CSeq: ${cseq} INVITE\r
Contact: <${this.contactUri}>\r
`;

    if (withAuth && call._authChallenge) {
      this._authNc += 1;
      const authHeader = buildAuthorizationHeader({
        username: this.username,
        password: this.password,
        method: 'INVITE',
        uri: targetUri,
        challenge: call._authChallenge,
        headerName: call._authHeaderName || 'Authorization',
        nc: String(this._authNc).padStart(8, '0'),
      });
      if (authHeader) {
        inviteMessage += `${authHeader}\r\n`;
      }
    }

    inviteMessage += `Content-Type: application/sdp\r
Content-Length: ${sdpOffer.length}\r
\r
${sdpOffer}`;

    await this.sendMessage(inviteMessage);
    call._lastInviteCseq = cseq;
  }

  async unregister() {
    try {
      if (!this.socket || !this.localPort || !this.contactUri) return;
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
Expires: 0\r
Content-Length: 0\r
\r
`;

      await this.sendMessage(registerMessage);
    } catch (e) {
      // Best-effort only.
    }
  }

  async stop() {
    try {
      stopSbcResilienceTimers(this);

      if (this._registerInterval) {
        clearInterval(this._registerInterval);
        this._registerInterval = null;
      }

      // Best-effort unregister to allow fast failover.
      await this.unregister();
    } catch {}

    try {
      // End any local calls.
      for (const callId of Array.from(this.activeCalls.keys())) {
        try {
          await this.endCall(callId);
        } catch {}
      }
    } catch {}

    try {
      if (this.socket) {
        try { this.socket.removeAllListeners('message'); } catch {}
        try { this.socket.removeAllListeners('error'); } catch {}
        try { this.socket.close(); } catch {}
      }
    } catch {}

    this.socket = null;
    this.connected = false;
    this.registered = false;
  }

  async makeCall(targetUri, options = {}) {
    try {
      const callId = options.callId || this.generateCallId();
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
        ...options,
        callId,
        fromTag,
      };

      if (!getCallMediaSession(callId)) {
        try {
          await ensureLineMediaRouter(this.lineId);
          await allocateCallMedia({
            lineId: this.lineId,
            callId,
            routerScopeId: scopeLineMediaGroupId(this.lineId),
          });
        } catch (allocError) {
          logger.warn(`SIP media pre-allocation failed for line ${this.lineId}`, allocError?.message || allocError);
        }
      }

      // Build the SDP after media allocation and register the call before the
      // INVITE goes out, so message handlers never see a placeholder localSdp.
      call.localSdp = this.buildSDPOffer(callId);
      this.activeCalls.set(callId, call);

      await this._sendInvite(call);

      call.status = 'ringing';

      logger.info(`SIP INVITE sent for line ${this.lineId}`, {
        callId,
        targetUri,
        mode: this.mode,
        mediaIp: getCallMediaSession(callId)?.mediaIp || null,
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

  async sendRefer(callId, referToUri) {
    const call = this.activeCalls.get(callId);
    if (!call) {
      throw new Error(`Call ${callId} not found`);
    }
    if (!referToUri) {
      throw new Error('referToUri is required');
    }

    const branch = this.generateBranch();
    const cseq = this.sequence++;
    const toTag = call.toTag ? `;tag=${call.toTag}` : '';

    const referMessage = `REFER ${call.targetUri} SIP/2.0\r
Via: SIP/2.0/UDP ${this.sbcHost}:${this.localPort};branch=${branch}\r
From: <sip:${this.username}@${this.domain}>;tag=${call.fromTag}\r
To: <${call.targetUri}>${toTag}\r
Call-ID: ${callId}\r
CSeq: ${cseq} REFER\r
Contact: <${this.contactUri}>\r
Refer-To: <${referToUri}>\r
Referred-By: <sip:${this.username}@${this.domain}>\r
Content-Length: 0\r
\r
`;

    await this.sendMessage(referMessage);
    call.status = 'transferring';
    call.referToUri = referToUri;

    logger.info(`SIP REFER sent for line ${this.lineId}`, { callId, referToUri });
    return { callId, referToUri, status: call.status };
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
      try {
        await releaseCallMedia(callId);
      } catch (releaseError) {
        logger.warn(`Failed to release SIP media for call ${callId}`, releaseError?.message || releaseError);
      }
      
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
    const cseqMatch = message.match(/CSeq:\s*(\d+)\s+(\w+)/i);
    const cseq = cseqMatch ? parseInt(cseqMatch[1], 10) : null;
    const cseqMethod = cseqMatch ? String(cseqMatch[2]).toUpperCase() : null;
    
    const call = callId ? this.activeCalls.get(callId) : null;

    if (statusCode === 100) {
      logger.debug(`SIP 100 Trying for line ${this.lineId}`, { callId });
    } else if (statusCode === 180) {
      if (call) {
        call.status = 'ringing';
      }
      logger.info(`SIP 180 Ringing for line ${this.lineId}`, { callId });
    } else if (statusCode === 200) {
      if (message.includes('INVITE')) {
        if (call) {
          call.status = 'connected';
          const sdpMatch = message.match(/\r\n\r\n([\s\S]+)/);
          if (sdpMatch) {
            call.remoteSdp = sdpMatch[1];
          }
          const toTagMatch = message.match(/^To:.*tag=([^;\r\n]+)/im);
          if (toTagMatch) {
            call.toTag = toTagMatch[1].trim();
          }

          if (this.onCallConnected) {
            this.onCallConnected(callId, call);
          }
        }

        this.sendACK(callId, rinfo);
        logger.info(`SIP call connected for line ${this.lineId}`, { callId });
      } else if (cseqMethod === 'REGISTER' && Number.isFinite(cseq)) {
        settleRegisterWaiter(this, cseq, true);
        logger.info(`SIP REGISTER 200 OK for line ${this.lineId}`, {
          role: this._activeEndpointRole,
          host: this.sbcHost,
        });
      }
    } else if (statusCode === 401 || statusCode === 407) {
      const challenge = parseWwwAuthenticate(message);
      if (cseqMethod === 'REGISTER' && Number.isFinite(cseq)) {
        this._authChallenge = challenge;
        const idx = this._registerWaiters.findIndex((w) => w.cseq === cseq);
        if (idx >= 0) {
          const [waiter] = this._registerWaiters.splice(idx, 1);
          if (waiter.timer) {
            try { clearTimeout(waiter.timer); } catch {}
          }
          const err = new Error('SIP digest authentication required');
          err.code = 'SIP_AUTH_REQUIRED';
          waiter.reject(err);
        }
        logger.info(`SIP REGISTER ${statusCode} digest challenge for line ${this.lineId}`);
        return;
      }

      if (call && cseqMethod === 'INVITE') {
        call._authChallenge = challenge;
        call._authHeaderName = statusCode === 407 ? 'Proxy-Authorization' : 'Authorization';
        if (!call._authRetried) {
          call._authRetried = true;
          this._sendInvite(call, { withAuth: true }).catch((error) => {
            logger.error(`INVITE digest retry failed for line ${this.lineId}`, error?.message || error);
          });
        } else {
          call.status = 'failed';
          this.activeCalls.delete(callId);
        }
        return;
      }
    } else if (statusCode >= 400) {
      if (cseqMethod === 'REGISTER' && Number.isFinite(cseq)) {
        settleRegisterWaiter(this, cseq, false, `REGISTER ${statusCode}`);
        logger.warn(`SIP REGISTER ${statusCode} for line ${this.lineId}`, {
          role: this._activeEndpointRole,
          host: this.sbcHost,
        });
      }

      if (call && message.includes('INVITE') && !call._failoverRetried) {
        call._failoverRetried = true;
        const targetUri = call.targetUri;
        const callOptions = { ...call };
        delete callOptions.callId;
        delete callOptions.localSdp;
        delete callOptions.remoteSdp;
        const oldCallId = callId;
        this.activeCalls.delete(callId);
        try {
          releaseCallMedia(oldCallId).catch(() => {});
        } catch {}
        failoverToSecondary(this, `invite_${statusCode}`).then((ok) => {
          if (ok && targetUri) {
            this.makeCall(targetUri, { ...callOptions, _failoverAttempted: true })
              .then((newCallId) => {
                if (oldCallId && newCallId && oldCallId !== newCallId && this.onSipLegReplaced) {
                  this.onSipLegReplaced(oldCallId, newCallId);
                }
              })
              .catch((e) => {
                logger.error(`INVITE retry on secondary SBC failed for line ${this.lineId}`, e?.message || e);
              });
          }
        });
      } else if (call) {
        call.status = 'failed';
        this.activeCalls.delete(callId);
      }
      logger.warn(`SIP error ${statusCode} for line ${this.lineId}`, { callId, cseqMethod });
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
        rinfo,
        _ringTimer: null
      };

      this.activeCalls.set(callId, call);

      // For ARD/MRD/HOOT/DDI inbound legs, do not auto-answer.
      // Always ring and allow the application to answer via answerIncomingCall().
      await this.sendResponse(180, callId, rinfo);
      call.status = 'ringing';

      // Apply ring timeout (default 30s) to avoid calls ringing forever.
      const timeoutSeconds = Math.max(0, parseInt(this.ringTimeoutSeconds, 10) || 0);
      if (timeoutSeconds > 0) {
        call._ringTimer = setTimeout(async () => {
          try {
            const current = this.activeCalls.get(callId);
            if (!current) return;
            if (current.status !== 'ringing' && current.status !== 'incoming') return;
            await this.rejectIncomingCall(callId, 486);
          } catch (e) {
            try { logger.warn(`Ring timeout handler failed for line ${this.lineId}`, e?.message || e); } catch {}
          }
        }, timeoutSeconds * 1000);
      }

      try {
        if (this.onCallStateChanged) {
          this.onCallStateChanged(callId, { ...call });
        }
      } catch {}

      logger.info(`Incoming SIP call for line ${this.lineId}`, { callId, mode: this.mode });

      try {
        if (this.onIncomingCall) {
          await this.onIncomingCall(callId, { ...call });
        }
      } catch (error) {
        logger.warn(`onIncomingCall handler failed for line ${this.lineId}`, error?.message || error);
      }
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
        try {
          releaseCallMedia(callId).catch(() => {});
        } catch {}
      }
      
      // Send 200 OK
      await this.sendResponse(200, callId, rinfo);
      logger.info(`Incoming BYE handled for line ${this.lineId}`, { callId });

      try {
        if (this.onCallEnded) {
          await this.onCallEnded(callId, call ? { ...call } : { callId, lineId: this.lineId, status: 'ended' });
        }
      } catch {}
    }
  }

  async answerIncomingCall(callId) {
    const call = this.activeCalls.get(callId);
    if (!call || !call.rinfo) {
      throw new Error(`Cannot answer call ${callId}: call not found or missing rinfo`);
    }

    if (call._ringTimer) {
      try { clearTimeout(call._ringTimer); } catch {}
      call._ringTimer = null;
    }

    // If already connected, no-op.
    if (call.status === 'connected') {
      return { ...call };
    }

    const localSdp = call.localSdp || this.buildSDPOffer(callId);
    await this.sendResponse(200, callId, call.rinfo, localSdp);
    call.status = 'connected';
    call.localSdp = localSdp;

    if (call.remoteSdp) {
      try {
        if (this.onCallConnected) {
          this.onCallConnected(callId, { ...call });
        }
      } catch {}
    }

    try {
      if (this.onCallStateChanged) {
        this.onCallStateChanged(callId, { ...call });
      }
    } catch {}

    return { ...call };
  }

  async rejectIncomingCall(callId, statusCode = 486) {
    const call = this.activeCalls.get(callId);
    if (!call || !call.rinfo) {
      throw new Error(`Cannot reject call ${callId}: call not found or missing rinfo`);
    }

    if (call._ringTimer) {
      try { clearTimeout(call._ringTimer); } catch {}
      call._ringTimer = null;
    }

    await this.sendResponse(statusCode, callId, call.rinfo);
    call.status = 'rejected';
    this.activeCalls.delete(callId);

    try {
      if (this.onCallStateChanged) {
        this.onCallStateChanged(callId, { ...call });
      }
    } catch {}

    return { ...call };
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
      const call = this.activeCalls.get(callId);
      const targetUri = call?.targetUri || this.uriAddress;
      const fromTag = call?.fromTag || this.tag;
      const toTag = call?.toTag ? `;tag=${call.toTag}` : '';
      const branch = this.generateBranch();
      const ackMessage = `ACK ${targetUri} SIP/2.0\r
Via: SIP/2.0/UDP ${this.sbcHost}:${this.localPort};branch=${branch}\r
From: <sip:${this.username}@${this.domain}>;tag=${fromTag}\r
To: <${targetUri}>${toTag}\r
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
    const session = getCallMediaSession(callId);
    if (session?.localSdp) {
      return session.localSdp;
    }

    const mediaIp = getAnnouncedIp() || this.sbcHost;
    return buildAudioOffer({ ip: mediaIp, port: 40000 });
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

  getActiveCalls() {
    return Array.from(this.activeCalls.values());
  }

  getCall(callId) {
    return this.activeCalls.get(callId);
  }

  getSbcEndpointStatus() {
    return getSbcEndpointStatus(this);
  }
}

class SIPGateway {
  constructor() {
    this.isEnabled = process.env.SIP_ENABLED === 'true';
    this.userAgents = new Map(); // lineId -> SIPUserAgent
    this.initialized = false;

    // If HA is enabled, lineOwnershipService will control which lines are active on this node.
    this.haEnabled = process.env.SIP_HA_ENABLED === 'true';

    // Remember global callbacks so they can be applied to newly created UAs.
    this._globalIncomingCallCallback = null;
    this._globalCallEndedCallback = null;
    this._globalCallStateChangedCallback = null;
    this._globalSbcPathChangedCallback = null;
    this._globalSipLegReplacedCallback = null;

    // Storm control: coalesce rapid ownership changes (e.g., flapping lines) into a single apply.
    this._pendingOwnedLineIds = null;
    this._applyDebounceTimer = null;
    this._applyInProgress = false;

    // Bound concurrency for UA start/stop to avoid spikes.
    this._maxUaOpsConcurrency = Math.max(1, parseInt(process.env.SIP_HA_MAX_UA_OPS_CONCURRENCY || '10', 10) || 10);
  }

  _applyDebounceMs() {
    const v = parseInt(process.env.SIP_HA_APPLY_DEBOUNCE_MS || '500', 10);
    return Number.isFinite(v) ? Math.max(0, v) : 500;
  }

  async _runWithConcurrencyLimit(items, worker) {
    const list = Array.from(items || []);
    if (list.length === 0) return;

    const limit = Math.max(1, this._maxUaOpsConcurrency);
    let idx = 0;

    const runners = Array.from({ length: Math.min(limit, list.length) }).map(async () => {
      while (true) {
        let current;
        // Simple cooperative index increment.
        if (idx >= list.length) return;
        current = list[idx++];
        await worker(current);
      }
    });

    await Promise.all(runners);
  }

  async initialize() {
    if (!this.isEnabled) {
      logger.info('SIP Gateway disabled');
      return;
    }

    try {
      // If HA is enabled, do not eagerly register every line on startup.
      // The LineOwnershipService will call applyOwnedLineIds() to activate only the owned lines.
      if (!this.haEnabled) {
        // Load all active private wires and DDI lines
        await this.loadLines();
      }
      this.initialized = true;
      logger.info('SIP Gateway initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize SIP Gateway:', error);
      throw error;
    }
  }

  async applyOwnedLineIds(ownedLineIds) {
    if (!this.isEnabled) return;

    // Debounce/coalesce: only the latest desired set should be applied.
    this._pendingOwnedLineIds = new Set(Array.from(ownedLineIds || []).map(x => String(x)));
    const waitMs = this._applyDebounceMs();

    if (this._applyDebounceTimer) {
      clearTimeout(this._applyDebounceTimer);
      this._applyDebounceTimer = null;
    }

    this._applyDebounceTimer = setTimeout(() => {
      this._drainApplyQueue().catch((e) => {
        try { logger.warn('SIPGateway applyOwnedLineIds drain failed', e?.message || e); } catch {}
      });
    }, waitMs);
  }

  async _drainApplyQueue() {
    if (this._applyInProgress) {
      // A drain is already running; it will pick up the latest pending set.
      return;
    }

    this._applyInProgress = true;
    try {
      while (this._pendingOwnedLineIds) {
        const desired = this._pendingOwnedLineIds;
        this._pendingOwnedLineIds = null;

        // Stop any UAs we no longer own.
        const toStop = [];
        for (const [lineId] of Array.from(this.userAgents.entries())) {
          if (!desired.has(String(lineId))) {
            toStop.push(String(lineId));
          }
        }

        await this._runWithConcurrencyLimit(toStop, async (lineId) => {
          const ua = this.userAgents.get(String(lineId));
          if (!ua) return;
          try {
            await ua.stop();
          } catch (e) {
            logger.warn(`Failed stopping SIP UA for line ${lineId}: ${e?.message || e}`);
          }
          this.userAgents.delete(String(lineId));
        });

        // Ensure any newly-owned lines have a UA.
        const toStart = [];
        for (const lineId of desired) {
          if (!this.userAgents.has(String(lineId))) {
            toStart.push(String(lineId));
          }
        }

        await this._runWithConcurrencyLimit(toStart, async (lineId) => {
          try {
            const cfg = await this._loadLineConfigById(String(lineId));
            if (!cfg) return;

            const ua = new SIPUserAgent(
              cfg.id,
              cfg.uriAddress,
              cfg.sbcDetails,
              cfg.mode,
              { ringTimeoutSeconds: cfg.ringTimeoutSeconds }
            );

            this._applyGlobalCallbacksToUa(String(lineId), ua);

            await ua.initialize();
            this.userAgents.set(String(lineId), ua);
            logger.info(`SIP UA activated for owned line ${lineId}`);
          } catch (e) {
            logger.error(`Failed to activate SIP UA for owned line ${lineId}:`, e);
          }
        });
      }
    } finally {
      this._applyInProgress = false;
    }

  }

  _applyGlobalCallbacksToUa(lineId, ua) {
    try {
      if (this._globalIncomingCallCallback) {
        ua.onIncomingCall = (callId, call) => this._globalIncomingCallCallback(String(lineId), callId, call);
      }
    } catch {}

    try {
      if (this._globalCallEndedCallback) {
        ua.onCallEnded = (callId, call) => this._globalCallEndedCallback(String(lineId), callId, call);
      }
    } catch {}

    try {
      if (this._globalCallStateChangedCallback) {
        ua.onCallStateChanged = (callId, call) => this._globalCallStateChangedCallback(String(lineId), callId, call);
      }
    } catch {}

    try {
      if (this._globalSbcPathChangedCallback) {
        ua.onSbcPathChanged = () => this._globalSbcPathChangedCallback(String(lineId), ua);
      }
    } catch {}

    try {
      if (this._globalSipLegReplacedCallback) {
        ua.onSipLegReplaced = (oldCallId, newCallId) => {
          this._globalSipLegReplacedCallback(String(lineId), oldCallId, newCallId);
        };
      }
    } catch {}
  }

  async _loadLineConfigById(lineId) {
    const id = String(lineId);

    // Try private wire first.
    const pw = await pool.query(
      `SELECT id, uri_address, sbc_details, mode, ring_timeout, metadata
       FROM dealerboard_private_wires
       WHERE id = $1 AND is_active = true
       LIMIT 1`,
      [id]
    );
    if (pw.rows.length > 0) {
      const r = pw.rows[0];

      // Internal private wires are "mirrored" records; if they still have placeholder @internal URIs,
      // do not attempt to register a SIP UA for them (it can fail registration and spam logs).
      const isInternalWire = r.metadata?.internalWire === true || r.metadata?.internalWire === 'true';
      const uriAddr = (r.uri_address || '').toString().trim();
      const looksLikeInternalPlaceholder = /^sip:internal-/i.test(uriAddr) && /@internal$/i.test(uriAddr);
      if (isInternalWire && looksLikeInternalPlaceholder) {
        return null;
      }

      return {
        id: String(r.id),
        uriAddress: r.uri_address,
        sbcDetails: r.sbc_details,
        mode: r.mode,
        ringTimeoutSeconds: parseInt(r.ring_timeout, 10),
      };
    }

    const ddi = await pool.query(
      `SELECT id, line_number, sbc_details, connection_details, ring_timeout, sip_route_id
       FROM dealerboard_ddi_lines
       WHERE id = $1 AND is_active = true
       LIMIT 1`,
      [id]
    );
    if (ddi.rows.length > 0) {
      const r = ddi.rows[0];
      const uriAddress = r.connection_details?.uri || `sip:${r.line_number}@${process.env.SIP_DOMAIN || 'localhost'}`;
      const sbcDetails = await resolveSbcDetailsForDdiRow(r);
      return {
        id: String(r.id),
        uriAddress,
        sbcDetails,
        mode: 'DDI',
        ringTimeoutSeconds: parseInt(r.ring_timeout, 10),
      };
    }

    return null;
  }

  async loadLines() {
    try {
      // Load private wires
      const privateWires = await pool.query(
        `SELECT id, uri_address, sbc_details, mode, ring_timeout, is_active, metadata
         FROM dealerboard_private_wires 
         WHERE is_active = true`
      );

      for (const wire of privateWires.rows) {
        try {
          const isInternalWire = wire.metadata?.internalWire === true || wire.metadata?.internalWire === 'true';
          const uriAddr = (wire.uri_address || '').toString().trim();
          const looksLikeInternalPlaceholder = /^sip:internal-/i.test(uriAddr) && /@internal$/i.test(uriAddr);
          if (isInternalWire && looksLikeInternalPlaceholder) {
            logger.warn(`Skipping SIP UA for internal private wire with placeholder URI`, { lineId: wire.id, uri: uriAddr });
            continue;
          }

          const ua = new SIPUserAgent(
            wire.id,
            wire.uri_address,
            wire.sbc_details,
            wire.mode,
            {
              ringTimeoutSeconds: parseInt(wire.ring_timeout, 10)
            }
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
        `SELECT id, line_number, sbc_details, connection_details, ring_timeout, is_active, sip_route_id
         FROM dealerboard_ddi_lines 
         WHERE is_active = true`
      );

      for (const line of ddiLines.rows) {
        try {
          const uriAddress = line.connection_details?.uri || `sip:${line.line_number}@${process.env.SIP_DOMAIN || 'localhost'}`;
          const sbcDetails = await resolveSbcDetailsForDdiRow(line);
          const ua = new SIPUserAgent(
            line.id,
            uriAddress,
            sbcDetails,
            'DDI',
            {
              ringTimeoutSeconds: parseInt(line.ring_timeout, 10)
            }
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

  async reloadLine(lineId) {
    if (!this.isEnabled) {
      return { reloaded: false, reason: 'sip_disabled' };
    }

    const id = String(lineId);
    const existing = this.userAgents.get(id);
    if (existing) {
      try {
        await existing.stop();
      } catch (error) {
        logger.warn(`Failed stopping SIP UA before reload for line ${id}`, error?.message || error);
      }
      this.userAgents.delete(id);
    }

    const cfg = await this._loadLineConfigById(id);
    if (!cfg) {
      return { reloaded: false, reason: 'no_active_line' };
    }

    const ua = new SIPUserAgent(
      cfg.id,
      cfg.uriAddress,
      cfg.sbcDetails,
      cfg.mode,
      { ringTimeoutSeconds: cfg.ringTimeoutSeconds },
    );

    this._applyGlobalCallbacksToUa(id, ua);
    await ua.initialize();
    this.userAgents.set(id, ua);
    logger.info(`SIP UA reloaded for line ${id}`);
    return { reloaded: true, lineId: id };
  }

  async reloadLines(lineIds) {
    const results = [];
    for (const lineId of lineIds || []) {
      results.push({
        lineId: String(lineId),
        ...(await this.reloadLine(lineId)),
      });
    }
    return results;
  }

  setCallConnectedCallback(lineId, callback) {
    const ua = this.getUserAgent(lineId);
    if (ua) {
      ua.onCallConnected = callback;
    }
  }

  setIncomingCallCallback(lineId, callback) {
    const ua = this.getUserAgent(lineId);
    if (ua) {
      ua.onIncomingCall = callback;
    }
  }

  setCallEndedCallback(lineId, callback) {
    const ua = this.getUserAgent(lineId);
    if (ua) {
      ua.onCallEnded = callback;
    }
  }

  setCallStateChangedCallback(lineId, callback) {
    const ua = this.getUserAgent(lineId);
    if (ua) {
      ua.onCallStateChanged = callback;
    }
  }

  setGlobalIncomingCallCallback(callback) {
    this._globalIncomingCallCallback = callback;
    for (const [lineId, ua] of this.userAgents.entries()) {
      try {
        ua.onIncomingCall = (callId, call) => callback(lineId, callId, call);
      } catch {}
    }
  }

  setGlobalCallEndedCallback(callback) {
    this._globalCallEndedCallback = callback;
    for (const [lineId, ua] of this.userAgents.entries()) {
      try {
        ua.onCallEnded = (callId, call) => callback(lineId, callId, call);
      } catch {}
    }
  }

  setGlobalCallStateChangedCallback(callback) {
    this._globalCallStateChangedCallback = callback;
    for (const [lineId, ua] of this.userAgents.entries()) {
      try {
        ua.onCallStateChanged = (callId, call) => callback(lineId, callId, call);
      } catch {}
    }
  }

  setGlobalSbcPathChangedCallback(callback) {
    this._globalSbcPathChangedCallback = callback;
    for (const [lineId, ua] of this.userAgents.entries()) {
      try {
        ua.onSbcPathChanged = () => callback(lineId, ua);
      } catch {}
    }
  }

  setGlobalSipLegReplacedCallback(callback) {
    this._globalSipLegReplacedCallback = callback;
    for (const [lineId, ua] of this.userAgents.entries()) {
      try {
        ua.onSipLegReplaced = (oldCallId, newCallId) => callback(lineId, oldCallId, newCallId);
      } catch {}
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

  async transferCall(lineId, callId, referToUri) {
    const ua = this.getUserAgent(lineId);
    if (!ua) {
      throw new Error(`SIP UA not found for line ${lineId}`);
    }
    return ua.sendRefer(callId, referToUri);
  }

  async endCall(lineId, callId) {
    const ua = this.getUserAgent(lineId);
    if (!ua) {
      throw new Error(`SIP UA not found for line ${lineId}`);
    }
    return await ua.endCall(callId);
  }

  async answerIncomingCall(lineId, callId) {
    const ua = this.getUserAgent(lineId);
    if (!ua) {
      throw new Error(`SIP UA not found for line ${lineId}`);
    }
    return ua.answerIncomingCall(callId);
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

  getSbcStatusByLine() {
    const out = {};
    for (const [lineId, ua] of this.userAgents.entries()) {
      try {
        out[String(lineId)] = ua.getSbcEndpointStatus();
      } catch (e) {
        out[String(lineId)] = { error: e?.message || String(e) };
      }
    }
    return out;
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
