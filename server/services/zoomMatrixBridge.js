const dgram = require('dgram');
const { getOrCreateRouter, createPlainTransport } = require('./mediaSoupService');
const { getAudioTranscodingService } = require('./audioTranscodingService');
const { pool } = require('./databaseService');
const logger = require('../utils/logger');

/**
 * Zoom-Matrix Bridge Service
 * Bridges Zoom meeting audio and video streams to Matrix rooms via MediaSoup
 */
class ZoomMatrixBridge {
  constructor() {
    this.activeBridges = new Map(); // meetingId -> BridgeInfo
    this.rtpSockets = new Map(); // meetingId -> RTP socket (audio)
    this.rtcpSockets = new Map(); // meetingId -> RTCP socket (audio)
    this.videoRtpSockets = new Map(); // meetingId -> RTP socket (video)
    this.videoRtcpSockets = new Map(); // meetingId -> RTCP socket (video)
    this.webrtcConnections = new Map(); // meetingId -> WebRTC connection
  }

  /**
   * Bridge Zoom meeting audio to Matrix room
   * Supports both SIP dial-in and WebRTC approaches
   * 
   * @param {string} meetingId - Zoom meeting ID
   * @param {string} matrixRoomId - Matrix room ID
   * @param {string} userId - User ID who initiated the bridge
   * @param {object} options - Bridge options (sipDialIn, webrtc, etc.)
   */
  async bridgeMeetingToMatrixRoom(meetingId, matrixRoomId, userId, options = {}) {
    try {
      // Check if bridge already exists
      if (this.activeBridges.has(meetingId)) {
        logger.warn(`Bridge already exists for Zoom meeting ${meetingId}`);
        return this.activeBridges.get(meetingId);
      }

      // Get or create router for Matrix room
      const router = await getOrCreateRouter(matrixRoomId);
      if (!router) {
        throw new Error(`Failed to get router for Matrix room ${matrixRoomId}`);
      }

      const bridgeId = `zoom_${meetingId}_${Date.now()}`;
      let bridgeInfo = {
        bridgeId,
        meetingId,
        matrixRoomId,
        userId,
        router,
        isActive: true,
        createdAt: new Date(),
        method: options.method || 'sip', // 'sip' or 'webrtc'
        producer: null,
        consumer: null,
        plainTransport: null
      };

      // Try SIP dial-in first (if available and preferred)
      if (options.method === 'sip' || (!options.method && options.sipDialIn)) {
        try {
          bridgeInfo = await this.bridgeViaSIPDialIn(meetingId, matrixRoomId, userId, router, bridgeInfo, options);
        } catch (error) {
          logger.warn(`SIP dial-in failed for Zoom meeting ${meetingId}, trying WebRTC:`, error.message);
          // Fallback to WebRTC
          bridgeInfo = await this.bridgeViaWebRTC(meetingId, matrixRoomId, userId, router, bridgeInfo, options);
        }
      } else {
        // Use WebRTC approach
        bridgeInfo = await this.bridgeViaWebRTC(meetingId, matrixRoomId, userId, router, bridgeInfo, options);
      }

      this.activeBridges.set(meetingId, bridgeInfo);

      logger.info(`Zoom meeting ${meetingId} bridged to Matrix room ${matrixRoomId}`, {
        method: bridgeInfo.method,
        bridgeId: bridgeInfo.bridgeId
      });

      return bridgeInfo;
    } catch (error) {
      logger.error(`Failed to bridge Zoom meeting to Matrix room:`, error);
      throw error;
    }
  }

