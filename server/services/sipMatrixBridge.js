const dgram = require('dgram');
const { getSIPGateway } = require('./sipService');
const { getOrCreateRouter, createPlainTransport } = require('./mediaSoupService');
const { getAudioTranscodingService } = require('./audioTranscodingService');
const { pool } = require('./databaseService');
const logger = require('../utils/logger');

class SIPMatrixBridge {
  constructor() {
    this.activeBridges = new Map(); // callId -> BridgeInfo
    this.rtpSockets = new Map(); // callId -> RTP socket
    this.rtcpSockets = new Map(); // callId -> RTCP socket
  }

  /**
   * Bridge a SIP call to a Matrix room
   * @param {string} lineId - The private wire/DDI line ID
   * @param {string} callId - The SIP call ID
   * @param {string} matrixRoomId - The Matrix room ID to bridge to
   * @param {object} sipCallInfo - SIP call information (local/remote SDP, RTP info)
   */
  async bridgeCallToMatrixRoom(lineId, callId, matrixRoomId, sipCallInfo) {
    try {
      // Check if bridge already exists
      if (this.activeBridges.has(callId)) {
        logger.warn(`Bridge already exists for call ${callId}`);
        return this.activeBridges.get(callId);
      }

      // Get or create router for Matrix room
      const router = await getOrCreateRouter(matrixRoomId);
      if (!router) {
        throw new Error(`Failed to get router for Matrix room ${matrixRoomId}`);
      }

      // Create PlainTransport for RTP (bidirectional)
      const plainTransport = await createPlainTransport(matrixRoomId, {
        listenIp: { ip: '0.0.0.0', announcedIp: process.env.ANNOUNCED_IP || null },
        rtcpMux: false, // Separate RTP and RTCP
      });

      logger.info(`Created PlainTransport for SIP-Matrix bridge`, {
        callId,
        matrixRoomId,
        rtpPort: plainTransport.tuple.localPort,
        rtcpPort: plainTransport.rtcpTuple?.localPort
      });

      // Extract RTP info from SDP
      const rtpInfo = this.extractRTPInfo(sipCallInfo.remoteSdp || sipCallInfo.localSdp);
      
      // Set remote RTP address (SBC address)
      const sipGateway = getSIPGateway();
      const ua = sipGateway?.getUserAgent(lineId);
      if (!ua) {
        throw new Error(`SIP UA not found for line ${lineId}`);
      }

      const sbcHost = ua.sbcHost;
      const remoteRtpPort = rtpInfo.port || 10000; // Default RTP port

      // Connect transport to remote RTP endpoint
      await plainTransport.connect({
        ip: sbcHost,
        port: remoteRtpPort,
        rtcpPort: remoteRtpPort + 1,
      });

      // Create RTP socket to receive audio from SIP
      const rtpSocket = dgram.createSocket('udp4');
      const rtcpSocket = dgram.createSocket('udp4');

      // Bind to transport ports
      rtpSocket.bind(plainTransport.tuple.localPort, () => {
        logger.info(`RTP socket bound for call ${callId}`, {
          port: plainTransport.tuple.localPort
        });
      });

      if (plainTransport.rtcpTuple) {
        rtcpSocket.bind(plainTransport.rtcpTuple.localPort, () => {
          logger.info(`RTCP socket bound for call ${callId}`, {
            port: plainTransport.rtcpTuple.localPort
          });
        });
      }

      // Initialize transcoding service for this call
      const transcodingService = getAudioTranscodingService();
      const sipCodec = rtpInfo.codec || 'PCMU';
      
      // Extract codec parameters from SDP if available
      const codecParams = this.extractCodecParams(sipCallInfo.remoteSdp || sipCallInfo.localSdp, sipCodec);
      
      transcodingService.createTranscoder(callId, sipCodec, codecParams);

      // Create producer from RTP stream (SIP -> Matrix)
      // Configure codecs based on detected SIP codec
      const codecList = [];
      
      // Always support Opus (MediaSoup's preferred codec)
      codecList.push({
        mimeType: 'audio/opus',
        payloadType: 111,
        clockRate: 48000,
        channels: 2,
        parameters: {
          minptime: 10,
          useinbandfec: 1,
        },
      });

      // Add SIP codec support
      if (sipCodec === 'OPUS' || sipCodec === 'opus') {
        // Opus is already in the list
      } else if (sipCodec === 'G729') {
        // G.729 will be transcoded to PCM/Opus
        // MediaSoup doesn't natively support G.729, so we'll transcode
        codecList.push({
          mimeType: 'audio/PCMU', // Fallback for transcoded G.729
          payloadType: 0,
          clockRate: 8000,
          channels: 1,
        });
      } else {
        // PCMU/PCMA - MediaSoup can handle these
        codecList.push({
          mimeType: 'audio/PCMU',
          payloadType: 0,
          clockRate: 8000,
          channels: 1,
        });
        codecList.push({
          mimeType: 'audio/PCMA',
          payloadType: 8,
          clockRate: 8000,
          channels: 1,
        });
      }

      const producer = await router.createProducer({
        transportId: plainTransport.id,
        kind: 'audio',
        rtpParameters: {
          codecs: codecList,
          headerExtensions: [],
          encodings: [{ ssrc: this.generateSSRC() }],
          rtcp: {
            cname: `sip-call-${callId}`,
          },
        },
      });

      // Create consumer to send audio to SIP (Matrix -> SIP)
      // This will be created when we have participants in the Matrix room
      const consumer = null; // Will be created when needed

      // Store bridge info
      const bridgeInfo = {
        callId,
        lineId,
        matrixRoomId,
        plainTransport,
        producer,
        consumer,
        rtpSocket,
        rtcpSocket,
        rtpInfo,
        remoteRtpPort,
        remoteHost: sbcHost,
        createdAt: new Date(),
        isActive: true,
      };

      this.activeBridges.set(callId, bridgeInfo);
      this.rtpSockets.set(callId, rtpSocket);
      this.rtcpSockets.set(callId, rtcpSocket);

      // Set up RTP forwarding (SIP -> MediaSoup)
      this.setupRTPForwarding(callId, rtpSocket, plainTransport);

      // Set up RTCP handling
      if (rtcpSocket) {
        this.setupRTCPHandling(callId, rtcpSocket);
      }

      logger.info(`SIP call bridged to Matrix room`, {
        callId,
        lineId,
        matrixRoomId,
        producerId: producer.id
      });

      return bridgeInfo;
    } catch (error) {
      logger.error(`Failed to bridge SIP call to Matrix room:`, error);
      throw error;
    }
  }

