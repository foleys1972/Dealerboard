const logger = require('../utils/logger');
const { pool } = require('./databaseService');
const { audioRecordingService } = require('./audioRecordingService');
const fs = require('fs-extra');
const path = require('path');

/**
 * Retention Policy Service
 * 
 * Enforces location-based retention policies for:
 * - Voice recordings
 * - Messaging data (Matrix messages)
 * - Other data
 * 
 * Respects legal hold flags - data under legal hold is never deleted
 */
class RetentionPolicyService {
  constructor() {
    this.isRunning = false;
    this.schedulerInterval = null;
    this.checkInterval = 24 * 60 * 60 * 1000; // 24 hours default
    this.lastRun = null;
    this.stats = {
      totalChecks: 0,
      recordingsDeleted: 0,
      messagesDeleted: 0,
      dataDeleted: 0,
      legalHoldProtected: 0,
      errors: 0
    };
  }

  /**
   * Initialize the retention policy service
   */
  async initialize() {
    try {
      // Get check interval from environment or use default
      const intervalHours = parseInt(process.env.RETENTION_CHECK_INTERVAL_HOURS) || 24;
      this.checkInterval = intervalHours * 60 * 60 * 1000;

      logger.info(`Retention policy service initialized (check interval: ${intervalHours} hours)`);
      
      // Run initial check after a short delay
      setTimeout(() => {
        this.runRetentionCheck();
      }, 60000); // 1 minute delay

      // Start scheduler
      this.startScheduler();
    } catch (error) {
      logger.error('Failed to initialize retention policy service:', error);
      throw error;
    }
  }

  /**
   * Start the retention policy scheduler
   */
  startScheduler() {
    if (this.isRunning) {
      logger.warn('Retention policy scheduler is already running');
      return;
    }

    this.isRunning = true;
    
    this.schedulerInterval = setInterval(() => {
      this.runRetentionCheck();
    }, this.checkInterval);

    logger.info(`Retention policy scheduler started (interval: ${this.checkInterval / 1000 / 60 / 60} hours)`);
  }

