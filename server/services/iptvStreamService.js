/**
 * IPTV Multicast Stream Service
 * 
 * Subscribes to multicast IPTV audio streams and bridges them to WebRTC
 * Common in trading floors for hoot lines, market data audio, etc.
 */

const dgram = require('dgram');
const { Transform } = require('stream');
const logger = require('../utils/logger');

class IPTVStreamService {
  constructor() {
    this.activeStreams = new Map(); // streamId -> stream info
    this.sockets = new Map(); // streamId -> UDP socket
  }

  /**
   * Subscribe to a multicast IPTV audio stream
   */
  async subscribeStream(streamConfig) {
    const { 
      streamId, 
      multicastAddress, 
      port, 
      codec = 'G.722',
      interfaceAddress = '0.0.0.0' 
    } = streamConfig;

    try {
      // Validate multicast address
      if (!this.isValidMulticastAddress(multicastAddress)) {
        throw new Error(`Invalid multicast address: ${multicastAddress}`);
      }

      // Check if already subscribed
      if (this.activeStreams.has(streamId)) {
        logger.warn(`Already subscribed to stream ${streamId}`);
        return this.activeStreams.get(streamId);
      }

      logger.info(`Subscribing to IPTV stream: ${streamId} at ${multicastAddress}:${port}`);

      // Create UDP socket for multicast
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      
      const streamInfo = {
        streamId,
        multicastAddress,
        port,
        codec,
        status: 'connecting',
        listeners: new Set(),
        bytesReceived: 0,
        packetsReceived: 0,
        lastPacketTime: null,
        startTime: Date.now()
      };

      // Set up socket handlers
      socket.on('error', (err) => {
        logger.error(`IPTV stream ${streamId} error:`, err);
        streamInfo.status = 'error';
        streamInfo.error = err.message;
      });

      socket.on('message', (msg, rinfo) => {
        streamInfo.bytesReceived += msg.length;
        streamInfo.packetsReceived++;
        streamInfo.lastPacketTime = Date.now();
        
        // Parse RTP packet (if using RTP)
        const rtpPacket = this.parseRTPPacket(msg);
        
        if (rtpPacket) {
          // Broadcast audio payload to all listeners
          this.broadcastToListeners(streamId, rtpPacket.payload, codec);
        } else {
          // Raw audio data (non-RTP)
          this.broadcastToListeners(streamId, msg, codec);
        }
      });

      socket.on('listening', () => {
        const address = socket.address();
        logger.info(`IPTV stream ${streamId} listening on ${address.address}:${address.port}`);
        
        // Join multicast group
        try {
          socket.addMembership(multicastAddress, interfaceAddress);
          streamInfo.status = 'active';
          logger.info(`Successfully joined multicast group ${multicastAddress}`);
        } catch (err) {
          logger.error(`Failed to join multicast group ${multicastAddress}:`, err);
          streamInfo.status = 'error';
          streamInfo.error = `Failed to join multicast group: ${err.message}`;
        }
      });

      // Bind socket
      socket.bind(port, () => {
        socket.setMulticastTTL(128);
        socket.setMulticastLoopback(true);
      });

      this.sockets.set(streamId, socket);
      this.activeStreams.set(streamId, streamInfo);

      return streamInfo;

    } catch (error) {
      logger.error(`Failed to subscribe to IPTV stream ${streamId}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from multicast stream
   */
  async unsubscribeStream(streamId) {
    const streamInfo = this.activeStreams.get(streamId);
    const socket = this.sockets.get(streamId);

    if (!streamInfo || !socket) {
      logger.warn(`Stream ${streamId} not found`);
      return;
    }

    try {
      logger.info(`Unsubscribing from IPTV stream: ${streamId}`);
      
      // Leave multicast group
      socket.dropMembership(streamInfo.multicastAddress);
      
      // Close socket
      socket.close();
      
      // Notify listeners
      for (const listener of streamInfo.listeners) {
        listener.emit('streamEnded', { streamId, reason: 'unsubscribed' });
      }
      
      this.sockets.delete(streamId);
      this.activeStreams.delete(streamId);
      
      logger.info(`Successfully unsubscribed from stream ${streamId}`);
    } catch (error) {
      logger.error(`Error unsubscribing from stream ${streamId}:`, error);
      throw error;
    }
  }

  /**
   * Add listener to stream (WebRTC peer connection)
   */
  addListener(streamId, listener) {
    const streamInfo = this.activeStreams.get(streamId);
    
    if (!streamInfo) {
      throw new Error(`Stream ${streamId} not found`);
    }

    streamInfo.listeners.add(listener);
    logger.info(`Added listener to stream ${streamId}. Total listeners: ${streamInfo.listeners.size}`);
    
    return {
      streamId,
      codec: streamInfo.codec,
      status: streamInfo.status
    };
  }

  /**
   * Remove listener from stream
   */
  removeListener(streamId, listener) {
    const streamInfo = this.activeStreams.get(streamId);
    
    if (streamInfo) {
      streamInfo.listeners.delete(listener);
      logger.info(`Removed listener from stream ${streamId}. Total listeners: ${streamInfo.listeners.size}`);
      
      // Auto-unsubscribe if no listeners
      if (streamInfo.listeners.size === 0) {
        logger.info(`No more listeners for stream ${streamId}, unsubscribing...`);
        this.unsubscribeStream(streamId).catch(err => 
          logger.error(`Error auto-unsubscribing stream ${streamId}:`, err)
        );
      }
    }
  }

  /**
   * Broadcast audio to all listeners
   */
  broadcastToListeners(streamId, audioData, codec) {
    const streamInfo = this.activeStreams.get(streamId);
    
    if (!streamInfo) return;

    for (const listener of streamInfo.listeners) {
      try {
        listener.emit('audioData', {
          streamId,
          data: audioData,
          codec,
          timestamp: Date.now()
        });
      } catch (error) {
        logger.error(`Error broadcasting to listener:`, error);
        streamInfo.listeners.delete(listener);
      }
    }
  }

  /**
   * Parse RTP packet
   */
  parseRTPPacket(buffer) {
    if (buffer.length < 12) return null; // Minimum RTP header size

    try {
      const version = (buffer[0] >> 6) & 0x03;
      if (version !== 2) return null; // Not RTP v2

      const padding = (buffer[0] >> 5) & 0x01;
      const extension = (buffer[0] >> 4) & 0x01;
      const csrcCount = buffer[0] & 0x0F;
      const marker = (buffer[1] >> 7) & 0x01;
      const payloadType = buffer[1] & 0x7F;
      const sequenceNumber = buffer.readUInt16BE(2);
      const timestamp = buffer.readUInt32BE(4);
      const ssrc = buffer.readUInt32BE(8);

      let headerLength = 12 + (csrcCount * 4);
      
      // Skip extension if present
      if (extension) {
        const extLength = buffer.readUInt16BE(headerLength + 2) * 4;
        headerLength += 4 + extLength;
      }

      // Extract payload
      let payload = buffer.slice(headerLength);
      
      // Remove padding if present
      if (padding) {
        const paddingLength = payload[payload.length - 1];
        payload = payload.slice(0, -paddingLength);
      }

      return {
        version,
        payloadType,
        sequenceNumber,
        timestamp,
        ssrc,
        marker,
        payload
      };
    } catch (error) {
      logger.error('Error parsing RTP packet:', error);
      return null;
    }
  }

  /**
   * Validate multicast address
   */
  isValidMulticastAddress(address) {
    const parts = address.split('.');
    if (parts.length !== 4) return false;
    
    const first = parseInt(parts[0]);
    return first >= 224 && first <= 239;
  }

  /**
   * Get stream statistics
   */
  getStreamStats(streamId) {
    const streamInfo = this.activeStreams.get(streamId);
    
    if (!streamInfo) return null;

    const uptime = Date.now() - streamInfo.startTime;
    const avgBytesPerSecond = streamInfo.bytesReceived / (uptime / 1000);

    return {
      streamId: streamInfo.streamId,
      multicastAddress: streamInfo.multicastAddress,
      port: streamInfo.port,
      codec: streamInfo.codec,
      status: streamInfo.status,
      listeners: streamInfo.listeners.size,
      bytesReceived: streamInfo.bytesReceived,
      packetsReceived: streamInfo.packetsReceived,
      lastPacketTime: streamInfo.lastPacketTime,
      uptime,
      avgBytesPerSecond: Math.round(avgBytesPerSecond),
      error: streamInfo.error
    };
  }

  /**
   * Get all active streams
   */
  getAllStreams() {
    const streams = [];
    
    for (const [streamId, streamInfo] of this.activeStreams) {
      streams.push(this.getStreamStats(streamId));
    }
    
    return streams;
  }

  /**
   * Cleanup all streams
   */
  async cleanup() {
    logger.info('Cleaning up IPTV stream service...');
    
    const streamIds = Array.from(this.activeStreams.keys());
    
    for (const streamId of streamIds) {
      await this.unsubscribeStream(streamId).catch(err =>
        logger.error(`Error cleaning up stream ${streamId}:`, err)
      );
    }
    
    logger.info('IPTV stream service cleanup complete');
  }
}

// Singleton instance
const iptvStreamService = new IPTVStreamService();

module.exports = { iptvStreamService, IPTVStreamService };