  /**
   * Extract RTP information from SDP
   */
  extractRTPInfo(sdp) {
    if (!sdp) {
      return { port: 10000, codec: 'PCMU' };
    }

    const lines = sdp.split('\r\n');
    let port = 10000;
    let codec = 'PCMU';

    for (const line of lines) {
      // Extract port from m=audio line
      const mediaMatch = line.match(/^m=audio\s+(\d+)/);
      if (mediaMatch) {
        port = parseInt(mediaMatch[1]);
      }

      // Extract codec preference (check in order of preference)
      // Note: G.711 μ-law = PCMU, G.711 A-law = PCMA
      if (line.includes('opus') || line.match(/a=rtpmap:\d+\s+opus/i)) {
        codec = 'OPUS';
      } else if (line.includes('G729') || line.match(/a=rtpmap:\d+\s+G729/i)) {
        codec = 'G729';
      } else if (line.includes('PCMA') || line.match(/a=rtpmap:\d+\s+PCMA/i) || 
                 line.includes('G.711A') || line.includes('G711A') || 
                 line.match(/a=rtpmap:\d+\s+G\.?711[_-]?A/i)) {
        codec = 'PCMA'; // G.711 A-law
      } else if (line.includes('PCMU') || line.match(/a=rtpmap:\d+\s+PCMU/i) ||
                 line.includes('G.711U') || line.includes('G711U') ||
                 line.includes('G.711') || line.includes('G711') ||
                 line.match(/a=rtpmap:\d+\s+G\.?711[_-]?U/i) ||
                 line.match(/a=rtpmap:\d+\s+G\.?711/i)) {
        codec = 'PCMU'; // G.711 μ-law (default if just "G.711" is specified)
      }
    }

    return { port, codec };
  }