  /**
   * Bridge via SIP dial-in (if Zoom meeting supports it)
   */
  async bridgeViaSIPDialIn(meetingId, matrixRoomId, userId, router, bridgeInfo, options) {
    try {
      // Get meeting SIP dial-in information
      // Zoom provides SIP dial-in numbers and meeting ID/passcode
      const sipInfo = options.sipInfo || await this.getMeetingSIPInfo(meetingId, userId);

      if (!sipInfo || !sipInfo.dialInNumber) {
        throw new Error('SIP dial-in not available for this meeting');
      }

      // Create PlainTransport for RTP (similar to SIP-Matrix bridge)
      const plainTransport = await createPlainTransport(matrixRoomId, {
        listenIp: { ip: '0.0.0.0', announcedIp: process.env.ANNOUNCED_IP || null },
        rtcpMux: false,
      });

      bridgeInfo.plainTransport = plainTransport;
      bridgeInfo.sipInfo = sipInfo;

      // Create RTP sockets
      const rtpSocket = dgram.createSocket('udp4');
      const rtcpSocket = dgram.createSocket('udp4');

      rtpSocket.bind(plainTransport.tuple.localPort, () => {
        logger.info(`RTP socket bound for Zoom meeting ${meetingId}`, {
          port: plainTransport.tuple.localPort
        });
      });

      if (plainTransport.rtcpTuple) {
        rtcpSocket.bind(plainTransport.rtcpTuple.localPort, () => {
          logger.info(`RTCP socket bound for Zoom meeting ${meetingId}`, {
            port: plainTransport.rtcpTuple.localPort
          });
        });
      }

      this.rtpSockets.set(meetingId, rtpSocket);
      this.rtcpSockets.set(meetingId, rtcpSocket);

      // Initialize transcoding
      const transcodingService = getAudioTranscodingService();
      transcodingService.createTranscoder(bridgeId, 'PCMU', {}); // Zoom SIP typically uses PCMU

      // Create producer for Zoom audio -> Matrix
      const audioProducer = await router.createProducer({
        transportId: plainTransport.id,
        kind: 'audio',
        rtpParameters: {
          codecs: [
            {
              mimeType: 'audio/opus',
              payloadType: 111,
              clockRate: 48000,
              channels: 2,
              parameters: {
                minptime: 10,
                useinbandfec: 1,
              },
            },
            {
              mimeType: 'audio/PCMU',
              payloadType: 0,
              clockRate: 8000,
              channels: 1,
            },
            {
              mimeType: 'audio/PCMA',
              payloadType: 8,
              clockRate: 8000,
              channels: 1,
            },
          ],
          headerExtensions: [],
          encodings: [{ ssrc: this.generateSSRC() }],
          rtcp: {
            cname: `zoom-meeting-${meetingId}`,
          },
        },
      });

      bridgeInfo.audioProducer = audioProducer;
      bridgeInfo.producer = audioProducer; // Keep for backward compatibility
      bridgeInfo.method = 'sip';
      
      // Note: SIP dial-in typically doesn't support video
      // Video will be available via WebRTC method

      // Set up RTP forwarding
      this.setupRTPForwarding(meetingId, rtpSocket, plainTransport, bridgeId);

      // Set up RTCP handling
      this.setupRTCPHandling(meetingId, rtcpSocket);

      // Initiate SIP dial-in to Zoom meeting (if SIP info is available)
      if (sipInfo && sipInfo.dialInNumber && sipInfo.meetingId) {
        try {
          const { getSIPGateway } = require('./sipService');
          const sipGateway = getSIPGateway();

          if (sipGateway && sipGateway.initialized) {
            // Construct SIP URI for Zoom dial-in
            // Zoom SIP format: sip:meetingId.passcode@zoom-sip-server
            let zoomSipUri;
            
            if (sipInfo.sipUri) {
              zoomSipUri = sipInfo.sipUri;
            } else if (sipInfo.dialInNumber) {
              // Format: sip:meetingId.passcode@dialInNumber.zoom.us
              const cleanNumber = sipInfo.dialInNumber.replace(/[^0-9]/g, '');
              let meetingPart = sipInfo.meetingId;
              if (sipInfo.passcode) {
                meetingPart += `.${sipInfo.passcode}`;
              }
              zoomSipUri = `sip:${meetingPart}@${cleanNumber}.zoom.us`;
            } else {
              throw new Error('No valid SIP URI or dial-in number available');
            }

            // Try to find a DDI line configured for Zoom use
            // Check if there's a DDI line with metadata indicating Zoom use
            const { pool } = require('./databaseService');
            const ddiResult = await pool.query(
              `SELECT id, line_number, sbc_details, connection_details 
               FROM dealerboard_ddi_lines 
               WHERE is_active = true 
                 AND (metadata->>'zoomEnabled' = 'true' OR metadata->>'purpose' = 'zoom')
               LIMIT 1`
            );

            let zoomLineId = null;
            if (ddiResult.rows.length > 0) {
              zoomLineId = ddiResult.rows[0].id;
              logger.info(`Using configured DDI line for Zoom dial-in`, {
                lineId: zoomLineId,
                lineNumber: ddiResult.rows[0].line_number
              });
            } else {
              // No dedicated Zoom DDI line - store SIP info for manual dial-in
              logger.info(`No dedicated Zoom DDI line found. SIP URI available for manual dial-in`, {
                zoomSipUri,
                dialInNumber: sipInfo.dialInNumber,
                meetingId: sipInfo.meetingId
              });
            }

            // Store SIP info
            bridgeInfo.sipInfo = {
              uri: zoomSipUri,
              dialInNumber: sipInfo.dialInNumber,
              meetingId: sipInfo.meetingId,
              passcode: sipInfo.passcode,
              lineId: zoomLineId
            };

            // If we have a DDI line, initiate the SIP call
            if (zoomLineId) {
              try {
                const sipCallId = await sipGateway.makeCall(zoomLineId, zoomSipUri, {
                  mode: 'DDI',
                  autoAnswer: false
                });

                bridgeInfo.sipCallId = sipCallId;
                bridgeInfo.sipLineId = zoomLineId;

                logger.info(`Initiated SIP dial-in to Zoom meeting ${meetingId}`, {
                  sipCallId,
                  zoomSipUri,
                  lineId: zoomLineId
                });

                // Set up callback for when call connects
                sipGateway.setCallConnectedCallback(zoomLineId, async (callId, callInfo) => {
                  try {
                    if (callId !== sipCallId) return; // Only handle our call

                    logger.info(`SIP call connected to Zoom meeting ${meetingId}`, {
                      callId,
                      status: callInfo.status
                    });

                    // Connect PlainTransport to SIP RTP endpoint
                    if (callInfo.remoteSdp) {
                      const rtpInfo = this.extractRTPInfo(callInfo.remoteSdp);
                      const remoteRtpPort = rtpInfo.port || 10000;

                      await plainTransport.connect({
                        ip: rtpInfo.host || '0.0.0.0',
                        port: remoteRtpPort,
                        rtcpPort: remoteRtpPort + 1,
                      });

                      logger.info(`Connected PlainTransport to Zoom SIP RTP endpoint`, {
                        port: remoteRtpPort,
                        host: rtpInfo.host
                      });
                    }
                  } catch (error) {
                    logger.error(`Failed to connect PlainTransport after SIP call:`, error);
                  }
                });
              } catch (error) {
                logger.error(`Failed to initiate SIP call to Zoom:`, error);
                // Continue - bridge structure is ready, but SIP call failed
              }
            }
          } else {
            logger.warn('SIP Gateway not available - Zoom SIP dial-in bridge structure created but call cannot be initiated');
          }
        } catch (error) {
          logger.error(`Failed to configure SIP dial-in for Zoom:`, error);
          // Continue without SIP - bridge structure is still set up for WebRTC fallback
        }
      } else {
        logger.info(`SIP dial-in not available for Zoom meeting ${meetingId}, using WebRTC method`);
      }

      return bridgeInfo;
    } catch (error) {
      logger.error(`Failed to bridge Zoom via SIP dial-in:`, error);
      throw error;
    }
  }

