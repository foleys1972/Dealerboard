const logger = require('../utils/logger');
const { getGroupById, createGroup, addUserToGroup, removeUserFromGroup, updateGroup: updateGroupRecord, findGroups } = require('./databaseService');
const { MatrixService } = require('./matrixService');
const { createGroupRouter, deleteGroupRouter } = require('./mediaSoupService');
const { audioRoutingService } = require('./audioRoutingService');

class GroupService {
  constructor() {
    this.activeGroups = new Map(); // In-memory group state
    this.groupRooms = new Map(); // MediaSoup rooms for each group
    this.userGroups = new Map(); // User to groups mapping
    this.groupPermissions = new Map(); // Group-specific permissions
    this.defaultHootConfig = {
      maxListeners: 100,
      maxSpeakers: 100,
      persistentListen: false,
      defaultPushToTalk: true,
      allowLatch: false,
      segmentDurationMs: 30_000,
      silenceThreshold: -50,
      silenceDurationMs: 5_000,
    };
    this.matrixService = new MatrixService(); // Matrix integration
    this.initialized = false;
  }

  normalizeHootConfig(config = {}) {
    return {
      maxListeners: Math.min(config.maxListeners || this.defaultHootConfig.maxListeners, 500),
      maxSpeakers: Math.min(config.maxSpeakers || this.defaultHootConfig.maxSpeakers, 500),
      persistentListen: config.persistentListen ?? this.defaultHootConfig.persistentListen,
      defaultPushToTalk: config.defaultPushToTalk ?? this.defaultHootConfig.defaultPushToTalk,
      allowLatch: config.allowLatch ?? this.defaultHootConfig.allowLatch,
      segmentDurationMs: config.segmentDurationMs || this.defaultHootConfig.segmentDurationMs,
      silenceThreshold: config.silenceThreshold || this.defaultHootConfig.silenceThreshold,
      silenceDurationMs: config.silenceDurationMs || this.defaultHootConfig.silenceDurationMs,
      multicastSource: config.multicastSource || null,
      bridgePort: config.bridgePort || null,
    };
  }

  createInitialHootState() {
    return {
      isActive: false,
      startedBy: null,
      startedAt: null,
      lastActivity: null,
      listeners: new Set(),
      persistentListeners: new Set(),
      activeSpeakers: new Set(),
      segments: [],
    };
  }

  // Initialize the service by loading existing groups from database
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Use the database service to get all groups (not just active ones)
      const existingGroups = await findGroups({});
      
      for (const group of existingGroups) {
        const hootConfig = this.normalizeHootConfig(group.hootConfig || {});
        // Initialize in-memory group state
        this.activeGroups.set(group.id, {
          ...group,
          callMode: group.callMode || 'REMAIN_GROUP',
          hootConfig,
          participants: new Set(group.participants || []),
          isActive: true,
          currentSpeaker: null,
          audioLevels: new Map(),
          hootState: this.createInitialHootState(),
          recording: null,
          broadcastQueue: [],
          lastActivity: new Date(),
        });

        // Set up user groups mapping
        for (const participantId of group.participants || []) {
          if (!this.userGroups.has(participantId)) {
            this.userGroups.set(participantId, new Set());
          }
          this.userGroups.get(participantId).add(group.id);
        }
      }
      