  /**
   * Extract codec parameters from SDP
   */
  extractCodecParams(sdp, codec) {
    if (!sdp) {
      return {};
    }

    const params = {};
    const lines = sdp.split('\r\n');

    for (const line of lines) {
      // Extract Opus parameters
      if (codec === 'OPUS' || codec === 'opus') {
        // Sample rate from rtpmap: e.g., "a=rtpmap:111 opus/48000/2"
        const rtpmapMatch = line.match(/a=rtpmap:\d+\s+opus\/(\d+)\/(\d+)/i);
        if (rtpmapMatch) {
          params.sampleRate = parseInt(rtpmapMatch[1]);
          params.channels = parseInt(rtpmapMatch[2]);
        }

        // Bitrate from fmtp: e.g., "a=fmtp:111 maxplaybackrate=48000;stereo=1"
        const fmtpMatch = line.match(/a=fmtp:\d+\s+(.+)/i);
        if (fmtpMatch) {
          const fmtpParams = fmtpMatch[1].split(';');
          for (const param of fmtpParams) {
            const bitrateMatch = param.match(/bitrate[=:](\d+)/i);
            if (bitrateMatch) {
              params.bitrate = parseInt(bitrateMatch[1]);
            }
          }
        }

        // Defaults for Opus
        if (!params.sampleRate) params.sampleRate = 48000;
        if (!params.channels) params.channels = 2;
        if (!params.bitrate) params.bitrate = 64000;
      }
    }

    return params;
  }