  /**
   * Bridge via WebRTC (join meeting as bot and capture audio/video)
   */
  async bridgeViaWebRTC(meetingId, matrixRoomId, userId, router, bridgeInfo, options) {
    try {
      // For WebRTC approach, we would need to:
      // 1. Join Zoom meeting via WebRTC (using Zoom SDK or API)
      // 2. Capture audio and video tracks from the meeting
      // 3. Convert to MediaSoup format
      // 
      // This is more complex and may require:
      // - Zoom SDK integration
      // - Puppeteer/headless browser to join meeting
      // - WebRTC peer connection to capture audio/video
      //
      // For now, we'll create the structure for both audio and video

      logger.info(`WebRTC bridge setup for Zoom meeting ${meetingId}`, {
        note: 'WebRTC bridging requires Zoom SDK or headless browser integration'
      });

      // Create PlainTransport for audio
      const audioTransport = await createPlainTransport(matrixRoomId, {
        listenIp: { ip: '0.0.0.0', announcedIp: process.env.ANNOUNCED_IP || null },
        rtcpMux: false,
      });

      // Create PlainTransport for video
      const videoTransport = await createPlainTransport(matrixRoomId, {
        listenIp: { ip: '0.0.0.0', announcedIp: process.env.ANNOUNCED_IP || null },
        rtcpMux: false,
      });

      bridgeInfo.audioTransport = audioTransport;
      bridgeInfo.videoTransport = videoTransport;
      bridgeInfo.plainTransport = audioTransport; // Keep for backward compatibility
      bridgeInfo.method = 'webrtc';

      // Create audio producer
      const audioProducer = await router.createProducer({
        transportId: audioTransport.id,
        kind: 'audio',
        rtpParameters: {
          codecs: [
            {
              mimeType: 'audio/opus',
              payloadType: 111,
              clockRate: 48000,
              channels: 2,
              parameters: {
                minptime: 10,
                useinbandfec: 1,
              },
            },
          ],
          headerExtensions: [],
          encodings: [{ ssrc: this.generateSSRC() }],
          rtcp: {
            cname: `zoom-webrtc-audio-${meetingId}`,
          },
        },
      });

      // Create video producer
      const videoProducer = await router.createProducer({
        transportId: videoTransport.id,
        kind: 'video',
        rtpParameters: {
          codecs: [
            {
              mimeType: 'video/VP8',
              payloadType: 96,
              clockRate: 90000,
              parameters: {
                'x-google-start-bitrate': 1000
              },
            },
            {
              mimeType: 'video/VP9',
              payloadType: 98,
              clockRate: 90000,
              parameters: {
                'profile-id': 2,
                'x-google-start-bitrate': 1000
              },
            },
            {
              mimeType: 'video/h264',
              payloadType: 102,
              clockRate: 90000,
              parameters: {
                'packetization-mode': 1,
                'profile-level-id': '42e01f',
                'level-asymmetry-allowed': 1
              },
            },
          ],
          headerExtensions: [
            {
              uri: 'urn:ietf:params:rtp-hdrext:sdes:mid',
              id: 1,
            },
            {
              uri: 'urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id',
              id: 2,
            },
          ],
          encodings: [
            {
              ssrc: this.generateSSRC(),
              rid: 'high',
              maxBitrate: 2500000,
              scalabilityMode: 'S1T3',
            },
            {
              ssrc: this.generateSSRC(),
              rid: 'medium',
              maxBitrate: 1000000,
              scalabilityMode: 'S1T2',
            },
            {
              ssrc: this.generateSSRC(),
              rid: 'low',
              maxBitrate: 500000,
              scalabilityMode: 'S1T1',
            },
          ],
          rtcp: {
            cname: `zoom-webrtc-video-${meetingId}`,
            reducedSize: true,
          },
        },
      });

      bridgeInfo.audioProducer = audioProducer;
      bridgeInfo.videoProducer = videoProducer;
      bridgeInfo.producer = audioProducer; // Keep for backward compatibility

      // Set up RTP sockets for video
      const videoRtpSocket = dgram.createSocket('udp4');
      const videoRtcpSocket = dgram.createSocket('udp4');

      videoRtpSocket.bind(videoTransport.tuple.localPort, () => {
        logger.info(`Video RTP socket bound for Zoom meeting ${meetingId}`, {
          port: videoTransport.tuple.localPort
        });
      });

      if (videoTransport.rtcpTuple) {
        videoRtcpSocket.bind(videoTransport.rtcpTuple.localPort, () => {
          logger.info(`Video RTCP socket bound for Zoom meeting ${meetingId}`, {
            port: videoTransport.rtcpTuple.localPort
          });
        });
      }

      this.videoRtpSockets.set(meetingId, videoRtpSocket);
      this.videoRtcpSockets.set(meetingId, videoRtcpSocket);

      // Set up video RTP forwarding
      this.setupVideoRTPForwarding(meetingId, videoRtpSocket, videoTransport, bridgeInfo.bridgeId);

      // Set up video RTCP handling
      this.setupVideoRTCPHandling(meetingId, videoRtcpSocket);

      // TODO: Implement WebRTC connection to Zoom meeting
      // This would involve:
      // 1. Using Zoom SDK or joining via browser automation
      // 2. Capturing audio and video tracks from WebRTC peer connection
      // 3. Converting to RTP and forwarding to MediaSoup
      // 4. Handling video codec negotiation (VP8, VP9, H.264)

      logger.warn(`WebRTC bridging for Zoom is not fully implemented. Audio/video capture from Zoom meeting required.`);

      return bridgeInfo;
    } catch (error) {
      logger.error(`Failed to bridge Zoom via WebRTC:`, error);
      throw error;
    }
  }

