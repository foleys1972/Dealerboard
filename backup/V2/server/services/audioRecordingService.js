const logger = require('../utils/logger');
const fs = require('fs-extra');
const path = require('path');

class AudioRecordingService {
  constructor() {
    this.recordings = new Map();
    this.completedRecordings = [];
    this.recordingDir = process.env.RECORDING_DIR || path.join(__dirname, '../../recordings');
    this.maxRecordingDuration = parseInt(process.env.MAX_RECORDING_DURATION) || 3600000; // 1 hour
    this.recordingFormat = process.env.RECORDING_FORMAT || 'wav';
    this.recordingQuality = process.env.RECORDING_QUALITY || 'high';
    this.encryptionEnabled = process.env.RECORDING_ENCRYPTION_ENABLED === 'true';
    this.retentionDays = parseInt(process.env.RECORDING_RETENTION_DAYS) || 30;
    this.storageLimitBytes = parseInt(process.env.RECORDING_STORAGE_LIMIT_GB || '500') * 1024 * 1024 * 1024;
    
    this.initializeRecordingDirectory();
  }

  async initializeRecordingDirectory() {
    try {
      await fs.ensureDir(this.recordingDir);
      logger.info(`Recording directory initialized: ${this.recordingDir}`);
      
      // Load existing recordings from disk
      await this.loadRecordingsFromDisk();
    } catch (error) {
      logger.error('Failed to initialize recording directory:', error);
      throw error;
    }
  }