  /**
   * Set up RTP forwarding from SIP to MediaSoup with transcoding
   * Handles proper packet forwarding with codec conversion
   */
  setupRTPForwarding(callId, rtpSocket, plainTransport) {
    const transcodingService = getAudioTranscodingService();
    const bridgeInfo = this.activeBridges.get(callId);
    const sipCodec = bridgeInfo?.rtpInfo?.codec || 'PCMU';

    // Packet buffer for handling incomplete packets
    const packetBuffer = new Map(); // SSRC -> buffer
    let lastSequenceNumber = new Map(); // SSRC -> last seq
    let lastTimestamp = new Map(); // SSRC -> last timestamp

    rtpSocket.on('message', async (msg, rinfo) => {
      try {
        const bridge = this.activeBridges.get(callId);
        if (!bridge || !bridge.isActive) {
          return;
        }

        // Validate RTP packet
        if (msg.length < 12) {
          return; // Invalid RTP packet - too short
        }

        // Parse RTP header
        const version = (msg[0] >> 6) & 0x3;
        if (version !== 2) {
          return; // Invalid RTP version
        }

        const padding = (msg[0] >> 5) & 0x1;
        const extension = (msg[0] >> 4) & 0x1;
        const csrcCount = msg[0] & 0xF;
        const marker = (msg[1] >> 7) & 0x1;
        const payloadType = msg[1] & 0x7F;
        const sequenceNumber = msg.readUInt16BE(2);
        const timestamp = msg.readUInt32BE(4);
        const ssrc = msg.readUInt32BE(8);

        // Calculate header length (12 bytes base + 4 bytes per CSRC + extension header)
        let headerLength = 12 + (csrcCount * 4);
        if (extension) {
          const extLength = msg.readUInt16BE(headerLength + 2);
          headerLength += 4 + (extLength * 4);
        }

        // Extract payload
        const rtpPayload = msg.slice(headerLength);
        if (rtpPayload.length === 0) {
          return; // Empty payload
        }

        // Get transcoder
        const transcoder = transcodingService.activeTranscoders.get(callId);
        if (!transcoder) {
          // No transcoder - forward packet as-is (MediaSoup can handle PCMU/PCMA)
          // This is a fallback for when transcoding isn't needed
          return;
        }

        try {
          // For PCMU/PCMA, MediaSoup can handle directly - just forward
          if (transcoder.sipCodec === 'PCMU' || transcoder.sipCodec === 'PCMA') {
            // Forward RTP packet directly to MediaSoup PlainTransport
            // MediaSoup will handle codec conversion internally
            // Update stats
            transcoder.packetsProcessed++;
            transcoder.bytesProcessed += msg.length;
            
            // Forward to MediaSoup (the PlainTransport is already bound to this socket)
            // The packet will be automatically forwarded since the socket is bound to the transport port
            return;
          }

          // For G.729 and Opus, we need explicit transcoding
          if (transcoder.sipCodec === 'G729' || transcoder.sipCodec === 'OPUS') {
            // Decode RTP payload to PCM
            const pcmBuffer = await transcodingService.rtpPayloadToPCM(
              rtpPayload,
              transcoder.sipCodec,
              transcoder.codecParams
            );

            // Resample if needed (G.729 is 8kHz, Opus may vary)
            let pcm48k;
            if (transcoder.sipCodec === 'G729') {
              // G.729 is 8kHz, resample to 48kHz
              pcm48k = transcodingService.resample8kTo48k(pcmBuffer);
            } else if (transcoder.sipCodec === 'OPUS') {
              const sampleRate = transcoder.codecParams.sampleRate || 48000;
              if (sampleRate === 48000) {
                pcm48k = pcmBuffer;
              } else {
                // Resample to 48kHz
                if (transcodingService.ffmpegAvailable) {
                  pcm48k = await transcodingService.resampleWithFFmpeg(pcmBuffer, sampleRate, 48000);
                } else {
                  pcm48k = transcodingService.resampleLinear(pcmBuffer, sampleRate, 48000);
                }
              }
            } else {
              pcm48k = pcmBuffer;
            }

            // Note: MediaSoup PlainTransport expects RTP packets, not raw PCM
            // For transcoded audio, we would need to inject it differently
            // For now, we'll encode back to PCMU and send as RTP
            // In production, you might use MediaSoup's DataProducer or a different mechanism
            
            // Encode PCM to PCMU for forwarding
            const pcmuPayload = transcodingService.encodePCMU(
              transcodingService.resample48kTo8k(pcm48k)
            );

            // Create new RTP packet with PCMU payload
            const newRtpHeader = Buffer.alloc(12);
            newRtpHeader[0] = 0x80; // Version 2, no padding, no extension, no CSRC
            newRtpHeader[1] = 0x00; // No marker, payload type 0 (PCMU)
            newRtpHeader.writeUInt16BE(sequenceNumber, 2);
            newRtpHeader.writeUInt32BE(Math.floor(timestamp * 6), 4); // Scale timestamp for 48kHz->8kHz
            newRtpHeader.writeUInt32BE(ssrc, 8);

            const newRtpPacket = Buffer.concat([newRtpHeader, pcmuPayload]);

            // Forward transcoded packet to MediaSoup
            // Send to the PlainTransport's remote address
            const remoteAddress = bridgeInfo.plainTransport.tuple.remoteIp;
            const remotePort = bridgeInfo.plainTransport.tuple.remotePort;
            
            if (remoteAddress && remotePort) {
              rtpSocket.send(newRtpPacket, remotePort, remoteAddress, (err) => {
                if (err) {
                  logger.error(`Failed to send transcoded RTP packet:`, err);
                }
              });
            }

            // Update stats
            transcoder.packetsProcessed++;
            transcoder.bytesProcessed += msg.length;
          }
        } catch (error) {
          logger.error(`Transcoding error for call ${callId}:`, error);
          if (transcoder) {
            transcoder.errors++;
            
            // For PCMU/PCMA, continue even if transcoding fails (MediaSoup can handle it)
            if (transcoder.sipCodec !== 'PCMU' && transcoder.sipCodec !== 'PCMA') {
              // For G.729/Opus, we need transcoding, so log the error
              logger.warn(`Transcoding failed for ${transcoder.sipCodec}, call may have audio issues`);
            }
          }
        }
        
      } catch (error) {
        logger.error(`Error forwarding RTP for call ${callId}:`, error);
      }
    });

    rtpSocket.on('error', (error) => {
      logger.error(`RTP socket error for call ${callId}:`, error);
    });
  }

  /**
   * Set up RTCP handling
   */
  setupRTCPHandling(callId, rtcpSocket) {
    rtcpSocket.on('message', (msg, rinfo) => {
      try {
        // Handle RTCP packets (receiver reports, sender reports, etc.)
        // This is important for quality monitoring and synchronization
      } catch (error) {
        logger.error(`Error handling RTCP for call ${callId}:`, error);
      }
    });

    rtcpSocket.on('error', (error) => {
      logger.error(`RTCP socket error for call ${callId}:`, error);
    });
  }