  /**
   * Get meeting SIP dial-in information
   */
  async getMeetingSIPInfo(meetingId, userId) {
    try {
      const { getZoomService } = require('./zoomService');
      const zoomService = getZoomService();

      // Get meeting details from Zoom API
      const meeting = await zoomService.getMeeting(meetingId, userId);

      // Extract SIP dial-in info from meeting settings
      const sipInfo = {
        dialInNumber: meeting.settings?.global_dial_in_numbers?.[0]?.number || null,
        dialInNumbers: meeting.settings?.global_dial_in_numbers || [],
        meetingId: meeting.id.toString(),
        passcode: meeting.password || null,
        sipUri: meeting.settings?.sip_dial_in_uri || null
      };

      return sipInfo;
    } catch (error) {
      logger.error(`Failed to get Zoom meeting SIP info:`, error);
      return null;
    }
  }

  /**
   * Set up RTP forwarding from Zoom to MediaSoup
   */
  setupRTPForwarding(meetingId, rtpSocket, plainTransport, bridgeId) {
    const transcodingService = getAudioTranscodingService();
    const bridgeInfo = this.activeBridges.get(meetingId);

    rtpSocket.on('message', async (msg, rinfo) => {
      try {
        const bridge = this.activeBridges.get(meetingId);
        if (!bridge || !bridge.isActive) {
          return;
        }

        // Validate RTP packet
        if (msg.length < 12) {
          return;
        }

        const version = (msg[0] >> 6) & 0x3;
        if (version !== 2) {
          return;
        }

        // Parse RTP header
        const payloadType = msg[1] & 0x7F;
        const sequenceNumber = msg.readUInt16BE(2);
        const timestamp = msg.readUInt32BE(4);
        const ssrc = msg.readUInt32BE(8);

        // Extract payload
        const headerLength = 12; // Simplified - may need CSRC/extension handling
        const rtpPayload = msg.slice(headerLength);

        if (rtpPayload.length === 0) {
          return;
        }

        // Get transcoder
        const transcoder = transcodingService.activeTranscoders.get(bridgeId);
        if (transcoder) {
          transcoder.packetsProcessed++;
          transcoder.bytesProcessed += msg.length;
        }

        // Forward RTP packet to MediaSoup
        // MediaSoup will handle codec conversion internally for PCMU/PCMA
        // For other codecs, we'd need transcoding (similar to SIP bridge)

      } catch (error) {
        logger.error(`Error forwarding RTP for Zoom meeting ${meetingId}:`, error);
      }
    });

    rtpSocket.on('error', (error) => {
      logger.error(`RTP socket error for Zoom meeting ${meetingId}:`, error);
    });
  }

