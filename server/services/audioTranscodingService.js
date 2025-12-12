const logger = require('../utils/logger');
const { spawn } = require('child_process');

/**
 * Audio Transcoding Service
 * Handles conversion between SIP codecs (PCMU/PCMA 8kHz) and MediaSoup/Matrix codecs (Opus 48kHz)
 */
class AudioTranscodingService {
  constructor() {
    this.activeTranscoders = new Map(); // callId -> TranscoderInfo
    this.ffmpegAvailable = false;
    this.checkFFmpegAvailability();
  }

  /**
   * Check if FFmpeg is available for transcoding
   */
  async checkFFmpegAvailability() {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      await execAsync('ffmpeg -version');
      this.ffmpegAvailable = true;
      logger.info('FFmpeg is available for audio transcoding');
    } catch (error) {
      this.ffmpegAvailable = false;
      logger.warn('FFmpeg not available - will use native G.711 decoding only');
    }
  }

  /**
   * G.711 μ-law (PCMU) decoding
   * Converts μ-law encoded bytes to 16-bit PCM
   */
  decodePCMU(mulawBytes) {
    const pcm = Buffer.allocUnsafe(mulawBytes.length * 2);
    for (let i = 0; i < mulawBytes.length; i++) {
      const mulaw = mulawBytes[i];
      // μ-law to linear conversion
      let sign = mulaw & 0x80;
      let exponent = (mulaw & 0x70) >> 4;
      let mantissa = mulaw & 0x0F;
      
      let linear = mantissa << (exponent + 3);
      linear = linear | 0x84 << exponent;
      linear = sign ? -linear : linear;
      
      // Convert to 16-bit signed integer
      const sample = Math.max(-32768, Math.min(32767, linear));
      pcm.writeInt16LE(sample, i * 2);
    }
    return pcm;
  }

  /**
   * G.711 A-law (PCMA) decoding
   * Converts A-law encoded bytes to 16-bit PCM
   */
  decodePCMA(alawBytes) {
    const pcm = Buffer.allocUnsafe(alawBytes.length * 2);
    for (let i = 0; i < alawBytes.length; i++) {
      const alaw = alawBytes[i] ^ 0x55; // Invert even bits
      const sign = alaw & 0x80;
      const exponent = (alaw & 0x70) >> 4;
      const mantissa = alaw & 0x0F;
      
      let linear;
      if (exponent === 0) {
        linear = (mantissa << 4) + 8;
      } else {
        linear = ((mantissa << 4) + 0x108) << (exponent - 1);
      }
      linear = sign ? -linear : linear;
      
      const sample = Math.max(-32768, Math.min(32767, linear));
      pcm.writeInt16LE(sample, i * 2);
    }
    return pcm;
  }

  /**
   * G.711 μ-law (PCMU) encoding
   * Converts 16-bit PCM to μ-law
   */
  encodePCMU(pcmBuffer) {
    const mulaw = Buffer.allocUnsafe(pcmBuffer.length / 2);
    for (let i = 0; i < mulaw.length; i++) {
      const sample = pcmBuffer.readInt16LE(i * 2);
      const sign = sample < 0 ? 0x80 : 0x00;
      const magnitude = Math.abs(sample);
      
      let exponent = 0;
      let temp = magnitude;
      while (temp > 15) {
        temp >>= 1;
        exponent++;
      }
      exponent = Math.min(7, exponent);
      
      const mantissa = magnitude >> (exponent + 3);
      mulaw[i] = sign | (exponent << 4) | (mantissa & 0x0F);
    }
    return mulaw;
  }

  /**
   * G.711 A-law (PCMA) encoding
   * Converts 16-bit PCM to A-law
   */
  encodePCMA(pcmBuffer) {
    const alaw = Buffer.allocUnsafe(pcmBuffer.length / 2);
    for (let i = 0; i < alaw.length; i++) {
      const sample = pcmBuffer.readInt16LE(i * 2);
      const sign = sample < 0 ? 0x00 : 0x80;
      const magnitude = Math.abs(sample);
      
      let exponent = 0;
      let temp = magnitude;
      while (temp > 15) {
        temp >>= 1;
        exponent++;
      }
      exponent = Math.min(7, exponent);
      
      const mantissa = magnitude >> (exponent + 3);
      let encoded = sign | (exponent << 4) | (mantissa & 0x0F);
      encoded ^= 0x55; // Invert even bits
      alaw[i] = encoded;
    }
    return alaw;
  }

  /**
   * G.729 decoding
   * Note: G.729 is a complex CELP codec. For production, use FFmpeg or a G.729 library.
   * This is a placeholder that will use FFmpeg if available, otherwise returns error.
   * @param {Buffer} g729Frame - G.729 encoded frame (10 bytes for 10ms @ 8kHz)
   * @returns {Buffer} - 16-bit PCM audio at 8kHz (160 samples = 20ms)
   */
  async decodeG729(g729Frame) {
    if (this.ffmpegAvailable) {
      // Use FFmpeg for G.729 decoding
      return await this.decodeG729WithFFmpeg(g729Frame);
    } else {
      throw new Error('G.729 decoding requires FFmpeg. Install FFmpeg or use a G.729 library.');
    }
  }

  /**
   * G.729 encoding
   * Note: G.729 is a complex CELP codec. For production, use FFmpeg or a G.729 library.
   * @param {Buffer} pcmBuffer - 16-bit PCM audio at 8kHz
   * @returns {Buffer} - G.729 encoded frame (10 bytes per 10ms)
   */
  async encodeG729(pcmBuffer) {
    if (this.ffmpegAvailable) {
      // Use FFmpeg for G.729 encoding
      return await this.encodeG729WithFFmpeg(pcmBuffer);
    } else {
      throw new Error('G.729 encoding requires FFmpeg. Install FFmpeg or use a G.729 library.');
    }
  }

  /**
   * Decode G.729 using FFmpeg
   */
  async decodeG729WithFFmpeg(g729Frame) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'g729',
        '-ar', '8000',
        '-ac', '1',
        '-i', 'pipe:0',
        '-f', 's16le',
        '-ar', '8000',
        '-ac', '1',
        'pipe:1'
      ]);

      const chunks = [];
      ffmpeg.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });

      ffmpeg.stderr.on('data', (data) => {
        // FFmpeg outputs to stderr
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`FFmpeg G.729 decode failed with code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(error);
      });

      ffmpeg.stdin.write(g729Frame);
      ffmpeg.stdin.end();
    });
  }

  /**
   * Encode G.729 using FFmpeg
   */
  async encodeG729WithFFmpeg(pcmBuffer) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-f', 's16le',
        '-ar', '8000',
        '-ac', '1',
        '-i', 'pipe:0',
        '-acodec', 'g729',
        '-ar', '8000',
        '-ac', '1',
        '-f', 'g729',
        'pipe:1'
      ]);

      const chunks = [];
      ffmpeg.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });

      ffmpeg.stderr.on('data', (data) => {
        // FFmpeg outputs to stderr
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`FFmpeg G.729 encode failed with code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(error);
      });

      ffmpeg.stdin.write(pcmBuffer);
      ffmpeg.stdin.end();
    });
  }

  /**
   * Opus decoding (for direct Opus in SIP)
   * Note: Opus is already supported in MediaSoup, but we may need to decode it for SIP
   * @param {Buffer} opusFrame - Opus encoded frame
   * @param {number} sampleRate - Sample rate (8000, 12000, 16000, 24000, or 48000)
   * @param {number} channels - Number of channels (1 or 2)
   * @returns {Buffer} - 16-bit PCM audio
   */
  async decodeOpus(opusFrame, sampleRate = 48000, channels = 2) {
    // For Opus, we can use FFmpeg or a native Opus library
    if (this.ffmpegAvailable) {
      return await this.decodeOpusWithFFmpeg(opusFrame, sampleRate, channels);
    } else {
      // Try to use node-opus if available
      try {
        const opus = require('@discordjs/opus');
        const decoder = new opus.OpusDecoder(sampleRate, channels);
        return decoder.decode(opusFrame);
      } catch (error) {
        throw new Error('Opus decoding requires FFmpeg or @discordjs/opus library');
      }
    }
  }

  /**
   * Opus encoding (for direct Opus in SIP)
   * @param {Buffer} pcmBuffer - 16-bit PCM audio
   * @param {number} sampleRate - Sample rate (8000, 12000, 16000, 24000, or 48000)
   * @param {number} channels - Number of channels (1 or 2)
   * @param {number} bitrate - Bitrate in bits per second (default 64000)
   * @returns {Buffer} - Opus encoded frame
   */
  async encodeOpus(pcmBuffer, sampleRate = 48000, channels = 2, bitrate = 64000) {
    if (this.ffmpegAvailable) {
      return await this.encodeOpusWithFFmpeg(pcmBuffer, sampleRate, channels, bitrate);
    } else {
      // Try to use node-opus if available
      try {
        const opus = require('@discordjs/opus');
        const encoder = new opus.OpusEncoder(sampleRate, channels);
        return encoder.encode(pcmBuffer, bitrate);
      } catch (error) {
        throw new Error('Opus encoding requires FFmpeg or @discordjs/opus library');
      }
    }
  }

  /**
   * Decode Opus using FFmpeg
   */
  async decodeOpusWithFFmpeg(opusFrame, sampleRate, channels) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'opus',
        '-ar', sampleRate.toString(),
        '-ac', channels.toString(),
        '-i', 'pipe:0',
        '-f', 's16le',
        '-ar', sampleRate.toString(),
        '-ac', channels.toString(),
        'pipe:1'
      ]);

      const chunks = [];
      ffmpeg.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });

      ffmpeg.stderr.on('data', (data) => {
        // FFmpeg outputs to stderr
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`FFmpeg Opus decode failed with code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(error);
      });

      ffmpeg.stdin.write(opusFrame);
      ffmpeg.stdin.end();
    });
  }

  /**
   * Encode Opus using FFmpeg
   */
  async encodeOpusWithFFmpeg(pcmBuffer, sampleRate, channels, bitrate) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-f', 's16le',
        '-ar', sampleRate.toString(),
        '-ac', channels.toString(),
        '-i', 'pipe:0',
        '-acodec', 'libopus',
        '-ar', sampleRate.toString(),
        '-ac', channels.toString(),
        '-b:a', bitrate.toString(),
        '-f', 'opus',
        'pipe:1'
      ]);

      const chunks = [];
      ffmpeg.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });

      ffmpeg.stderr.on('data', (data) => {
        // FFmpeg outputs to stderr
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`FFmpeg Opus encode failed with code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(error);
      });

      ffmpeg.stdin.write(pcmBuffer);
      ffmpeg.stdin.end();
    });
  }

  /**
   * Resample audio from 8kHz to 48kHz using linear interpolation
   * Simple resampling - for production, consider using a library or FFmpeg
   */
  resample8kTo48k(pcm8k) {
    // 8kHz to 48kHz is 6x upsampling
    const samples8k = pcm8k.length / 2; // 16-bit samples
    const samples48k = samples8k * 6;
    const pcm48k = Buffer.allocUnsafe(samples48k * 2);
    
    for (let i = 0; i < samples8k - 1; i++) {
      const sample1 = pcm8k.readInt16LE(i * 2);
      const sample2 = pcm8k.readInt16LE((i + 1) * 2);
      
      // Linear interpolation for 6 samples
      for (let j = 0; j < 6; j++) {
        const ratio = j / 6;
        const interpolated = Math.round(sample1 + (sample2 - sample1) * ratio);
        pcm48k.writeInt16LE(interpolated, (i * 6 + j) * 2);
      }
    }
    
    // Handle last sample
    const lastSample = pcm8k.readInt16LE((samples8k - 1) * 2);
    for (let j = 0; j < 6; j++) {
      pcm48k.writeInt16LE(lastSample, ((samples8k - 1) * 6 + j) * 2);
    }
    
    return pcm48k;
  }

  /**
   * Resample audio from 48kHz to 8kHz using decimation
   */
  resample48kTo8k(pcm48k) {
    // 48kHz to 8kHz is 6x downsampling (take every 6th sample)
    const samples48k = pcm48k.length / 2;
    const samples8k = Math.floor(samples48k / 6);
    const pcm8k = Buffer.allocUnsafe(samples8k * 2);
    
    for (let i = 0; i < samples8k; i++) {
      const sample = pcm48k.readInt16LE(i * 6 * 2);
      pcm8k.writeInt16LE(sample, i * 2);
    }
    
    return pcm8k;
  }

  /**
   * Convert RTP payload from SIP codec to PCM
   * @param {Buffer} rtpPayload - RTP packet payload
   * @param {string} codec - 'PCMU', 'PCMA', 'G729', or 'OPUS'
   * @param {object} codecParams - Additional codec parameters (sampleRate, channels for Opus)
   * @returns {Promise<Buffer>} - 16-bit PCM audio at appropriate sample rate
   */
  async rtpPayloadToPCM(rtpPayload, codec = 'PCMU', codecParams = {}) {
    try {
      // Normalize codec name (G.711 variants)
      const normalizedCodec = codec.toUpperCase()
        .replace(/G\.?711[_-]?U/gi, 'PCMU')  // G.711U, G711U, G.711-U → PCMU
        .replace(/G\.?711[_-]?A/gi, 'PCMA')  // G.711A, G711A, G.711-A → PCMA
        .replace(/G\.?711/gi, 'PCMU');       // G.711 (without U/A) → PCMU (μ-law default)

      if (normalizedCodec === 'PCMU') {
        // G.711 μ-law (PCMU)
        return this.decodePCMU(rtpPayload);
      } else if (normalizedCodec === 'PCMA') {
        // G.711 A-law (PCMA)
        return this.decodePCMA(rtpPayload);
      } else if (normalizedCodec === 'G729') {
        return await this.decodeG729(rtpPayload);
      } else if (normalizedCodec === 'OPUS') {
        const sampleRate = codecParams.sampleRate || 48000;
        const channels = codecParams.channels || 2;
        return await this.decodeOpus(rtpPayload, sampleRate, channels);
      } else {
        throw new Error(`Unsupported codec: ${codec} (normalized: ${normalizedCodec})`);
      }
    } catch (error) {
      logger.error(`Error converting RTP payload to PCM:`, error);
      throw error;
    }
  }

  /**
   * Convert PCM to RTP payload for SIP codec
   * @param {Buffer} pcmBuffer - 16-bit PCM audio
   * @param {string} codec - 'PCMU', 'PCMA', 'G729', or 'OPUS'
   * @param {object} codecParams - Additional codec parameters (sampleRate, channels, bitrate for Opus)
   * @returns {Promise<Buffer>} - Encoded RTP payload
   */
  async pcmToRTPPayload(pcmBuffer, codec = 'PCMU', codecParams = {}) {
    try {
      // Normalize codec name (G.711 variants)
      const normalizedCodec = codec.toUpperCase()
        .replace(/G\.?711[_-]?U/gi, 'PCMU')  // G.711U, G711U, G.711-U → PCMU
        .replace(/G\.?711[_-]?A/gi, 'PCMA')  // G.711A, G711A, G.711-A → PCMA
        .replace(/G\.?711/gi, 'PCMU');       // G.711 (without U/A) → PCMU (μ-law default)

      if (normalizedCodec === 'PCMU') {
        // G.711 μ-law (PCMU)
        return this.encodePCMU(pcmBuffer);
      } else if (normalizedCodec === 'PCMA') {
        // G.711 A-law (PCMA)
        return this.encodePCMA(pcmBuffer);
      } else if (normalizedCodec === 'G729') {
        return await this.encodeG729(pcmBuffer);
      } else if (normalizedCodec === 'OPUS') {
        const sampleRate = codecParams.sampleRate || 48000;
        const channels = codecParams.channels || 2;
        const bitrate = codecParams.bitrate || 64000;
        return await this.encodeOpus(pcmBuffer, sampleRate, channels, bitrate);
      } else {
        throw new Error(`Unsupported codec: ${codec} (normalized: ${normalizedCodec})`);
      }
    } catch (error) {
      logger.error(`Error converting PCM to RTP payload:`, error);
      throw error;
    }
  }

  /**
   * Transcode SIP RTP packet to MediaSoup-compatible format
   * Supports: PCMU/PCMA 8kHz, G.729 8kHz, Opus (various rates) → MediaSoup: Opus 48kHz
   * 
   * @param {Buffer} rtpPayload - RTP packet payload
   * @param {string} codec - 'PCMU', 'PCMA', 'G729', or 'OPUS'
   * @param {object} codecParams - Additional codec parameters
   * @returns {Promise<Buffer>} - PCM at 48kHz (MediaSoup will encode to Opus)
   */
  async transcodeSIPToMediaSoup(rtpPayload, codec = 'PCMU', codecParams = {}) {
    try {
      let pcm;
      let sampleRate = 8000;

      // Normalize codec name
      const normalizedCodec = codec.toUpperCase()
        .replace(/G\.?711[_-]?U/gi, 'PCMU')
        .replace(/G\.?711[_-]?A/gi, 'PCMA')
        .replace(/G\.?711/gi, 'PCMU');

      // Step 1: Decode to PCM
      if (normalizedCodec === 'OPUS') {
        // Opus can be at various sample rates
        sampleRate = codecParams.sampleRate || 48000;
        pcm = await this.rtpPayloadToPCM(rtpPayload, normalizedCodec, codecParams);
      } else if (normalizedCodec === 'G729') {
        // G.729 is always 8kHz
        pcm = await this.rtpPayloadToPCM(rtpPayload, normalizedCodec);
        sampleRate = 8000;
      } else {
        // PCMU/PCMA (G.711 μ-law/A-law) are 8kHz
        pcm = await this.rtpPayloadToPCM(rtpPayload, normalizedCodec);
        sampleRate = 8000;
      }

      // Step 2: Resample to 48kHz if needed
      let pcm48k;
      if (sampleRate === 48000) {
        pcm48k = pcm; // Already at 48kHz
      } else if (sampleRate === 8000) {
        pcm48k = this.resample8kTo48k(pcm);
      } else {
        // For other sample rates, use FFmpeg if available
        if (this.ffmpegAvailable) {
          pcm48k = await this.resampleWithFFmpeg(pcm, sampleRate, 48000);
        } else {
          // Fallback: use simple linear interpolation (may not be perfect)
          const ratio = 48000 / sampleRate;
          pcm48k = this.resampleLinear(pcm, sampleRate, 48000);
        }
      }

      // Step 3: Return PCM at 48kHz (MediaSoup will encode to Opus)
      return pcm48k;
    } catch (error) {
      logger.error(`Error transcoding SIP to MediaSoup:`, error);
      throw error;
    }
  }

  /**
   * Transcode MediaSoup audio to SIP RTP format
   * MediaSoup: Opus 48kHz → SIP: PCMU/PCMA/G.729/Opus at appropriate rate
   * 
   * @param {Buffer} pcm48k - PCM audio at 48kHz from MediaSoup
   * @param {string} codec - Target SIP codec: 'PCMU', 'PCMA', 'G729', or 'OPUS'
   * @param {object} codecParams - Additional codec parameters
   * @returns {Promise<Buffer>} - Encoded RTP payload
   */
  async transcodeMediaSoupToSIP(pcm48k, codec = 'PCMU', codecParams = {}) {
    try {
      let pcm;
      let targetSampleRate = 8000;

      // Normalize codec name
      const normalizedCodec = codec.toUpperCase()
        .replace(/G\.?711[_-]?U/gi, 'PCMU')
        .replace(/G\.?711[_-]?A/gi, 'PCMA')
        .replace(/G\.?711/gi, 'PCMU');

      // Determine target sample rate based on codec
      if (normalizedCodec === 'OPUS') {
        targetSampleRate = codecParams.sampleRate || 48000;
        // Opus can stay at 48kHz or be resampled
        if (targetSampleRate === 48000) {
          pcm = pcm48k;
        } else {
          pcm = await this.resampleWithFFmpeg(pcm48k, 48000, targetSampleRate);
        }
      } else {
        // PCMU, PCMA (G.711 μ-law/A-law), G.729 are all 8kHz
        targetSampleRate = 8000;
        pcm = this.resample48kTo8k(pcm48k);
      }

      // Step 2: Encode PCM to target codec
      const rtpPayload = await this.pcmToRTPPayload(pcm, normalizedCodec, codecParams);
      
      return rtpPayload;
    } catch (error) {
      logger.error(`Error transcoding MediaSoup to SIP:`, error);
      throw error;
    }
  }

  /**
   * Resample audio using FFmpeg (for non-8kHz/48kHz rates)
   */
  async resampleWithFFmpeg(pcmBuffer, fromRate, toRate, channels = 1) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-f', 's16le',
        '-ar', fromRate.toString(),
        '-ac', channels.toString(),
        '-i', 'pipe:0',
        '-f', 's16le',
        '-ar', toRate.toString(),
        '-ac', channels.toString(),
        'pipe:1'
      ]);

      const chunks = [];
      ffmpeg.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });

      ffmpeg.stderr.on('data', (data) => {
        // FFmpeg outputs to stderr
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`FFmpeg resample failed with code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(error);
      });

      ffmpeg.stdin.write(pcmBuffer);
      ffmpeg.stdin.end();
    });
  }

  /**
   * Simple linear resampling (fallback when FFmpeg not available)
   */
  resampleLinear(pcmBuffer, fromRate, toRate) {
    const ratio = toRate / fromRate;
    const samplesFrom = pcmBuffer.length / 2;
    const samplesTo = Math.floor(samplesFrom * ratio);
    const pcmOut = Buffer.allocUnsafe(samplesTo * 2);

    for (let i = 0; i < samplesTo; i++) {
      const srcIndex = i / ratio;
      const srcIndex1 = Math.floor(srcIndex);
      const srcIndex2 = Math.min(srcIndex1 + 1, samplesFrom - 1);
      const fraction = srcIndex - srcIndex1;

      const sample1 = pcmBuffer.readInt16LE(srcIndex1 * 2);
      const sample2 = pcmBuffer.readInt16LE(srcIndex2 * 2);
      const interpolated = Math.round(sample1 + (sample2 - sample1) * fraction);
      
      pcmOut.writeInt16LE(interpolated, i * 2);
    }

    return pcmOut;
  }

  /**
   * Process RTP packet for transcoding
   * Extracts payload and transcodes based on direction
   * Supports: PCMU (0), PCMA (8), G.729 (18), Opus (111)
   */
  async processRTPPacket(rtpPacket, direction = 'sip-to-mediasoup', codec = 'PCMU', codecParams = {}) {
    try {
      // RTP header is 12 bytes minimum
      if (rtpPacket.length < 12) {
        throw new Error('RTP packet too short');
      }

      // Extract payload (skip RTP header)
      const payloadType = rtpPacket[1] & 0x7F;
      const payload = rtpPacket.slice(12);

      // Detect codec from payload type if not specified
      let detectedCodec = codec;
      let detectedParams = { ...codecParams };

      // Normalize codec name
      const normalizedCodec = codec.toUpperCase()
        .replace(/G\.?711[_-]?U/gi, 'PCMU')
        .replace(/G\.?711[_-]?A/gi, 'PCMA')
        .replace(/G\.?711/gi, 'PCMU');

      if (direction === 'sip-to-mediasoup' && (normalizedCodec === 'PCMU' || normalizedCodec === 'PCMA')) {
        // Auto-detect from payload type
        switch (payloadType) {
          case 0:
            detectedCodec = 'PCMU'; // G.711 μ-law
            break;
          case 8:
            detectedCodec = 'PCMA'; // G.711 A-law
            break;
          case 18:
            detectedCodec = 'G729';
            break;
          case 111:
            detectedCodec = 'OPUS';
            detectedParams.sampleRate = detectedParams.sampleRate || 48000;
            detectedParams.channels = detectedParams.channels || 2;
            break;
          default:
            detectedCodec = normalizedCodec; // Use provided codec
        }
      } else {
        detectedCodec = normalizedCodec;
      }

      if (direction === 'sip-to-mediasoup') {
        return await this.transcodeSIPToMediaSoup(payload, detectedCodec, detectedParams);
      } else {
        // MediaSoup to SIP - assume we have PCM data
        return await this.transcodeMediaSoupToSIP(payload, detectedCodec, detectedParams);
      }
    } catch (error) {
      logger.error(`Error processing RTP packet:`, error);
      throw error;
    }
  }

  /**
   * Create transcoder for a call
   * @param {string} callId - Call identifier
   * @param {string} sipCodec - SIP codec: 'PCMU', 'PCMA', 'G729', or 'OPUS'
   * @param {object} codecParams - Codec parameters (sampleRate, channels, bitrate for Opus)
   */
  createTranscoder(callId, sipCodec = 'PCMU', codecParams = {}) {
    const transcoderInfo = {
      callId,
      sipCodec,
      codecParams,
      createdAt: new Date(),
      packetsProcessed: 0,
      bytesProcessed: 0,
      errors: 0,
      isActive: true
    };

    this.activeTranscoders.set(callId, transcoderInfo);
    logger.info(`Transcoder created for call ${callId}`, { 
      sipCodec, 
      codecParams,
      ffmpegAvailable: this.ffmpegAvailable 
    });
    
    return transcoderInfo;
  }

  /**
   * Remove transcoder for a call
   */
  removeTranscoder(callId) {
    const transcoder = this.activeTranscoders.get(callId);
    if (transcoder) {
      transcoder.isActive = false;
      this.activeTranscoders.delete(callId);
      logger.info(`Transcoder removed for call ${callId}`, {
        packetsProcessed: transcoder.packetsProcessed,
        bytesProcessed: transcoder.bytesProcessed
      });
    }
  }

  /**
   * Get transcoder statistics
   */
  getTranscoderStats(callId) {
    const transcoder = this.activeTranscoders.get(callId);
    if (!transcoder) {
      return null;
    }

    return {
      callId,
      sipCodec: transcoder.sipCodec,
      packetsProcessed: transcoder.packetsProcessed,
      bytesProcessed: transcoder.bytesProcessed,
      uptime: Date.now() - transcoder.createdAt.getTime(),
      isActive: transcoder.isActive
    };
  }

  /**
   * Get all active transcoders
   */
  getAllTranscoders() {
    return Array.from(this.activeTranscoders.values());
  }
}

let audioTranscodingServiceInstance = null;

function getAudioTranscodingService() {
  if (!audioTranscodingServiceInstance) {
    audioTranscodingServiceInstance = new AudioTranscodingService();
  }
  return audioTranscodingServiceInstance;
}

module.exports = {
  getAudioTranscodingService,
  AudioTranscodingService,
};