  /**
   * Stop the retention policy scheduler
   */
  stopScheduler() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    this.isRunning = false;
    logger.info('Retention policy scheduler stopped');
  }

  /**
   * Run retention policy check
   */
  async runRetentionCheck() {
    try {
      this.lastRun = new Date();
      this.stats.totalChecks++;
      
      logger.info('Starting retention policy check...');

      // Get all locations with their retention policies
      const locations = await this.getLocationsWithRetentionPolicies();

      // Process voice recordings
      await this.processVoiceRecordings(locations);

      // Process messaging data
      await this.processMessagingData(locations);

      // Process other data
      await this.processOtherData(locations);

      logger.info(`Retention policy check completed. Stats: ${JSON.stringify(this.stats)}`);
    } catch (error) {
      logger.error('Retention policy check failed:', error);
      this.stats.errors++;
    }
  }

  /**
   * Get all locations with their retention policies
   */
  async getLocationsWithRetentionPolicies() {
    try {
      const result = await pool.query(
        `SELECT 
          id, 
          name, 
          voice_retention_days, 
          messaging_retention_days, 
          data_retention_days,
          legal_hold
         FROM locations`
      );

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        voiceRetentionDays: row.voice_retention_days,
        messagingRetentionDays: row.messaging_retention_days,
        dataRetentionDays: row.data_retention_days,
        legalHold: row.legal_hold || false
      }));
    } catch (error) {
      logger.error('Failed to get locations with retention policies:', error);
      return [];
    }
  }

  /**
   * Get user's location ID
   */
  async getUserLocation(userId) {
    try {
      const result = await pool.query(
        `SELECT location_id FROM users WHERE id = $1`,
        [userId]
      );

      if (result.rows.length > 0 && result.rows[0].location_id) {
        return result.rows[0].location_id;
      }
      return null;
    } catch (error) {
      logger.error(`Failed to get location for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Get default retention days for a location or system default
   */
  getRetentionDays(location, dataType) {
    if (!location) {
      // Default retention if no location
      return 30; // 30 days default
    }

    if (location.legalHold) {
      // Legal hold - never delete
      return null; // null means never delete
    }

    switch (dataType) {
      case 'voice':
        return location.voiceRetentionDays || 30;
      case 'messaging':
        return location.messagingRetentionDays || 30;
      case 'data':
        return location.dataRetentionDays || 30;
      default:
        return 30;
    }
  }

  /**
   * Process voice recordings based on retention policies
   */
  async processVoiceRecordings(locations) {
    try {
      logger.info('Processing voice recordings for retention...');

      const recordings = await audioRecordingService.getCompletedRecordings();
      const now = new Date();
      let deletedCount = 0;
      let protectedCount = 0;

      for (const recording of recordings) {
        try {
          // Get recording participants to determine location
          const participants = recording.participants || [];
          if (participants.length === 0) {
            // No participants, use default retention
            const retentionDays = 30;
            const cutoffDate = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
            
            if (recording.startTime && new Date(recording.startTime) < cutoffDate) {
              await this.deleteRecording(recording);
              deletedCount++;
            }
            continue;
          }

          // Get location for first participant (or use most restrictive policy)
          let location = null;
          let retentionDays = 30; // Default
          let hasLegalHold = false;

          for (const participant of participants) {
            const participantId = participant.userId || participant.id || participant;
            if (!participantId) continue;

            const userLocationId = await this.getUserLocation(participantId);
            if (userLocationId) {
              const loc = locations.find(l => l.id === userLocationId);
              if (loc) {
                // Use most restrictive (longest) retention period
                const locRetention = this.getRetentionDays(loc, 'voice');
                if (locRetention === null) {
                  // Legal hold - never delete
                  hasLegalHold = true;
                  break;
                }
                if (locRetention > retentionDays) {
                  retentionDays = locRetention;
                  location = loc;
                }
              }
            }
          }

          // Skip if under legal hold
          if (hasLegalHold || (location && location.legalHold)) {
            protectedCount++;
            continue;
          }

          // Check if recording is older than retention period
          const cutoffDate = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
          
          if (recording.startTime && new Date(recording.startTime) < cutoffDate) {
            await this.deleteRecording(recording);
            deletedCount++;
          }
        } catch (error) {
          logger.error(`Failed to process recording ${recording.id}:`, error);
          this.stats.errors++;
        }
      }

      this.stats.recordingsDeleted += deletedCount;
      this.stats.legalHoldProtected += protectedCount;
      
      logger.info(`Voice recordings processed: ${deletedCount} deleted, ${protectedCount} protected by legal hold`);
    } catch (error) {
      logger.error('Failed to process voice recordings:', error);
      throw error;
    }
  }

  /**
   * Delete a recording and its metadata
   */
  async deleteRecording(recording) {
    try {
      // Delete audio file
      if (recording.filePath && await fs.pathExists(recording.filePath)) {
        await fs.remove(recording.filePath);
        logger.debug(`Deleted recording file: ${recording.filePath}`);
      }

      // Delete metadata file
      if (recording.metadataPath && await fs.pathExists(recording.metadataPath)) {
        await fs.remove(recording.metadataPath);
        logger.debug(`Deleted recording metadata: ${recording.metadataPath}`);
      }

      // Remove from service
      await audioRecordingService.deleteRecording(recording.id);

      logger.info(`Deleted recording: ${recording.id}`);
    } catch (error) {
      logger.error(`Failed to delete recording ${recording.id}:`, error);
      throw error;
    }
  }

  /**
   * Process messaging data based on retention policies
   */
  async processMessagingData(locations) {
    try {
      logger.info('Processing messaging data for retention...');

      // Get Matrix chat rooms
      const roomsResult = await pool.query(
        `SELECT id, room_id, created_by, last_activity, created_at, members
         FROM matrix_chat_rooms
         WHERE is_archived = false`
      );

      const now = new Date();
      let deletedCount = 0;
      let protectedCount = 0;

      for (const room of roomsResult.rows) {
        try {
          // Get location for room creator or members
          let location = null;
          let retentionDays = 30; // Default
          let hasLegalHold = false;

          // Check creator's location
          if (room.created_by) {
            const userLocationId = await this.getUserLocation(room.created_by);
            if (userLocationId) {
              const loc = locations.find(l => l.id === userLocationId);
              if (loc) {
                const locRetention = this.getRetentionDays(loc, 'messaging');
                if (locRetention === null) {
                  hasLegalHold = true;
                } else if (locRetention > retentionDays) {
                  retentionDays = locRetention;
                  location = loc;
                }
              }
            }
          }

          // Check members' locations (use most restrictive)
          if (room.members && Array.isArray(room.members)) {
            for (const memberId of room.members) {
              const userLocationId = await this.getUserLocation(memberId);
              if (userLocationId) {
                const loc = locations.find(l => l.id === userLocationId);
                if (loc) {
                  const locRetention = this.getRetentionDays(loc, 'messaging');
                  if (locRetention === null) {
                    hasLegalHold = true;
                    break;
                  }
                  if (locRetention > retentionDays) {
                    retentionDays = locRetention;
                    location = loc;
                  }
                }
              }
            }
          }

          // Skip if under legal hold
          if (hasLegalHold || (location && location.legalHold)) {
            protectedCount++;
            continue;
          }

          // Check if room is inactive and older than retention period
          const lastActivity = room.last_activity || room.created_at;
          const cutoffDate = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
          
          if (lastActivity && new Date(lastActivity) < cutoffDate) {
            // Archive the room (don't delete, just mark as archived)
            await pool.query(
              `UPDATE matrix_chat_rooms 
               SET is_archived = true, archived_at = NOW() 
               WHERE id = $1`,
              [room.id]
            );
            deletedCount++;
            logger.debug(`Archived messaging room: ${room.id}`);
          }
        } catch (error) {
          logger.error(`Failed to process messaging room ${room.id}:`, error);
          this.stats.errors++;
        }
      }

      this.stats.messagesDeleted += deletedCount;
      this.stats.legalHoldProtected += protectedCount;
      
      logger.info(`Messaging data processed: ${deletedCount} rooms archived, ${protectedCount} protected by legal hold`);
    } catch (error) {
      logger.error('Failed to process messaging data:', error);
      throw error;
    }
  }

  /**
   * Process other data based on retention policies
   */
  async processOtherData(locations) {
    try {
      logger.info('Processing other data for retention...');

      // This can be extended for other data types
      // For now, we'll just log that it's processed
      
      logger.info('Other data retention processing completed');
    } catch (error) {
      logger.error('Failed to process other data:', error);
      throw error;
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      nextRun: this.lastRun ? new Date(this.lastRun.getTime() + this.checkInterval) : null,
      checkIntervalHours: this.checkInterval / 1000 / 60 / 60
    };
  }

  /**
   * Manually trigger retention check (for testing/admin)
   */
  async triggerManualCheck() {
    logger.info('Manual retention policy check triggered');
    await this.runRetentionCheck();
  }

  /**
   * Cleanup service
   */
  async cleanup() {
    this.stopScheduler();
    logger.info('Retention policy service cleaned up');
  }
}

// Singleton instance
let retentionPolicyServiceInstance = null;

async function initializeRetentionPolicyService() {
  if (!retentionPolicyServiceInstance) {
    retentionPolicyServiceInstance = new RetentionPolicyService();
    await retentionPolicyServiceInstance.initialize();
  }
  return retentionPolicyServiceInstance;
}

function getRetentionPolicyService() {
  return retentionPolicyServiceInstance;
}

module.exports = {
  RetentionPolicyService,
  initializeRetentionPolicyService,
  getRetentionPolicyService
};