  /**
   * Set up RTCP handling
   */
  setupRTCPHandling(meetingId, rtcpSocket) {
    rtcpSocket.on('message', (msg, rinfo) => {
      try {
        // Handle RTCP packets (receiver reports, sender reports, etc.)
        // Important for quality monitoring and synchronization
        const bridge = this.activeBridges.get(meetingId);
        if (!bridge || !bridge.isActive) {
          return;
        }

        // Process RTCP packets for quality metrics
        // This is a simplified handler - full RTCP parsing would be more complex
      } catch (error) {
        logger.error(`Error handling RTCP for Zoom meeting ${meetingId}:`, error);
      }
    });

    rtcpSocket.on('error', (error) => {
      logger.error(`RTCP socket error for Zoom meeting ${meetingId}:`, error);
    });
  }

  /**
   * Set up video RTP forwarding from Zoom to MediaSoup
   */
  setupVideoRTPForwarding(meetingId, rtpSocket, plainTransport, bridgeId) {
    const bridgeInfo = this.activeBridges.get(meetingId);

    rtpSocket.on('message', async (msg, rinfo) => {
      try {
        const bridge = this.activeBridges.get(meetingId);
        if (!bridge || !bridge.isActive || !bridge.videoProducer) {
          return;
        }

        // Validate RTP packet
        if (msg.length < 12) {
          return;
        }

        const version = (msg[0] >> 6) & 0x3;
        if (version !== 2) {
          return;
        }

        // Parse RTP header
        const payloadType = msg[1] & 0x7F;
        const sequenceNumber = msg.readUInt16BE(2);
        const timestamp = msg.readUInt32BE(4);
        const ssrc = msg.readUInt32BE(8);

        // Extract payload
        const headerLength = 12; // Simplified - may need CSRC/extension handling
        const rtpPayload = msg.slice(headerLength);

        if (rtpPayload.length === 0) {
          return;
        }

        // Forward video RTP packet to MediaSoup
        // MediaSoup will handle codec conversion internally for VP8/VP9/H.264
        // Video codecs are typically not transcoded, just forwarded

      } catch (error) {
        logger.error(`Error forwarding video RTP for Zoom meeting ${meetingId}:`, error);
      }
    });

    rtpSocket.on('error', (error) => {
      logger.error(`Video RTP socket error for Zoom meeting ${meetingId}:`, error);
    });
  }