      this.initialized = true;
      logger.info(`Loaded ${existingGroups.length} existing groups from database`);
    } catch (error) {
      logger.error('Failed to initialize group service:', error);
      this.initialized = true; // Mark as initialized to prevent retries
    }
  }

  // Create a new group
  async createGroup(groupData) {
    try {
      const group = await createGroup({
        id: `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: groupData.name,
        description: groupData.description,
        type: groupData.type || 'trading',
        callMode: groupData.callMode || 'REMAIN_GROUP',
        isPublic: groupData.isPublic || false,
        maxParticipants: groupData.maxParticipants || 200,
        allowRecording: groupData.allowRecording !== false,
        pushToTalk: groupData.pushToTalk || false,
        createdBy: groupData.createdBy,
        participants: [groupData.createdBy],
        matrixRoomId: groupData.matrixRoomId,
        sipEnabled: groupData.sipEnabled || false,
        sipNumbers: groupData.sipNumbers || [],
        retentionPolicy: {
          retentionDays: groupData.retentionDays || 2555,
          emailDelivery: groupData.emailDelivery || false,
          emailRecipients: groupData.emailRecipients || [],
          emailSchedule: groupData.emailSchedule || 'immediate'
        },
        hootConfig: this.normalizeHootConfig(groupData.hootConfig || {}),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Initialize in-memory group state
      this.activeGroups.set(group.id, {
        ...group,
        callMode: group.callMode || 'conference',
        hootConfig: this.normalizeHootConfig(group.hootConfig || {}),
        participants: new Set([groupData.createdBy]),
        isActive: true,
        currentSpeaker: null,
        audioLevels: new Map(),
        hootState: this.createInitialHootState(),
        recording: null,
        broadcastQueue: [],
        lastActivity: new Date(),
      });

      // Set up group permissions
      this.setGroupPermissions(group.id, {
        canSpeak: true,
        canMute: true,
        canRecord: groupData.createdBy === groupData.createdBy,
        canModerate: groupData.createdBy === groupData.createdBy,
        canInvite: true,
        canKick: groupData.createdBy === groupData.createdBy,
      });

      // Create Matrix room for the group
      try {
        if (this.matrixService.config.enabled) {
          const matrixRoomId = await this.matrixService.createGroupRoom(group.id, {
            name: group.name,
            description: group.description,
            members: [groupData.createdBy]
          });
          
          // Update group with Matrix room ID
          group.matrixRoomId = matrixRoomId;
          await this.updateGroup(group.id, { matrixRoomId });
          
          logger.info(`Matrix room created for group ${group.id}: ${matrixRoomId}`);
        }
      } catch (error) {
        logger.warn(`Failed to create Matrix room for group ${group.id}:`, error.message);
      }

      // Create MediaSoup SFU router for the group
      try {
        const sfuRouter = await createGroupRouter(group.id);
        if (sfuRouter) {
          logger.info(`SFU router created for group ${group.id}`);
        }
      } catch (error) {
        logger.warn(`Failed to create SFU router for group ${group.id}:`, error.message);
      }

      // Create audio mixer for the group
      // try {
      //   await audioRoutingService.createAudioMixer(group.id, [groupData.createdBy]);
      //   logger.info(`Audio mixer created for group ${group.id}`);
      // } catch (error) {
      //   logger.warn(`Failed to create audio mixer for group ${group.id}:`, error.message);
      // }

      logger.info(`Group created: ${group.name} (${group.id})`);
      return group;
    } catch (error) {
      logger.error('Failed to create group:', error);
      throw error;
    }
  }

  // Join a group
  async joinGroup(groupId, userId, userData) {
    try {
      let group = this.activeGroups.get(groupId);
      
      // If group not in activeGroups, try to load it from database
      if (!group) {
        logger.info(`Group ${groupId} not in activeGroups, loading from database`);
        const dbGroup = await getGroupById(groupId);
        if (!dbGroup) {
          throw new Error('Group not found');
        }
        
        // Initialize the group in activeGroups
        this.activeGroups.set(groupId, {
          ...dbGroup,
          participants: new Set(Array.isArray(dbGroup.participants) ? dbGroup.participants : []),
          isActive: true,
          currentSpeaker: null,
          audioLevels: new Map(),
          recording: null,
          broadcastQueue: [],
          lastActivity: new Date(),
        });
        
        group = this.activeGroups.get(groupId);
      }

      // Check if group is full
      if (group.participants.size >= group.maxParticipants) {
        throw new Error('Group is full');
      }

      // Add user to group
      group.participants.add(userId);
      group.lastActivity = new Date();
      group.lastUsedOn = new Date();
      
      // Update user groups mapping
      if (!this.userGroups.has(userId)) {
        this.userGroups.set(userId, new Set());
      }
      this.userGroups.get(userId).add(groupId);

      // Add user to database
      await addUserToGroup(groupId, userId);

      // Add user to audio mixer
      // try {
      //   await audioRoutingService.addParticipant(groupId, userId, null);
      //   logger.info(`User ${userId} added to audio mixer for group ${groupId}`);
      // } catch (error) {
      //   logger.warn(`Failed to add user ${userId} to audio mixer:`, error.message);
      // }

      // Initialize user audio level
      group.audioLevels.set(userId, 0);

      // Add user to Matrix room if it exists
      try {
        if (group.matrixRoomId && this.matrixService.config.enabled) {
          await this.matrixService.inviteUser(group.matrixRoomId, userId);
          logger.info(`User ${userId} invited to Matrix room ${group.matrixRoomId}`);
        }
      } catch (error) {
        logger.warn(`Failed to invite user ${userId} to Matrix room:`, error.message);
      }

      logger.info(`User ${userId} joined group ${groupId}`);
      return {
        groupId,
        userId,
        participants: Array.from(group.participants),
        groupInfo: {
          name: group.name,
          type: group.type,
          maxParticipants: group.maxParticipants,
          allowRecording: group.allowRecording,
          pushToTalk: group.pushToTalk,
        }
      };
    } catch (error) {
      logger.error('Failed to join group:', error);
      throw error;
    }
  }

  // Leave a group
  async leaveGroup(groupId, userId) {
    try {
      let group = this.activeGroups.get(groupId);
      
      // If group not in activeGroups, try to load it from database
      if (!group) {
        logger.info(`Group ${groupId} not in activeGroups, loading from database`);
        const dbGroup = await getGroupById(groupId);
        if (!dbGroup) {
          throw new Error('Group not found');
        }
        
        // Initialize the group in activeGroups
        this.activeGroups.set(groupId, {
          ...dbGroup,
          participants: new Set(Array.isArray(dbGroup.participants) ? dbGroup.participants : []),
          isActive: true,
          currentSpeaker: null,
          audioLevels: new Map(),
          recording: null,
          broadcastQueue: [],
          lastActivity: new Date(),
        });
        
        group = this.activeGroups.get(groupId);
      }

      // Remove user from group
      group.participants.delete(userId);
      group.audioLevels.delete(userId);
      group.lastActivity = new Date();

      // Update user groups mapping
      if (this.userGroups.has(userId)) {
        this.userGroups.get(userId).delete(groupId);
        if (this.userGroups.get(userId).size === 0) {
          this.userGroups.delete(userId);
        }
      }

      // Remove user from database
      await removeUserFromGroup(groupId, userId);

      // Remove user from Matrix room if it exists
      try {
        if (group.matrixRoomId && this.matrixService.config.enabled) {
          await this.matrixService.kickUser(group.matrixRoomId, userId, 'User left group');
          logger.info(`User ${userId} removed from Matrix room ${group.matrixRoomId}`);
        }
      } catch (error) {
        logger.warn(`Failed to remove user ${userId} from Matrix room:`, error.message);
      }

      // Clean up empty groups
      if (group.participants.size === 0) {
        // Clean up SFU router
        try {
          await deleteGroupRouter(groupId);
          logger.info(`SFU router deleted for group ${groupId}`);
        } catch (error) {
          logger.warn(`Failed to delete SFU router for group ${groupId}:`, error.message);
        }

        // Clean up audio mixer
        // try {
        //   await audioRoutingService.cleanupAudioMixer(groupId);
        //   logger.info(`Audio mixer deleted for group ${groupId}`);
        // } catch (error) {
        //   logger.warn(`Failed to delete audio mixer for group ${groupId}:`, error.message);
        // }

        this.activeGroups.delete(groupId);
        this.groupPermissions.delete(groupId);
        logger.info(`Group ${groupId} deleted (no participants)`);
      }

      logger.info(`User ${userId} left group ${groupId}`);
      return {
        groupId,
        userId,
        participants: Array.from(group.participants),
      };
    } catch (error) {
      logger.error('Failed to leave group:', error);
      throw error;
    }
  }

  // Get group information
  getGroup(groupId) {
    return this.activeGroups.get(groupId);
  }

  // Get user's groups
  getUserGroups(userId) {
    const groupIds = this.userGroups.get(userId) || new Set();
    return Array.from(groupIds).map(groupId => {
      const group = this.activeGroups.get(groupId);
      if (!group) return null;
      return {
        ...group,
        participants: Array.from(group.participants || []), // Convert Set to Array for JSON serialization
        audioLevels: Object.fromEntries(group.audioLevels || new Map()), // Convert Map to Object
      };
    }).filter(Boolean);
  }

  // Get all active groups
  getAllGroups() {
    return Array.from(this.activeGroups.values()).map(group => ({
      ...group,
      participants: Array.from(group.participants || []), // Convert Set to Array for JSON serialization
      audioLevels: Object.fromEntries(group.audioLevels || new Map()), // Convert Map to Object
      hootState: this.serializeHootState(group.hootState),
    }));
  }

  serializeHootState(state) {
    if (!state) return null;
    return {
      isActive: state.isActive,
      startedBy: state.startedBy,
      startedAt: state.startedAt,
      lastActivity: state.lastActivity,
      listenerCount: state.listeners?.size || 0,
      persistentListenerCount: state.persistentListeners?.size || 0,
      activeSpeakers: Array.from(state.activeSpeakers || []),
      segments: state.segments,
    };
  }

  // Update group settings
  async updateGroup(groupId, updates) {
    try {
      const group = this.activeGroups.get(groupId);
      if (!group) {
        throw new Error('Group not found');
      }

      // Update group data
      Object.assign(group, updates);
      group.updatedAt = new Date();

      if (updates.hootConfig) {
        group.hootConfig = this.normalizeHootConfig(updates.hootConfig);
      }

      // Update database
      await updateGroupRecord(groupId, updates);

      logger.info(`Group ${groupId} updated`);
      return group;
    } catch (error) {
      logger.error('Failed to update group:', error);
      throw error;
    }
  }

  ensureBroadcastGroup(group) {
    if (!group) {
      throw new Error('Group not found');
    }
    if (group.callMode !== 'broadcast') {
      throw new Error('Group is not configured as a hoot/broadcast channel');
    }
    if (!group.hootState) {
      group.hootState = this.createInitialHootState();
    }
  }

  async startHoot(groupId, userId, options = {}) {
    const group = this.activeGroups.get(groupId);
    this.ensureBroadcastGroup(group);

    const hootState = group.hootState;
    const hootConfig = group.hootConfig || this.defaultHootConfig;

    if (hootState.activeSpeakers.size >= hootConfig.maxSpeakers && !hootState.activeSpeakers.has(userId)) {
      throw new Error('Maximum active speakers reached for this hoot');
    }

    hootState.activeSpeakers.add(userId);
    hootState.lastActivity = new Date();
    hootState.lastSpokenAt = new Date();

    if (!hootState.isActive) {
      hootState.isActive = true;
      hootState.startedBy = userId;
      hootState.startedAt = new Date();
      hootState.segments.push({
        startedAt: hootState.startedAt,
        startedBy: userId,
        options,
      });
    }

    logger.info(`User ${userId} started speaking on hoot ${groupId}`);
    return this.getHootStatus(groupId);
  }

  async stopHoot(groupId, userId, reason = 'ptt-release') {
    const group = this.activeGroups.get(groupId);
    this.ensureBroadcastGroup(group);

    const hootState = group.hootState;

    hootState.activeSpeakers.delete(userId);
    hootState.lastActivity = new Date();
    hootState.lastSpokenAt = new Date();

    if (hootState.activeSpeakers.size === 0) {
      hootState.isActive = false;
      if (hootState.segments.length > 0) {
        const lastSegment = hootState.segments[hootState.segments.length - 1];
        if (!lastSegment.endedAt) {
          lastSegment.endedAt = new Date();
          lastSegment.reason = reason;
        }
      }
      hootState.startedBy = null;
      hootState.startedAt = null;
    }

    logger.info(`User ${userId} stopped speaking on hoot ${groupId}`);
    return this.getHootStatus(groupId);
  }

  addHootListener(groupId, userId, { persistent = false } = {}) {
    const group = this.activeGroups.get(groupId);
    this.ensureBroadcastGroup(group);

    const hootState = group.hootState;
    const hootConfig = group.hootConfig || this.defaultHootConfig;

    if (!hootState.listeners.has(userId) && hootState.listeners.size >= hootConfig.maxListeners) {
      throw new Error('Maximum hoot listeners reached');
    }

    hootState.listeners.add(userId);
    if (persistent || hootConfig.persistentListen) {
      hootState.persistentListeners.add(userId);
    }

    logger.info(`User ${userId} joined hoot ${groupId} (persistent=${persistent})`);
    return this.getHootStatus(groupId);
  }

  removeHootListener(groupId, userId, { keepPersistent = false } = {}) {
    const group = this.activeGroups.get(groupId);
    this.ensureBroadcastGroup(group);

    const hootState = group.hootState;
    hootState.listeners.delete(userId);

    if (!keepPersistent) {
      hootState.persistentListeners.delete(userId);
    }

    logger.info(`User ${userId} left hoot ${groupId}`);
    return this.getHootStatus(groupId);
  }

  getHootStatus(groupId) {
    const group = this.activeGroups.get(groupId);
    if (!group || group.callMode !== 'broadcast') {
      return null;
    }

    const hootState = group.hootState || this.createInitialHootState();
    group.hootState = hootState;

    return {
      groupId,
      config: group.hootConfig || this.defaultHootConfig,
      state: this.serializeHootState(hootState),
    };
  }

  // Set group permissions
  setGroupPermissions(groupId, permissions) {
    this.groupPermissions.set(groupId, {
      canSpeak: permissions.canSpeak !== false,
      canMute: permissions.canMute !== false,
      canRecord: permissions.canRecord || false,
      canModerate: permissions.canModerate || false,
      canInvite: permissions.canInvite !== false,
      canKick: permissions.canKick || false,
    });
  }

  // Get group permissions
  getGroupPermissions(groupId) {
    return this.groupPermissions.get(groupId) || {
      canSpeak: true,
      canMute: true,
      canRecord: false,
      canModerate: false,
      canInvite: true,
      canKick: false,
    };
  }

  // Check if user has permission in group
  hasPermission(groupId, userId, permission) {
    const group = this.activeGroups.get(groupId);
    if (!group) return false;

    const permissions = this.getGroupPermissions(groupId);
    
    // Creator has all permissions
    if (group.createdBy === userId) {
      return true;
    }

    return permissions[permission] || false;
  }

  // Update user audio level
  updateAudioLevel(groupId, userId, level) {
    const group = this.activeGroups.get(groupId);
    if (!group) return;

    group.audioLevels.set(userId, level);
    group.lastActivity = new Date();

    // Update current speaker
    if (level > 0.01) {
      group.currentSpeaker = userId;
    } else if (group.currentSpeaker === userId) {
      group.currentSpeaker = null;
    }
  }

  // Get current speaker
  getCurrentSpeaker(groupId) {
    const group = this.activeGroups.get(groupId);
    return group?.currentSpeaker || null;
  }

  // Get group audio levels
  getGroupAudioLevels(groupId) {
    const group = this.activeGroups.get(groupId);
    if (!group) return {};

    const levels = {};
    for (const [userId, level] of group.audioLevels) {
      levels[userId] = level;
    }
    return levels;
  }

  // Mute user in group
  async muteUser(groupId, userId, mutedBy) {
    try {
      const group = this.activeGroups.get(groupId);
      if (!group) {
        throw new Error('Group not found');
      }

      // Check permissions
      if (!this.hasPermission(groupId, mutedBy, 'canMute')) {
        throw new Error('No permission to mute users');
      }

      // Update user mute status
      group.mutedUsers = group.mutedUsers || new Set();
      group.mutedUsers.add(userId);

      logger.info(`User ${userId} muted in group ${groupId} by ${mutedBy}`);
      return true;
    } catch (error) {
      logger.error('Failed to mute user:', error);
      throw error;
    }
  }

  // Unmute user in group
  async unmuteUser(groupId, userId, unmutedBy) {
    try {
      const group = this.activeGroups.get(groupId);
      if (!group) {
        throw new Error('Group not found');
      }

      // Check permissions
      if (!this.hasPermission(groupId, unmutedBy, 'canMute')) {
        throw new Error('No permission to unmute users');
      }

      // Update user mute status
      group.mutedUsers = group.mutedUsers || new Set();
      group.mutedUsers.delete(userId);

      logger.info(`User ${userId} unmuted in group ${groupId} by ${unmutedBy}`);
      return true;
    } catch (error) {
      logger.error('Failed to unmute user:', error);
      throw error;
    }
  }

  // Check if user is muted
  isUserMuted(groupId, userId) {
    const group = this.activeGroups.get(groupId);
    if (!group) return false;

    return group.mutedUsers?.has(userId) || false;
  }

  // Start group recording
  async startGroupRecording(groupId, startedBy) {
    try {
      const group = this.activeGroups.get(groupId);
      if (!group) {
        throw new Error('Group not found');
      }

      // Check permissions
      if (!this.hasPermission(groupId, startedBy, 'canRecord')) {
        throw new Error('No permission to start recording');
      }

      // Check if recording is allowed
      if (!group.allowRecording) {
        throw new Error('Recording not allowed in this group');
      }

      // Start recording
      const recording = await this.audioRecordingService.startRecording(
        `session_${groupId}_${Date.now()}`,
        groupId,
        startedBy,
        {
          groupName: group.name,
          groupType: group.type,
          participants: Array.from(group.participants),
          startedBy,
        }
      );

      group.recording = {
        id: recording.recordingId,
        isActive: true,
        startTime: recording.startTime,
        startedBy,
      };

      logger.info(`Recording started in group ${groupId} by ${startedBy}`);
      return recording;
    } catch (error) {
      logger.error('Failed to start group recording:', error);
      throw error;
    }
  }

  // Stop group recording
  async stopGroupRecording(groupId, stoppedBy) {
    try {
      const group = this.activeGroups.get(groupId);
      if (!group || !group.recording) {
        throw new Error('No active recording found');
      }

      // Check permissions
      if (!this.hasPermission(groupId, stoppedBy, 'canRecord')) {
        throw new Error('No permission to stop recording');
      }

      // Stop recording
      const result = await this.audioRecordingService.stopRecording(
        group.recording.id,
        'manual-stop'
      );

      group.recording.isActive = false;

      logger.info(`Recording stopped in group ${groupId} by ${stoppedBy}`);
      return result;
    } catch (error) {
      logger.error('Failed to stop group recording:', error);
      throw error;
    }
  }

  // Send broadcast message to group
  async sendBroadcast(groupId, message, senderId) {
    try {
      const group = this.activeGroups.get(groupId);
      if (!group) {
        throw new Error('Group not found');
      }

      const broadcast = {
        id: `broadcast_${Date.now()}`,
        message,
        senderId,
        timestamp: new Date(),
        groupId,
      };

      // Add to broadcast queue
      group.broadcastQueue.push(broadcast);

      // Keep only last 100 broadcasts
      if (group.broadcastQueue.length > 100) {
        group.broadcastQueue.shift();
      }

      logger.info(`Broadcast sent to group ${groupId} by ${senderId}`);
      return broadcast;
    } catch (error) {
      logger.error('Failed to send broadcast:', error);
      throw error;
    }
  }

  // Get group broadcasts
  getGroupBroadcasts(groupId, limit = 50) {
    const group = this.activeGroups.get(groupId);
    if (!group) return [];

    return group.broadcastQueue.slice(-limit);
  }

  // Get group statistics
  getGroupStats(groupId) {
    const group = this.activeGroups.get(groupId);
    if (!group) return null;
    const hootState = group.callMode === 'broadcast' ? this.serializeHootState(group.hootState) : null;

    return {
      id: group.id,
      name: group.name,
      callMode: group.callMode || 'conference',
      participantCount: group.participants.size,
      isActive: group.isActive,
      hasRecording: !!group.recording,
      currentSpeaker: group.currentSpeaker,
      lastActivity: group.lastActivity,
      broadcastCount: group.broadcastQueue.length,
      audioLevels: Object.fromEntries(group.audioLevels),
      hoot: hootState,
    };
  }

  // Get all group statistics
  getAllGroupStats() {
    const stats = [];
    for (const [groupId, group] of this.activeGroups) {
      stats.push(this.getGroupStats(groupId));
    }
    return stats;
  }

  // Clean up inactive groups
  cleanupInactiveGroups() {
    const now = new Date();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [groupId, group] of this.activeGroups) {
      const timeSinceActivity = now - group.lastActivity;
      
      if (timeSinceActivity > inactiveThreshold && group.participants.size === 0) {
        this.activeGroups.delete(groupId);
        this.groupPermissions.delete(groupId);
        logger.info(`Cleaned up inactive group: ${groupId}`);
      }
    }
  }

  // Initialize audio recording service
  setAudioRecordingService(audioRecordingService) {
    this.audioRecordingService = audioRecordingService;
  }
}

// Initialize the service
const groupService = new GroupService();

// Cleanup inactive groups every 5 minutes
setInterval(() => {
  groupService.cleanupInactiveGroups();
}, 5 * 60 * 1000);

// Add Matrix message methods to GroupService class
GroupService.prototype.sendMatrixMessage = async function(groupId, message, messageType = 'm.text') {
  try {
    const group = this.activeGroups.get(groupId);
    if (!group || !group.matrixRoomId) {
      throw new Error('Group or Matrix room not found');
    }

    if (!this.matrixService.config.enabled) {
      throw new Error('Matrix service not enabled');
    }

    const messageId = await this.matrixService.sendMessage(group.matrixRoomId, message, messageType);
    logger.info(`Matrix message sent to group ${groupId}: ${messageId}`);
    return messageId;
  } catch (error) {
    logger.error('Failed to send Matrix message:', error);
    throw error;
  }
};

GroupService.prototype.broadcastToMatrix = async function(groupId, message, senderId) {
  try {
    const group = this.activeGroups.get(groupId);
    if (!group || !group.matrixRoomId) {
      throw new Error('Group or Matrix room not found');
    }

    if (!this.matrixService.config.enabled) {
      throw new Error('Matrix service not enabled');
    }

    const broadcastMessage = `[BROADCAST] ${senderId}: ${message}`;
    const messageId = await this.matrixService.sendGroupBroadcast(groupId, broadcastMessage, senderId);
    logger.info(`Matrix broadcast sent to group ${groupId}: ${messageId}`);
    return messageId;
  } catch (error) {
    logger.error('Failed to send Matrix broadcast:', error);
    throw error;
  }
};

GroupService.prototype.getMatrixRoomInfo = async function(groupId) {
  try {
    const group = this.activeGroups.get(groupId);
    if (!group || !group.matrixRoomId) {
      throw new Error('Group or Matrix room not found');
    }

    if (!this.matrixService.config.enabled) {
      throw new Error('Matrix service not enabled');
    }

    const roomInfo = await this.matrixService.getRoomInfo(group.matrixRoomId);
    return roomInfo;
  } catch (error) {
    logger.error('Failed to get Matrix room info:', error);
    throw error;
  }
};

module.exports = {
  groupService,
  GroupService,
};
