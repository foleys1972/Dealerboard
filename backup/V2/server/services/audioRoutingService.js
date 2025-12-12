const logger = require('../utils/logger');

class AudioRoutingService {
  constructor() {
    this.audioMixers = new Map(); // Group ID -> AudioMixer
    this.participantStreams = new Map(); // Participant ID -> Stream info
    this.audioLevels = new Map(); // Participant ID -> Audio level
    this.speakerHistory = new Map(); // Group ID -> Speaker history
    this.audioProcessing = {
      noiseReduction: process.env.AUDIO_NOISE_REDUCTION === 'true',
      echoCancellation: process.env.AUDIO_ECHO_CANCELLATION === 'true',
      autoGainControl: process.env.AUDIO_AUTO_GAIN_CONTROL === 'true',
      voiceActivityDetection: process.env.AUDIO_VAD === 'true',
    };
    this.config = {
      maxConcurrentSpeakers: parseInt(process.env.MAX_CONCURRENT_SPEAKERS) || 3,
      audioLevelThreshold: parseInt(process.env.AUDIO_LEVEL_THRESHOLD) || -50,
      silenceTimeout: parseInt(process.env.SILENCE_TIMEOUT) || 2000,
      bandwidthLimit: parseInt(process.env.AUDIO_BANDWIDTH_LIMIT) || 64000, // 64kbps per participant
      adaptiveBitrate: process.env.ADAPTIVE_BITRATE === 'true',
    };
  }

  async initialize() {
    try {
      logger.info('Audio routing service initialized', {
        audioProcessing: this.audioProcessing,
        config: this.config
      });
    } catch (error) {
      logger.error('Failed to initialize audio routing service:', error);
      throw error;
    }
  }