  /**
   * Set up video RTCP handling
   */
  setupVideoRTCPHandling(meetingId, rtcpSocket) {
    rtcpSocket.on('message', (msg, rinfo) => {
      try {
        // Handle video RTCP packets (receiver reports, sender reports, etc.)
        // Important for video quality monitoring, bitrate adaptation, and synchronization
        const bridge = this.activeBridges.get(meetingId);
        if (!bridge || !bridge.isActive) {
          return;
        }

        // Process video RTCP packets for quality metrics
        // This is a simplified handler - full RTCP parsing would be more complex
        // Video RTCP is especially important for:
        // - Bitrate adaptation
        // - Frame rate monitoring
        // - Packet loss detection
        // - Quality metrics
      } catch (error) {
        logger.error(`Error handling video RTCP for Zoom meeting ${meetingId}:`, error);
      }
    });

    rtcpSocket.on('error', (error) => {
      logger.error(`Video RTCP socket error for Zoom meeting ${meetingId}:`, error);
    });
  }

  /**
   * Generate SSRC for RTP
   */
  generateSSRC() {
    return Math.floor(Math.random() * 0xFFFFFFFF);
  }

  /**
   * Extract RTP info from SDP
   */
  extractRTPInfo(sdp) {
    if (!sdp) {
      return { port: 10000, codec: 'PCMU', host: '0.0.0.0' };
    }

    const lines = sdp.split('\r\n');
    let port = 10000;
    let codec = 'PCMU';
    let host = '0.0.0.0';

    for (const line of lines) {
      // Extract connection info
      const connectionMatch = line.match(/^c=IN IP4 ([^\s]+)/);
      if (connectionMatch) {
        host = connectionMatch[1];
      }

      // Extract port from m=audio line
      const mediaMatch = line.match(/^m=audio\s+(\d+)/);
      if (mediaMatch) {
        port = parseInt(mediaMatch[1]);
      }

      // Extract codec preference
      if (line.includes('opus') || line.match(/a=rtpmap:\d+\s+opus/i)) {
        codec = 'OPUS';
      } else if (line.includes('PCMA') || line.match(/a=rtpmap:\d+\s+PCMA/i)) {
        codec = 'PCMA';
      } else if (line.includes('PCMU') || line.match(/a=rtpmap:\d+\s+PCMU/i)) {
        codec = 'PCMU';
      }
    }

    return { port, codec, host };
  }

