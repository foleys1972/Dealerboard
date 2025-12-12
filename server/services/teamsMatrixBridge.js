const dgram = require('dgram');
const { getOrCreateRouter, createPlainTransport } = require('./mediaSoupService');
const { getAudioTranscodingService } = require('./audioTranscodingService');
const { pool } = require('./databaseService');
const logger = require('../utils/logger');

/**
 * Teams-Matrix Bridge Service
 * Bridges Microsoft Teams meeting audio and video streams to Matrix rooms via MediaSoup
 */
class TeamsMatrixBridge {
  constructor() {
    this.activeBridges = new Map(); // meetingId -> BridgeInfo
    this.rtpSockets = new Map(); // meetingId -> RTP socket (audio)
    this.rtcpSockets = new Map(); // meetingId -> RTCP socket (audio)
    this.videoRtpSockets = new Map(); // meetingId -> RTP socket (video)
    this.videoRtcpSockets = new Map(); // meetingId -> RTCP socket (video)
    this.webrtcConnections = new Map(); // meetingId -> WebRTC connection
  }

  /**
   * Bridge Teams meeting audio/video to Matrix room
   * Teams uses WebRTC for audio/video
   * 
   * @param {string} meetingId - Teams meeting ID
   * @param {string} matrixRoomId - Matrix room ID
   * @param {string} userId - User ID who initiated the bridge
   * @param {object} options - Bridge options
   */
  async bridgeMeetingToMatrixRoom(meetingId, matrixRoomId, userId, options = {}) {
    try {
      // Check if bridge already exists
      if (this.activeBridges.has(meetingId)) {
        logger.warn(`Bridge already exists for Teams meeting ${meetingId}`);
        return this.activeBridges.get(meetingId);
      }

      // Get or create router for Matrix room
      const router = await getOrCreateRouter(matrixRoomId);
      if (!router) {
        throw new Error(`Failed to get router for Matrix room ${matrixRoomId}`);
      }

      const bridgeId = `teams_${meetingId}_${Date.now()}`;
      let bridgeInfo = {
        bridgeId,
        meetingId,
        matrixRoomId,
        userId,
        router,
        isActive: true,
        createdAt: new Date(),
        method: 'webrtc', // Teams always uses WebRTC
        audioProducer: null,
        videoProducer: null,
        producer: null,
        consumer: null,
        audioTransport: null,
        videoTransport: null,
        plainTransport: null
      };

      // Use WebRTC approach for Teams
      bridgeInfo = await this.bridgeViaWebRTC(meetingId, matrixRoomId, userId, router, bridgeInfo, options);

      this.activeBridges.set(meetingId, bridgeInfo);

      logger.info(`Teams meeting ${meetingId} bridged to Matrix room ${matrixRoomId}`, {
        method: bridgeInfo.method,
        bridgeId: bridgeInfo.bridgeId
      });

      return bridgeInfo;
    } catch (error) {
      logger.error(`Failed to bridge Teams meeting to Matrix room:`, error);
      throw error;
    }
  }

  /**
   * Bridge via WebRTC (join meeting as bot and capture audio/video)
   */
  async bridgeViaWebRTC(meetingId, matrixRoomId, userId, router, bridgeInfo, options) {
    try {
      logger.info(`WebRTC bridge setup for Teams meeting ${meetingId}`, {
        note: 'WebRTC bridging requires Teams SDK or headless browser integration'
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
            cname: `teams-webrtc-audio-${meetingId}`,
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
            cname: `teams-webrtc-video-${meetingId}`,
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
        logger.info(`Video RTP socket bound for Teams meeting ${meetingId}`, {
          port: videoTransport.tuple.localPort
        });
      });

      if (videoTransport.rtcpTuple) {
        videoRtcpSocket.bind(videoTransport.rtcpTuple.localPort, () => {
          logger.info(`Video RTCP socket bound for Teams meeting ${meetingId}`, {
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

      // TODO: Implement WebRTC connection to Teams meeting
      // This would involve:
      // 1. Using Teams SDK or joining via browser automation
      // 2. Capturing audio and video tracks from WebRTC peer connection
      // 3. Converting to RTP and forwarding to MediaSoup
      // 4. Handling video codec negotiation (VP8, VP9, H.264)

      logger.warn(`WebRTC bridging for Teams is not fully implemented. Audio/video capture from Teams meeting required.`);

      return bridgeInfo;
    } catch (error) {
      logger.error(`Failed to bridge Teams via WebRTC:`, error);
      throw error;
    }
  }

  /**
   * Set up video RTP forwarding from Teams to MediaSoup
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

      } catch (error) {
        logger.error(`Error forwarding video RTP for Teams meeting ${meetingId}:`, error);
      }
    });

    rtpSocket.on('error', (error) => {
      logger.error(`Video RTP socket error for Teams meeting ${meetingId}:`, error);
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
        // Video RTCP is especially important for:
        // - Bitrate adaptation
        // - Frame rate monitoring
        // - Packet loss detection
        // - Quality metrics
      } catch (error) {
        logger.error(`Error handling video RTCP for Teams meeting ${meetingId}:`, error);
      }
    });

    rtcpSocket.on('error', (error) => {
      logger.error(`Video RTCP socket error for Teams meeting ${meetingId}:`, error);
    });
  }

  /**
   * Generate SSRC for RTP
   */
  generateSSRC() {
    return Math.floor(Math.random() * 0xFFFFFFFF);
  }

  /**
   * End bridge between Teams meeting and Matrix room
   */
  async endBridge(meetingId, matrixRoomId) {
    try {
      const bridgeInfo = this.activeBridges.get(meetingId);
      if (!bridgeInfo) {
        logger.warn(`No active bridge found for Teams meeting ${meetingId}`);
        return;
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

      // Remove transcoder
      const transcodingService = getAudioTranscodingService();
      const bridgeId = bridgeInfo.bridgeId;
      transcodingService.removeTranscoder(bridgeId);

      // Mark bridge as inactive
      bridgeInfo.isActive = false;
      this.activeBridges.delete(meetingId);

      // Update database
      await pool.query(
        `UPDATE teams_matrix_bridges 
         SET is_active = false, updated_at = NOW()
         WHERE teams_meeting_id = $1 AND matrix_room_id = $2`,
        [meetingId, matrixRoomId]
      );

      logger.info(`Ended bridge between Teams meeting ${meetingId} and Matrix room ${matrixRoomId}`);
    } catch (error) {
      logger.error(`Failed to end Teams bridge:`, error);
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

let teamsMatrixBridgeInstance = null;

function initializeTeamsMatrixBridge() {
  if (!teamsMatrixBridgeInstance) {
    teamsMatrixBridgeInstance = new TeamsMatrixBridge();
  }
  return teamsMatrixBridgeInstance;
}

function getTeamsMatrixBridge() {
  if (!teamsMatrixBridgeInstance) {
    teamsMatrixBridgeInstance = new TeamsMatrixBridge();
  }
  return teamsMatrixBridgeInstance;
}

module.exports = {
  initializeTeamsMatrixBridge,
  getTeamsMatrixBridge,
  TeamsMatrixBridge
};