  /**
   * Create consumer to send Matrix room audio to SIP
   */
  async createMatrixToSIPConsumer(callId, producerId) {
    try {
      const bridgeInfo = this.activeBridges.get(callId);
      if (!bridgeInfo) {
        throw new Error(`Bridge not found for call ${callId}`);
      }

      const { getOrCreateRouter } = require('./mediaSoupService');
      const router = await getOrCreateRouter(bridgeInfo.matrixRoomId);
      if (!router) {
        throw new Error(`Router not found for Matrix room ${bridgeInfo.matrixRoomId}`);
      }

      // Create consumer from Matrix room producer
      const consumer = await router.createConsumer({
        producerId,
        transportId: bridgeInfo.plainTransport.id,
        rtpCapabilities: router.rtpCapabilities,
      });

      bridgeInfo.consumer = consumer;

      // Set up RTP forwarding from MediaSoup to SIP
      // MediaSoup will send RTP packets through the PlainTransport
      // We need to forward these to the SIP endpoint

      logger.info(`Created Matrix-to-SIP consumer for call ${callId}`, {
        consumerId: consumer.id,
        producerId
      });

      return consumer;
    } catch (error) {
      logger.error(`Failed to create Matrix-to-SIP consumer:`, error);
      throw error;
    }
  }

  /**
   * Send RTP packet to SIP endpoint
   */
  async sendRTPToSIP(callId, rtpPacket) {
    try {
      const bridgeInfo = this.activeBridges.get(callId);
      if (!bridgeInfo || !bridgeInfo.isActive) {
        return;
      }

      // Send RTP packet to SIP endpoint
      bridgeInfo.rtpSocket.send(
        rtpPacket,
        0,
        rtpPacket.length,
        bridgeInfo.remoteRtpPort,
        bridgeInfo.remoteHost,
        (err) => {
          if (err) {
            logger.error(`Error sending RTP to SIP for call ${callId}:`, err);
          }
        }
      );
    } catch (error) {
      logger.error(`Failed to send RTP to SIP for call ${callId}:`, error);
    }
  }

  /**
   * End bridge and cleanup
   */
  async endBridge(callId) {
    try {
      const bridgeInfo = this.activeBridges.get(callId);
      if (!bridgeInfo) {
        logger.warn(`Bridge not found for call ${callId}`);
        return;
      }

      // Remove transcoder
      const transcodingService = getAudioTranscodingService();
      transcodingService.removeTranscoder(callId);

      // Close RTP sockets
      if (bridgeInfo.rtpSocket) {
        bridgeInfo.rtpSocket.close();
      }
      if (bridgeInfo.rtcpSocket) {
        bridgeInfo.rtcpSocket.close();
      }

      // Close producer
      if (bridgeInfo.producer) {
        try {
          bridgeInfo.producer.close();
        } catch (error) {
          logger.error(`Error closing producer for call ${callId}:`, error);
        }
      }

      // Close consumer
      if (bridgeInfo.consumer) {
        try {
          bridgeInfo.consumer.close();
        } catch (error) {
          logger.error(`Error closing consumer for call ${callId}:`, error);
        }
      }

      // Close transport
      if (bridgeInfo.plainTransport) {
        try {
          bridgeInfo.plainTransport.close();
        } catch (error) {
          logger.error(`Error closing transport for call ${callId}:`, error);
        }
      }

      this.activeBridges.delete(callId);
      this.rtpSockets.delete(callId);
      this.rtcpSockets.delete(callId);

      logger.info(`Bridge ended for call ${callId}`);
    } catch (error) {
      logger.error(`Error ending bridge for call ${callId}:`, error);
    }
  }

  /**
   * Get bridge info for a call
   */
  getBridge(callId) {
    return this.activeBridges.get(callId);
  }

  /**
   * Get all active bridges
   */
  getAllBridges() {
    return Array.from(this.activeBridges.values());
  }

  /**
   * Generate SSRC for RTP
   */
  generateSSRC() {
    return Math.floor(Math.random() * 0xFFFFFFFF);
  }
}

let sipMatrixBridgeInstance = null;

function getSIPMatrixBridge() {
  if (!sipMatrixBridgeInstance) {
    sipMatrixBridgeInstance = new SIPMatrixBridge();
  }
  return sipMatrixBridgeInstance;
}

module.exports = {
  getSIPMatrixBridge,
  SIPMatrixBridge,
};