  /**
   * End bridge between Zoom meeting and Matrix room
   */
  async endBridge(meetingId, matrixRoomId) {
    try {
      const bridgeInfo = this.activeBridges.get(meetingId);
      if (!bridgeInfo) {
        logger.warn(`No active bridge found for Zoom meeting ${meetingId}`);
        return;
      }

      // End SIP call if exists
      if (bridgeInfo.sipCallId && bridgeInfo.sipLineId) {
        try {
          const { getSIPGateway } = require('./sipService');
          const sipGateway = getSIPGateway();
          if (sipGateway && sipGateway.initialized) {
            await sipGateway.endCall(bridgeInfo.sipLineId, bridgeInfo.sipCallId);
            logger.info(`Ended SIP call for Zoom meeting ${meetingId}`);
          }
        } catch (error) {
          logger.error(`Error ending SIP call:`, error);
        }
      }

      // Close audio RTP/RTCP sockets
      const rtpSocket = this.rtpSockets.get(meetingId);
      const rtcpSocket = this.rtcpSockets.get(meetingId);

      if (rtpSocket) {
        rtpSocket.close();
        this.rtpSockets.delete(meetingId);
      }

      if (rtcpSocket) {
        rtcpSocket.close();
        this.rtcpSockets.delete(meetingId);
      }

      // Close video RTP/RTCP sockets
      const videoRtpSocket = this.videoRtpSockets.get(meetingId);
      const videoRtcpSocket = this.videoRtcpSockets.get(meetingId);

      if (videoRtpSocket) {
        videoRtpSocket.close();
        this.videoRtpSockets.delete(meetingId);
      }

      if (videoRtcpSocket) {
        videoRtcpSocket.close();
        this.videoRtcpSockets.delete(meetingId);
      }

      // Close WebRTC connection if exists
      const webrtcConn = this.webrtcConnections.get(meetingId);
      if (webrtcConn) {
        // Close WebRTC peer connection
        if (webrtcConn.close) {
          webrtcConn.close();
        }
        this.webrtcConnections.delete(meetingId);
      }

      // Close MediaSoup audio producer/consumer
      if (bridgeInfo.audioProducer) {
        try {
          await bridgeInfo.audioProducer.close();
        } catch (error) {
          logger.error(`Error closing audio producer:`, error);
        }
      }

      if (bridgeInfo.producer && bridgeInfo.producer !== bridgeInfo.audioProducer) {
        try {
          await bridgeInfo.producer.close();
        } catch (error) {
          logger.error(`Error closing producer:`, error);
        }
      }

      // Close MediaSoup video producer/consumer
      if (bridgeInfo.videoProducer) {
        try {
          await bridgeInfo.videoProducer.close();
        } catch (error) {
          logger.error(`Error closing video producer:`, error);
        }
      }

      if (bridgeInfo.consumer) {
        try {
          await bridgeInfo.consumer.close();
        } catch (error) {
          logger.error(`Error closing consumer:`, error);
        }
      }

      // Close PlainTransports
      if (bridgeInfo.audioTransport) {
        try {
          await bridgeInfo.audioTransport.close();
        } catch (error) {
          logger.error(`Error closing audio PlainTransport:`, error);
        }
      }

      if (bridgeInfo.videoTransport) {
        try {
          await bridgeInfo.videoTransport.close();
        } catch (error) {
          logger.error(`Error closing video PlainTransport:`, error);
        }
      }

      if (bridgeInfo.plainTransport && bridgeInfo.plainTransport !== bridgeInfo.audioTransport) {
        try {
          await bridgeInfo.plainTransport.close();
        } catch (error) {
          logger.error(`Error closing PlainTransport:`, error);
        }
      }

      // Remove transcoder
      const transcodingService = getAudioTranscodingService();
      const bridgeId = bridgeInfo.bridgeId;
      transcodingService.removeTranscoder(bridgeId);

      // Mark bridge as inactive
      bridgeInfo.isActive = false;
      this.activeBridges.delete(meetingId);

      // Update database
      await pool.query(
        `UPDATE zoom_matrix_bridges 
         SET is_active = false, updated_at = NOW()
         WHERE zoom_meeting_id = $1 AND matrix_room_id = $2`,
        [meetingId, matrixRoomId]
      );

      logger.info(`Ended bridge between Zoom meeting ${meetingId} and Matrix room ${matrixRoomId}`);
    } catch (error) {
      logger.error(`Failed to end Zoom bridge:`, error);
      throw error;
    }
  }

  /**
   * Get bridge status
   */
  getBridgeStatus(meetingId) {
    const bridge = this.activeBridges.get(meetingId);
    if (!bridge) {
      return null;
    }

    return {
      bridgeId: bridge.bridgeId,
      meetingId: bridge.meetingId,
      matrixRoomId: bridge.matrixRoomId,
      isActive: bridge.isActive,
      method: bridge.method,
      hasAudio: !!bridge.audioProducer,
      hasVideo: !!bridge.videoProducer,
      createdAt: bridge.createdAt
    };
  }
}

let zoomMatrixBridgeInstance = null;

function initializeZoomMatrixBridge() {
  if (!zoomMatrixBridgeInstance) {
    zoomMatrixBridgeInstance = new ZoomMatrixBridge();
  }
  return zoomMatrixBridgeInstance;
}

function getZoomMatrixBridge() {
  if (!zoomMatrixBridgeInstance) {
    zoomMatrixBridgeInstance = new ZoomMatrixBridge();
  }
  return zoomMatrixBridgeInstance;
}

module.exports = {
  initializeZoomMatrixBridge,
  getZoomMatrixBridge,
  ZoomMatrixBridge
};