  // Create audio mixer for a group
  async createAudioMixer(groupId, participants = []) {
    try {
      if (this.audioMixers.has(groupId)) {
        logger.warn(`Audio mixer already exists for group ${groupId}`);
        return this.audioMixers.get(groupId);
      }

      const audioMixer = {
        groupId,
        participants: new Set(participants),
        activeSpeakers: new Map(), // Participant ID -> Audio level
        speakerQueue: [],
        lastSpeakerChange: Date.now(),
        audioLevels: new Map(),
        bandwidthUsage: 0,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      this.audioMixers.set(groupId, audioMixer);
      this.speakerHistory.set(groupId, []);

      logger.info(`Audio mixer created for group ${groupId}`, {
        participantCount: participants.length
      });

      return audioMixer;
    } catch (error) {
      logger.error(`Failed to create audio mixer for group ${groupId}:`, error);
      throw error;
    }
  }

  // Add participant to audio mixer
  async addParticipant(groupId, participantId, audioStream) {
    try {
      const audioMixer = this.audioMixers.get(groupId);
      if (!audioMixer) {
        throw new Error(`No audio mixer found for group ${groupId}`);
      }

      // Add participant to mixer
      audioMixer.participants.add(participantId);
      
      // Initialize audio level tracking
      this.audioLevels.set(participantId, {
        level: 0,
        isSpeaking: false,
        lastUpdate: Date.now(),
        silenceStart: null,
      });

      // Set up audio processing if enabled
      if (this.audioProcessing.voiceActivityDetection) {
        await this.setupVoiceActivityDetection(participantId, audioStream);
      }

      logger.info(`Participant ${participantId} added to audio mixer for group ${groupId}`);
      
      return {
        participantId,
        groupId,
        audioLevel: 0,
        isSpeaking: false,
        bandwidthAllocated: this.calculateBandwidthAllocation(groupId)
      };
    } catch (error) {
      logger.error(`Failed to add participant ${participantId} to group ${groupId}:`, error);
      throw error;
    }
  }

  // Remove participant from audio mixer
  async removeParticipant(groupId, participantId) {
    try {
      const audioMixer = this.audioMixers.get(groupId);
      if (!audioMixer) {
        logger.warn(`No audio mixer found for group ${groupId}`);
        return;
      }

      // Remove from active speakers
      audioMixer.activeSpeakers.delete(participantId);
      
      // Remove from participants
      audioMixer.participants.delete(participantId);
      
      // Clean up audio level tracking
      this.audioLevels.delete(participantId);

      logger.info(`Participant ${participantId} removed from audio mixer for group ${groupId}`);
      
      return {
        participantId,
        groupId,
        remainingParticipants: audioMixer.participants.size
      };
    } catch (error) {
      logger.error(`Failed to remove participant ${participantId} from group ${groupId}:`, error);
      throw error;
    }
  }

  // Update audio level for participant
  async updateAudioLevel(participantId, level) {
    try {
      const audioData = this.audioLevels.get(participantId);
      if (!audioData) {
        return;
      }

      const previousLevel = audioData.level;
      const previousSpeaking = audioData.isSpeaking;
      
      // Update audio level
      audioData.level = level;
      audioData.lastUpdate = Date.now();

      // Determine if participant is speaking
      const isSpeaking = level > this.config.audioLevelThreshold;
      audioData.isSpeaking = isSpeaking;

      // Handle silence timeout
      if (!isSpeaking && previousSpeaking) {
        audioData.silenceStart = Date.now();
      } else if (isSpeaking) {
        audioData.silenceStart = null;
      }

      // Find which group this participant belongs to
      const groupId = this.findParticipantGroup(participantId);
      if (groupId) {
        await this.updateGroupAudioLevels(groupId, participantId, level, isSpeaking);
      }

      return {
        participantId,
        level,
        isSpeaking,
        silenceDuration: audioData.silenceStart ? Date.now() - audioData.silenceStart : 0
      };
    } catch (error) {
      logger.error(`Failed to update audio level for participant ${participantId}:`, error);
      throw error;
    }
  }

  // Update group audio levels and manage speakers
  async updateGroupAudioLevels(groupId, participantId, level, isSpeaking) {
    try {
      const audioMixer = this.audioMixers.get(groupId);
      if (!audioMixer) {
        return;
      }

      // Update active speakers
      if (isSpeaking) {
        audioMixer.activeSpeakers.set(participantId, {
          level,
          timestamp: Date.now(),
          participantId
        });
      } else {
        audioMixer.activeSpeakers.delete(participantId);
      }

      // Manage speaker queue (limit concurrent speakers)
      const sortedSpeakers = Array.from(audioMixer.activeSpeakers.values())
        .sort((a, b) => b.level - a.level)
        .slice(0, this.config.maxConcurrentSpeakers);

      // Update speaker history
      if (sortedSpeakers.length > 0) {
        const currentSpeaker = sortedSpeakers[0];
        const speakerHistory = this.speakerHistory.get(groupId) || [];
        
        // Add to history if speaker changed
        if (speakerHistory.length === 0 || speakerHistory[speakerHistory.length - 1].participantId !== currentSpeaker.participantId) {
          speakerHistory.push({
            participantId: currentSpeaker.participantId,
            level: currentSpeaker.level,
            timestamp: Date.now(),
            duration: 0
          });
          
          // Keep only last 10 speakers
          if (speakerHistory.length > 10) {
            speakerHistory.shift();
          }
          
          this.speakerHistory.set(groupId, speakerHistory);
        }
      }

      // Update bandwidth usage
      audioMixer.bandwidthUsage = this.calculateBandwidthUsage(groupId);

      return {
        groupId,
        activeSpeakers: sortedSpeakers.length,
        currentSpeaker: sortedSpeakers[0] || null,
        bandwidthUsage: audioMixer.bandwidthUsage
      };
    } catch (error) {
      logger.error(`Failed to update group audio levels for ${groupId}:`, error);
      throw error;
    }
  }

  // Setup voice activity detection
  async setupVoiceActivityDetection(participantId, audioStream) {
    try {
      // This would integrate with MediaSoup's audio level observer
      // For now, we'll simulate the setup
      logger.debug(`Voice activity detection setup for participant ${participantId}`);
      
      return {
        participantId,
        vadEnabled: true,
        threshold: this.config.audioLevelThreshold,
        timeout: this.config.silenceTimeout
      };
    } catch (error) {
      logger.error(`Failed to setup voice activity detection for ${participantId}:`, error);
      throw error;
    }
  }

  // Calculate bandwidth allocation for participant
  calculateBandwidthAllocation(groupId) {
    try {
      const audioMixer = this.audioMixers.get(groupId);
      if (!audioMixer) {
        return 0;
      }

      const participantCount = audioMixer.participants.size;
      if (participantCount === 0) {
        return 0;
      }

      // Allocate bandwidth based on participant count and configuration
      const baseBandwidth = this.config.bandwidthLimit;
      const allocatedBandwidth = Math.min(baseBandwidth, baseBandwidth / participantCount);
      
      return Math.floor(allocatedBandwidth);
    } catch (error) {
      logger.error(`Failed to calculate bandwidth allocation for group ${groupId}:`, error);
      return 0;
    }
  }

  // Calculate total bandwidth usage for group
  calculateBandwidthUsage(groupId) {
    try {
      const audioMixer = this.audioMixers.get(groupId);
      if (!audioMixer) {
        return 0;
      }

      const participantCount = audioMixer.participants.size;
      const activeSpeakerCount = audioMixer.activeSpeakers.size;
      
      // Calculate bandwidth based on active speakers and participants
      const baseBandwidth = this.config.bandwidthLimit;
      const totalBandwidth = participantCount * baseBandwidth;
      
      return totalBandwidth;
    } catch (error) {
      logger.error(`Failed to calculate bandwidth usage for group ${groupId}:`, error);
      return 0;
    }
  }

  // Find which group a participant belongs to
  findParticipantGroup(participantId) {
    for (const [groupId, audioMixer] of this.audioMixers) {
      if (audioMixer.participants.has(participantId)) {
        return groupId;
      }
    }
    return null;
  }

  // Get audio mixer status
  getAudioMixerStatus(groupId) {
    try {
      const audioMixer = this.audioMixers.get(groupId);
      if (!audioMixer) {
        return null;
      }

      const speakerHistory = this.speakerHistory.get(groupId) || [];
      
      return {
        groupId,
        participantCount: audioMixer.participants.size,
        activeSpeakers: audioMixer.activeSpeakers.size,
        currentSpeaker: Array.from(audioMixer.activeSpeakers.values())
          .sort((a, b) => b.level - a.level)[0] || null,
        bandwidthUsage: audioMixer.bandwidthUsage,
        bandwidthAllocated: this.calculateBandwidthAllocation(groupId),
        speakerHistory: speakerHistory.slice(-5), // Last 5 speakers
        isActive: audioMixer.isActive,
        createdAt: audioMixer.createdAt
      };
    } catch (error) {
      logger.error(`Failed to get audio mixer status for group ${groupId}:`, error);
      return null;
    }
  }

  // Get all audio mixer statuses
  getAllAudioMixerStatuses() {
    try {
      const statuses = [];
      for (const [groupId] of this.audioMixers) {
        const status = this.getAudioMixerStatus(groupId);
        if (status) {
          statuses.push(status);
        }
      }
      return statuses;
    } catch (error) {
      logger.error('Failed to get all audio mixer statuses:', error);
      return [];
    }
  }

  // Cleanup audio mixer
  async cleanupAudioMixer(groupId) {
    try {
      const audioMixer = this.audioMixers.get(groupId);
      if (!audioMixer) {
        logger.warn(`No audio mixer found for group ${groupId}`);
        return;
      }

      // Clean up all participants
      for (const participantId of audioMixer.participants) {
        this.audioLevels.delete(participantId);
      }

      // Remove mixer and history
      this.audioMixers.delete(groupId);
      this.speakerHistory.delete(groupId);

      logger.info(`Audio mixer cleaned up for group ${groupId}`);
    } catch (error) {
      logger.error(`Failed to cleanup audio mixer for group ${groupId}:`, error);
      throw error;
    }
  }

  // Get service statistics
  getServiceStats() {
    try {
      const totalParticipants = Array.from(this.audioMixers.values())
        .reduce((sum, mixer) => sum + mixer.participants.size, 0);
      
      const totalActiveSpeakers = Array.from(this.audioMixers.values())
        .reduce((sum, mixer) => sum + mixer.activeSpeakers.size, 0);

      const totalBandwidthUsage = Array.from(this.audioMixers.values())
        .reduce((sum, mixer) => sum + mixer.bandwidthUsage, 0);

      return {
        totalGroups: this.audioMixers.size,
        totalParticipants,
        totalActiveSpeakers,
        totalBandwidthUsage,
        audioProcessing: this.audioProcessing,
        config: this.config,
        uptime: process.uptime()
      };
    } catch (error) {
      logger.error('Failed to get audio routing service stats:', error);
      return {
        totalGroups: 0,
        totalParticipants: 0,
        totalActiveSpeakers: 0,
        totalBandwidthUsage: 0,
        error: error.message
      };
    }
  }

  // Cleanup service
  async cleanup() {
    try {
      logger.info('Cleaning up audio routing service...');
      
      // Clean up all audio mixers
      for (const [groupId] of this.audioMixers) {
        await this.cleanupAudioMixer(groupId);
      }

      // Clear all maps
      this.audioMixers.clear();
      this.participantStreams.clear();
      this.audioLevels.clear();
      this.speakerHistory.clear();

      logger.info('Audio routing service cleanup completed');
    } catch (error) {
      logger.error('Failed to cleanup audio routing service:', error);
    }
  }
}

// Initialize the service
const audioRoutingService = new AudioRoutingService();

module.exports = {
  audioRoutingService,
  AudioRoutingService,
  initializeAudioRouting: () => audioRoutingService.initialize(),
};
