const logger = require('../utils/logger');
const fs = require('fs-extra');
const path = require('path');
const { 
  createRecording, 
  getRecording: getRecordingFromDB, 
  updateRecording, 
  findRecordings,
  getCallSession 
} = require('./databaseService');

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
    this.useDatabase = process.env.RECORDING_USE_DATABASE !== 'false'; // Default to true
    
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

  async startRecording(groupId, participants = [], options = {}) {
    const recordingId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const recordingPath = path.join(this.recordingDir, `${recordingId}.${this.recordingFormat}`);
    
    const {
      sessionId,
      callType = 'group-call',
      lineId,
      groupCallMode,
      broadcastMode,
      recordingUserId,
      topology,
      roomIds = [],
      platform = 'matrix',
      captureMethod = 'webrtc',
      videoWasEnabled = false
    } = options;

    const startTime = new Date();
    
    const recording = {
      id: recordingId,
      groupId,
      participants: [...participants],
      startTime,
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
      // New fields for database integration
      sessionId,
      callType,
      lineId,
      groupCallMode,
      broadcastMode,
      recordingUserId,
      topology,
      roomIds,
      platform,
      captureMethod,
      videoWasEnabled
    };

    this.recordings.set(recordingId, recording);

    // Save to database if enabled
    if (this.useDatabase && sessionId) {
      try {
        // Get call session to extract metadata
        const callSession = await getCallSession(sessionId);
        
        await createRecording({
          recordingId,
          sessionId,
          callType,
          groupCallMode: groupCallMode || callSession?.groupMode || null,
          broadcastMode: broadcastMode || null,
          recordingUserId: recordingUserId || participants[0] || null,
          lineId: lineId || callSession?.lineId || null,
          startTime,
          fileUrl: recordingPath, // Will be updated when file is saved
          audioFormat: `audio/${this.recordingFormat}`,
          participants: participants.map(p => ({
            userId: p,
            role: 'participant',
            joinTime: startTime.toISOString()
          })),
          invitedNoAnswer: callSession?.invitedNoAnswer || [],
          topology: topology || callSession?.topologyType || null,
          roomIds: roomIds.length > 0 ? roomIds : (callSession?.rooms || []),
          videoWasEnabled,
          captureMethod,
          platform,
          uploaded: false,
          verintSynced: false,
          recordingMetadata: {
            format: this.recordingFormat,
            quality: this.recordingQuality,
            encryptionEnabled: this.encryptionEnabled,
            retentionDays: this.retentionDays,
            groupId
          }
        });
        logger.info(`Recording ${recordingId} saved to database`);
      } catch (error) {
        logger.error(`Failed to save recording ${recordingId} to database:`, error);
        // Continue with in-memory recording even if database save fails
      }
    }
    
    logger.info(`Recording started for group ${groupId}: ${recordingId}`);
    return recording;
  }

  async stopRecording(recordingId) {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    const endTime = new Date();
    const duration = Math.floor((endTime - recording.startTime) / 1000); // Convert to seconds
    
    recording.endTime = endTime;
    recording.duration = duration * 1000; // Keep in ms for backward compatibility
    recording.status = 'completed';
    
    this.completedRecordings.unshift(recording);
    if (this.completedRecordings.length > 200) {
      this.completedRecordings.pop();
    }

    // Update database if enabled
    if (this.useDatabase && recording.sessionId) {
      try {
        // Get file size if file exists
        let fileSize = null;
        if (await fs.pathExists(recording.filePath)) {
          const stats = await fs.stat(recording.filePath);
          fileSize = stats.size;
        }

        // Calculate retention date (7 years default per spec)
        const retentionYears = recording.metadata?.retentionYears || 7;
        const retentionUntil = new Date();
        retentionUntil.setFullYear(retentionUntil.getFullYear() + retentionYears);

        await updateRecording(recordingId, {
          endTime,
          duration,
          fileUrl: recording.filePath,
          fileSize,
          audioFormat: `audio/${this.recordingFormat}`,
          participants: recording.participants.map(p => ({
            userId: p,
            role: 'participant',
            joinTime: recording.startTime.toISOString(),
            leaveTime: endTime.toISOString()
          })),
          retentionUntil
        });
        logger.info(`Recording ${recordingId} updated in database`);
      } catch (error) {
        logger.error(`Failed to update recording ${recordingId} in database:`, error);
        // Continue even if database update fails
      }
    }

    logger.info(`Recording stopped: ${recordingId} (duration: ${duration}s)`);
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

      // Update database if enabled
      if (this.useDatabase && recording.sessionId) {
        try {
          const dbRecording = await getRecordingFromDB(recordingId);
          if (dbRecording) {
            const participants = Array.isArray(dbRecording.participants) ? dbRecording.participants : [];
            participants.push({
              userId: participantId,
              role: 'participant',
              joinTime: new Date().toISOString()
            });
            await updateRecording(recordingId, { participants });
          }
        } catch (error) {
          logger.error(`Failed to update participant in database for ${recordingId}:`, error);
        }
      }
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

  async getRecording(recordingId) {
    // Try in-memory first
    const inMemoryRecording = this.recordings.get(recordingId);
    if (inMemoryRecording) {
      return inMemoryRecording;
    }

    // Try database if enabled
    if (this.useDatabase) {
      try {
        const dbRecording = await getRecordingFromDB(recordingId);
        if (dbRecording) {
          // Convert database format to service format
          return {
            id: dbRecording.recordingId,
            groupId: dbRecording.recordingMetadata?.groupId || null,
            participants: dbRecording.participants.map(p => p.userId || p),
            startTime: dbRecording.startTime,
            endTime: dbRecording.endTime,
            duration: dbRecording.duration ? dbRecording.duration * 1000 : 0, // Convert to ms
            filePath: dbRecording.fileUrl,
            status: dbRecording.endTime ? 'completed' : 'recording',
            metadata: dbRecording.recordingMetadata,
            sessionId: dbRecording.sessionId,
            callType: dbRecording.callType,
            lineId: dbRecording.lineId
          };
        }
      } catch (error) {
        logger.error(`Failed to get recording ${recordingId} from database:`, error);
      }
    }

    // Try completed recordings
    return this.completedRecordings.find(r => r.id === recordingId);
  }

  getAllRecordings() {
    return Array.from(this.recordings.values());
  }

  async getRecordingsByGroup(groupId) {
    const completed = await this.getCompletedRecordings();
    return completed.filter(r => r.groupId === groupId);
  }

  async getCompletedRecordings() {
    const inMemoryCompleted = Array.from(this.recordings.values()).filter(r => r.status === 'completed');
    const fileBasedCompleted = this.completedRecordings;
    
    // Get from database if enabled
    if (this.useDatabase) {
      try {
        const dbRecordings = await findRecordings({ 
          limit: 1000 // Get recent recordings
        });
        
        // Convert database format to service format
        const dbCompleted = dbRecordings
          .filter(r => r.endTime) // Only completed recordings
          .map(r => ({
            id: r.recordingId,
            groupId: r.recordingMetadata?.groupId || null,
            participants: r.participants.map(p => p.userId || p),
            startTime: r.startTime,
            endTime: r.endTime,
            duration: r.duration ? r.duration * 1000 : 0,
            filePath: r.fileUrl,
            status: 'completed',
            metadata: r.recordingMetadata,
            sessionId: r.sessionId,
            callType: r.callType,
            lineId: r.lineId
          }));

        // Merge and deduplicate
        const allRecordings = [...inMemoryCompleted, ...fileBasedCompleted, ...dbCompleted];
        const uniqueRecordings = Array.from(
          new Map(allRecordings.map(r => [r.id, r])).values()
        );
        
        // Sort by startTime descending
        return uniqueRecordings.sort((a, b) => {
          const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
          const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
          return timeB - timeA;
        });
      } catch (error) {
        logger.error('Failed to get recordings from database:', error);
      }
    }

    return [...fileBasedCompleted, ...inMemoryCompleted];
  }

  async deleteRecording(recordingId) {
    const recording = this.recordings.get(recordingId) || 
                      this.completedRecordings.find(r => r.id === recordingId) ||
                      (this.useDatabase ? await this.getRecording(recordingId) : null);
    
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    try {
      // Delete file if exists
      if (recording.filePath && await fs.pathExists(recording.filePath)) {
        await fs.remove(recording.filePath);
      }
      
      // Remove from in-memory storage
      this.recordings.delete(recordingId);
      this.completedRecordings = this.completedRecordings.filter(r => r.id !== recordingId);
      
      // Note: We don't delete from database to maintain audit trail
      // Instead, we could mark it as deleted or rely on retention policies
      // If you want to delete from DB, uncomment:
      // if (this.useDatabase) {
      //   await deleteRecording(recordingId); // Would need to add this function
      // }
      
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