  async loadRecordingsFromDisk() {
    try {
      const files = await fs.readdir(this.recordingDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      logger.info(`Loading ${jsonFiles.length} recordings from disk...`);
      
      for (const jsonFile of jsonFiles) {
        try {
          const jsonPath = path.join(this.recordingDir, jsonFile);
          const metadata = await fs.readJson(jsonPath);
          
          // Find corresponding audio file
          const audioFile = files.find(f => {
            const baseName = path.basename(f, path.extname(f));
            return baseName === path.basename(jsonFile, '.json') && 
                   !f.endsWith('.json') &&
                   (f.endsWith('.wav') || f.endsWith('.webm') || f.endsWith('.mp3'));
          });
          
          if (audioFile) {
            const recording = {
              id: path.basename(jsonFile, '.json'),
              type: metadata.type || 'direct',
              groupId: metadata.groupId || metadata.callId || null,
              participants: metadata.participants || [],
              startTime: metadata.startTime ? new Date(metadata.startTime) : new Date(),
              endTime: metadata.endTime ? new Date(metadata.endTime) : new Date(),
              duration: metadata.duration || metadata.durationMs || 0,
              filePath: path.join(this.recordingDir, audioFile),
              status: 'completed',
              userId: metadata.userId || metadata.uploadedBy || null,
              metadataPath: jsonPath,
              metadata: metadata
            };
            
            // Only add if not already in completedRecordings
            if (!this.completedRecordings.find(r => r.id === recording.id)) {
              this.completedRecordings.push(recording);
            }
          }
        } catch (error) {
          logger.warn(`Failed to load recording from ${jsonFile}:`, error.message);
        }
      }
      
      // Sort by startTime descending (newest first)
      this.completedRecordings.sort((a, b) => {
        const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
        const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
        return timeB - timeA;
      });
      
      logger.info(`Loaded ${this.completedRecordings.length} recordings from disk`);
    } catch (error) {
      logger.error('Failed to load recordings from disk:', error);
    }
  }

  async startRecording(groupId, participants = []) {
    const recordingId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const recordingPath = path.join(this.recordingDir, `${recordingId}.${this.recordingFormat}`);
    
    const recording = {
        id: recordingId,
        groupId,
      participants: [...participants],
      startTime: new Date(),
        endTime: null,
        duration: 0,
      filePath: recordingPath,
      status: 'recording',
        metadata: {
        format: this.recordingFormat,
        quality: this.recordingQuality,
        encryptionEnabled: this.encryptionEnabled,
        retentionDays: this.retentionDays,
      },
    };

    this.recordings.set(recordingId, recording);
    
    logger.info(`Recording started for group ${groupId}: ${recordingId}`);
    return recording;
  }

  async stopRecording(recordingId) {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    recording.endTime = new Date();
    recording.duration = recording.endTime - recording.startTime;
    recording.status = 'completed';
    
    this.completedRecordings.unshift(recording);
    if (this.completedRecordings.length > 200) {
      this.completedRecordings.pop();
    }

    logger.info(`Recording stopped: ${recordingId} (duration: ${recording.duration}ms)`);
    return recording;
  }

  async pauseRecording(recordingId) {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    recording.status = 'paused';
    logger.info(`Recording paused: ${recordingId}`);
    return recording;
  }

  async resumeRecording(recordingId) {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    recording.status = 'recording';
    logger.info(`Recording resumed: ${recordingId}`);
    return recording;
  }

  async addParticipant(recordingId, participantId) {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    if (!recording.participants.includes(participantId)) {
      recording.participants.push(participantId);
      logger.info(`Participant ${participantId} added to recording ${recordingId}`);
    }

    return recording;
  }

  async removeParticipant(recordingId, participantId) {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    const index = recording.participants.indexOf(participantId);
    if (index > -1) {
      recording.participants.splice(index, 1);
      logger.info(`Participant ${participantId} removed from recording ${recordingId}`);
    }

    return recording;
  }

  getRecording(recordingId) {
    return this.recordings.get(recordingId);
  }

  getAllRecordings() {
    return Array.from(this.recordings.values());
  }

  getRecordingsByGroup(groupId) {
    return this.getCompletedRecordings().filter(r => r.groupId === groupId);
  }

  getCompletedRecordings() {
    const completed = Array.from(this.recordings.values()).filter(r => r.status === 'completed');
    return [...this.completedRecordings, ...completed];
  }

  async deleteRecording(recordingId) {
    const recording = this.recordings.get(recordingId) || this.completedRecordings.find(r => r.id === recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    try {
      if (await fs.pathExists(recording.filePath)) {
        await fs.remove(recording.filePath);
      }
      
      this.recordings.delete(recordingId);
      this.completedRecordings = this.completedRecordings.filter(r => r.id !== recordingId);
      logger.info(`Recording deleted: ${recordingId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete recording ${recordingId}:`, error);
      throw error;
    }
  }

  async cleanupExpiredRecordings() {
    const now = new Date();
    const expiredRecordings = [];

    for (const [recordingId, recording] of this.recordings) {
      const ageInDays = (now - recording.startTime) / (1000 * 60 * 60 * 24);
      if (ageInDays > this.retentionDays) {
        expiredRecordings.push(recordingId);
      }
    }

    for (const recordingId of expiredRecordings) {
      try {
        await this.deleteRecording(recordingId);
    } catch (error) {
        logger.error(`Failed to cleanup expired recording ${recordingId}:`, error);
      }
    }

    logger.info(`Cleaned up ${expiredRecordings.length} expired recordings`);
    return expiredRecordings.length;
  }

  getStatus() {
    return {
      isInitialized: true,
      recordingDir: this.recordingDir,
      activeRecordings: this.recordings.size,
      config: {
        maxDuration: this.maxRecordingDuration,
        format: this.recordingFormat,
        quality: this.recordingQuality,
        encryptionEnabled: this.encryptionEnabled,
        retentionDays: this.retentionDays,
      },
    };
  }

  async calculateStorageUsage() {
    try {
      const files = await fs.readdir(this.recordingDir);
      let totalBytes = 0;
      for (const file of files) {
        const filePath = path.join(this.recordingDir, file);
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          totalBytes += stats.size;
        }
      }

      const usedGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
      const remainingBytes = Math.max(this.storageLimitBytes - totalBytes, 0);

      return {
        usedBytes: totalBytes,
        used: `${usedGB} GB`,
        remainingBytes,
        remaining: `${(remainingBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`,
        limitBytes: this.storageLimitBytes,
        limit: `${(this.storageLimitBytes / (1024 * 1024 * 1024)).toFixed(0)} GB`,
      };
    } catch (error) {
      logger.error('Failed to calculate storage usage:', error);
      return {
        usedBytes: 0,
        used: '0 GB',
        remainingBytes: this.storageLimitBytes,
        remaining: `${(this.storageLimitBytes / (1024 * 1024 * 1024)).toFixed(0)} GB`,
        limitBytes: this.storageLimitBytes,
        limit: `${(this.storageLimitBytes / (1024 * 1024 * 1024)).toFixed(0)} GB`,
      };
    }
  }
}

const audioRecordingService = new AudioRecordingService();

async function setupAudioRecording(mediaSoupWorker = null) {
  try {
    logger.info('Audio recording service initialized');
    return audioRecordingService;
    } catch (error) {
    logger.error('Failed to initialize audio recording service:', error);
    throw error;
  }
}

module.exports = {
  setupAudioRecording,
  audioRecordingService,
  AudioRecordingService,
};
