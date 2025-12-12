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
    } catch (error) {
      logger.error('Failed to initialize recording directory:', error);
      throw error;
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
