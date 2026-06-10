const logger = require('../utils/logger');
const { getServerRole } = require('../utils/serverRole');
const { pool } = require('./databaseService');

/**
 * Subscriber Audio Routing Service
 * 
 * When multiple users on a subscriber server join a group call or broadcast,
 * this service establishes a single WebRTC connection to the publisher and
 * routes audio locally.
 */
class SubscriberAudioRoutingService {
  constructor(subscriberService) {
    this.subscriberService = subscriberService;
    this.activeGroupCalls = new Map(); // Map<groupId, GroupCallInfo>
    this.activeBroadcasts = new Map(); // Map<broadcastId, BroadcastInfo>
    this.localParticipants = new Map(); // Map<userId, ParticipantInfo>
    this.subscriberServerId = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Check if server is configured as subscriber
      const serverRole = await getServerRole();
      
      if (!serverRole.enableSubscriber) {
        logger.info('Subscriber capability disabled, skipping subscriber audio routing initialization');
        return;
      }

      this.subscriberServerId = serverRole.serverId;
      this.isInitialized = true;

      logger.info('Subscriber audio routing service initialized');
    } catch (error) {
      logger.error('Failed to initialize subscriber audio routing service:', error);
      throw error;
    }
  }

  /**
   * Handle user joining a group call
   * If this is the first user from this subscriber, establish connection to publisher
   * If other users are already in the call, add to local routing
   */
  async handleUserJoinGroupCall(userId, groupId, audioProducerId = null) {
    try {
      if (!this.isInitialized) {
        return; // Not a subscriber server
      }

      // Check if user is on this subscriber server
      const isLocalUser = await this.isLocalUser(userId);
      if (!isLocalUser) {
        return; // User is not on this subscriber
      }

      logger.info(`Local user ${userId} joining group call ${groupId}`);

      // Get or create group call info
      let groupCall = this.activeGroupCalls.get(groupId);
      
      if (!groupCall) {
        // First user from this subscriber joining - establish connection to publisher
        groupCall = await this.createGroupCallConnection(groupId);
        this.activeGroupCalls.set(groupId, groupCall);
      }

      // Add user to local participants
      const participantInfo = {
        userId,
        groupId,
        audioProducerId,
        joinedAt: new Date(),
        isActive: true
      };

      groupCall.localParticipants.set(userId, participantInfo);
      this.localParticipants.set(userId, participantInfo);

      // If this is the first participant, notify publisher
      if (groupCall.localParticipants.size === 1) {
        await this.notifyPublisherGroupCallJoin(groupId, userId);
      } else {
        // Additional participant - just update participant list
        await this.notifyPublisherGroupCallUpdate(groupId, Array.from(groupCall.localParticipants.keys()));
      }

      logger.info(`User ${userId} added to group call ${groupId} (${groupCall.localParticipants.size} local participants)`);
      
      return groupCall;
    } catch (error) {
      logger.error(`Failed to handle user join group call: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Handle user leaving a group call
   */
  async handleUserLeaveGroupCall(userId, groupId) {
    try {
      if (!this.isInitialized) {
        return;
      }

      const groupCall = this.activeGroupCalls.get(groupId);
      if (!groupCall) {
        return;
      }

      // Remove user from local participants
      groupCall.localParticipants.delete(userId);
      this.localParticipants.delete(userId);

      logger.info(`User ${userId} left group call ${groupId} (${groupCall.localParticipants.size} local participants remaining)`);

      // If no more local participants, close connection to publisher
      if (groupCall.localParticipants.size === 0) {
        await this.closeGroupCallConnection(groupId);
        this.activeGroupCalls.delete(groupId);
        await this.notifyPublisherGroupCallLeave(groupId);
      } else {
        // Update participant list
        await this.notifyPublisherGroupCallUpdate(groupId, Array.from(groupCall.localParticipants.keys()));
      }
    } catch (error) {
      logger.error(`Failed to handle user leave group call: ${error.message}`, error);
    }
  }

  /**
   * Handle user joining a broadcast
   */
  async handleUserJoinBroadcast(userId, broadcastId) {
    try {
      if (!this.isInitialized) {
        return;
      }

      const isLocalUser = await this.isLocalUser(userId);
      if (!isLocalUser) {
        return;
      }

      logger.info(`Local user ${userId} joining broadcast ${broadcastId}`);

      let broadcast = this.activeBroadcasts.get(broadcastId);
      
      if (!broadcast) {
        // First user from this subscriber joining - establish connection to publisher
        broadcast = await this.createBroadcastConnection(broadcastId);
        this.activeBroadcasts.set(broadcastId, broadcast);
      }

      broadcast.localListeners.add(userId);

      // If this is the first listener, notify publisher
      if (broadcast.localListeners.size === 1) {
        await this.notifyPublisherBroadcastJoin(broadcastId, userId);
      }

      logger.info(`User ${userId} added to broadcast ${broadcastId} (${broadcast.localListeners.size} local listeners)`);
      
      return broadcast;
    } catch (error) {
      logger.error(`Failed to handle user join broadcast: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Handle user leaving a broadcast
   */
  async handleUserLeaveBroadcast(userId, broadcastId) {
    try {
      if (!this.isInitialized) {
        return;
      }

      const broadcast = this.activeBroadcasts.get(broadcastId);
      if (!broadcast) {
        return;
      }

      broadcast.localListeners.delete(userId);

      logger.info(`User ${userId} left broadcast ${broadcastId} (${broadcast.localListeners.size} local listeners remaining)`);

      if (broadcast.localListeners.size === 0) {
        await this.closeBroadcastConnection(broadcastId);
        this.activeBroadcasts.delete(broadcastId);
        await this.notifyPublisherBroadcastLeave(broadcastId);
      }
    } catch (error) {
      logger.error(`Failed to handle user leave broadcast: ${error.message}`, error);
    }
  }

  /**
   * Create group call connection to publisher
   */
  async createGroupCallConnection(groupId) {
    try {
      const groupCall = {
        groupId,
        subscriberServerId: this.subscriberServerId,
        localParticipants: new Map(),
        publisherConnectionId: `group-${groupId}-${Date.now()}`,
        audioProducerId: null, // Will be set when WebRTC producer is created
        audioConsumerId: null, // Will be set when WebRTC consumer is created
        createdAt: new Date(),
        isActive: true
      };

      logger.info(`Created group call connection for ${groupId}`);
      return groupCall;
    } catch (error) {
      logger.error(`Failed to create group call connection: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Create broadcast connection to publisher
   */
  async createBroadcastConnection(broadcastId) {
    try {
      const broadcast = {
        broadcastId,
        subscriberServerId: this.subscriberServerId,
        localListeners: new Set(),
        publisherConnectionId: `broadcast-${broadcastId}-${Date.now()}`,
        audioConsumerId: null,
        createdAt: new Date(),
        isActive: true
      };

      logger.info(`Created broadcast connection for ${broadcastId}`);
      return broadcast;
    } catch (error) {
      logger.error(`Failed to create broadcast connection: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Close group call connection
   */
  async closeGroupCallConnection(groupId) {
    try {
      const groupCall = this.activeGroupCalls.get(groupId);
      if (!groupCall) {
        return;
      }

      // TODO: Close WebRTC connection if exists
      groupCall.isActive = false;

      logger.info(`Closed group call connection for ${groupId}`);
    } catch (error) {
      logger.error(`Failed to close group call connection: ${error.message}`, error);
    }
  }

  /**
   * Close broadcast connection
   */
  async closeBroadcastConnection(broadcastId) {
    try {
      const broadcast = this.activeBroadcasts.get(broadcastId);
      if (!broadcast) {
        return;
      }

      broadcast.isActive = false;

      logger.info(`Closed broadcast connection for ${broadcastId}`);
    } catch (error) {
      logger.error(`Failed to close broadcast connection: ${error.message}`, error);
    }
  }

  /**
   * Check if user is on this subscriber server
   */
  async isLocalUser(userId) {
    try {
      // Check if user is assigned to this subscriber's location
      const result = await pool.query(
        `SELECT u.id, l.subscriber_id 
         FROM users u
         LEFT JOIN locations l ON u.location_id = l.id
         WHERE u.id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      const user = result.rows[0];
      
      // If user has a location with a subscriber_id, check if it matches this server
      if (user.subscriber_id) {
        // Get this server's subscriber record
        const serverRole = await getServerRole();
        const subscriberResult = await pool.query(
          `SELECT id FROM subscribers WHERE server_id = $1`,
          [serverRole.serverId]
        );

        if (subscriberResult.rows.length > 0) {
          return subscriberResult.rows[0].id === user.subscriber_id;
        }
      }

      // For now, assume all users on subscriber server are local
      // This can be refined based on location assignment
      return true;
    } catch (error) {
      logger.error(`Failed to check if user is local: ${error.message}`, error);
      return false;
    }
  }

  /**
   * Notify publisher that subscriber users are joining a group call
   */
  async notifyPublisherGroupCallJoin(groupId, userId) {
    try {
      if (!this.subscriberService || !this.subscriberService.isConnected) {
        logger.warn('Cannot notify publisher - subscriber service not connected');
        return;
      }

      const message = {
        type: 'group-call-join',
        groupId,
        subscriberServerId: this.subscriberServerId,
        userId,
        timestamp: Date.now()
      };

      this.subscriberService.sendMessage(message);
      logger.info(`Notified publisher of group call join: ${groupId}`);
    } catch (error) {
      logger.error(`Failed to notify publisher of group call join: ${error.message}`, error);
    }
  }

  /**
   * Notify publisher of group call participant update
   */
  async notifyPublisherGroupCallUpdate(groupId, participantIds) {
    try {
      if (!this.subscriberService || !this.subscriberService.isConnected) {
        return;
      }

      const message = {
        type: 'group-call-update',
        groupId,
        subscriberServerId: this.subscriberServerId,
        participantIds,
        timestamp: Date.now()
      };

      this.subscriberService.sendMessage(message);
    } catch (error) {
      logger.error(`Failed to notify publisher of group call update: ${error.message}`, error);
    }
  }

  /**
   * Notify publisher that subscriber users are leaving a group call
   */
  async notifyPublisherGroupCallLeave(groupId) {
    try {
      if (!this.subscriberService || !this.subscriberService.isConnected) {
        return;
      }

      const message = {
        type: 'group-call-leave',
        groupId,
        subscriberServerId: this.subscriberServerId,
        timestamp: Date.now()
      };

      this.subscriberService.sendMessage(message);
      logger.info(`Notified publisher of group call leave: ${groupId}`);
    } catch (error) {
      logger.error(`Failed to notify publisher of group call leave: ${error.message}`, error);
    }
  }

  /**
   * Notify publisher that subscriber users are joining a broadcast
   */
  async notifyPublisherBroadcastJoin(broadcastId, userId) {
    try {
      if (!this.subscriberService || !this.subscriberService.isConnected) {
        return;
      }

      const message = {
        type: 'broadcast-join',
        broadcastId,
        subscriberServerId: this.subscriberServerId,
        userId,
        timestamp: Date.now()
      };

      this.subscriberService.sendMessage(message);
      logger.info(`Notified publisher of broadcast join: ${broadcastId}`);
    } catch (error) {
      logger.error(`Failed to notify publisher of broadcast join: ${error.message}`, error);
    }
  }

  /**
   * Notify publisher that subscriber users are leaving a broadcast
   */
  async notifyPublisherBroadcastLeave(broadcastId) {
    try {
      if (!this.subscriberService || !this.subscriberService.isConnected) {
        return;
      }

      const message = {
        type: 'broadcast-leave',
        broadcastId,
        subscriberServerId: this.subscriberServerId,
        timestamp: Date.now()
      };

      this.subscriberService.sendMessage(message);
      logger.info(`Notified publisher of broadcast leave: ${broadcastId}`);
    } catch (error) {
      logger.error(`Failed to notify publisher of broadcast leave: ${error.message}`, error);
    }
  }

  /**
   * Handle audio data received from publisher for a group call
   * This audio should be distributed to all local participants
   */
  handleGroupCallAudioFromPublisher(message) {
    try {
      const { groupId, audioData } = message;
      const groupCall = this.activeGroupCalls.get(groupId);
      
      if (!groupCall || !groupCall.isActive) {
        return;
      }

      // TODO: Route audio to all local participants
      // This will involve:
      // 1. Decode/process audio data if needed
      // 2. Distribute to all local participants' audio consumers
      // 3. Handle audio mixing if multiple speakers

      logger.debug(`Received audio for group call ${groupId}, routing to ${groupCall.localParticipants.size} local participants`);
    } catch (error) {
      logger.error(`Failed to handle group call audio from publisher: ${error.message}`, error);
    }
  }

  /**
   * Handle audio data received from publisher for a broadcast
   */
  handleBroadcastAudioFromPublisher(message) {
    try {
      const { broadcastId, audioData } = message;
      const broadcast = this.activeBroadcasts.get(broadcastId);
      
      if (!broadcast || !broadcast.isActive) {
        return;
      }

      // TODO: Route audio to all local listeners
      logger.debug(`Received audio for broadcast ${broadcastId}, routing to ${broadcast.localListeners.size} local listeners`);
    } catch (error) {
      logger.error(`Failed to handle broadcast audio from publisher: ${error.message}`, error);
    }
  }

  /**
   * Handle group call update from publisher
   */
  handleGroupCallUpdateFromPublisher(message) {
    try {
      const { groupId, event, participantIds } = message;
      const groupCall = this.activeGroupCalls.get(groupId);
      
      if (!groupCall) {
        return;
      }

      logger.debug(`Group call update: ${groupId} - ${event}`);
      
      // Handle different event types
      switch (event) {
        case 'participant-joined':
          // Participant from another server joined
          break;
        case 'participant-left':
          // Participant from another server left
          break;
        case 'call-ended':
          // Call ended, cleanup
          this.closeGroupCallConnection(groupId);
          this.activeGroupCalls.delete(groupId);
          break;
        default:
          logger.debug(`Unknown group call event: ${event}`);
      }
    } catch (error) {
      logger.error(`Failed to handle group call update from publisher: ${error.message}`, error);
    }
  }

  /**
   * Collect audio from local participants and send to publisher
   * This mixes all local participant audio into a single stream
   */
  async collectAndSendLocalAudio(groupId, audioData) {
    try {
      const groupCall = this.activeGroupCalls.get(groupId);
      if (!groupCall || !groupCall.isActive) {
        return;
      }

      // TODO: Mix audio from all local participants
      // This will involve:
      // 1. Collect audio from all local participants' producers
      // 2. Mix/combine into single audio stream
      // 3. Send to publisher

      const message = {
        type: 'group-call-audio',
        groupId,
        subscriberServerId: this.subscriberServerId,
        audioData, // Mixed audio from all local participants
        participantIds: Array.from(groupCall.localParticipants.keys()),
        timestamp: Date.now()
      };

      this.subscriberService.sendMessage(message);
    } catch (error) {
      logger.error(`Failed to collect and send local audio: ${error.message}`, error);
    }
  }

  /**
   * Get active group calls
   */
  getActiveGroupCalls() {
    return Array.from(this.activeGroupCalls.values()).map(call => ({
      groupId: call.groupId,
      participantCount: call.localParticipants.size,
      participantIds: Array.from(call.localParticipants.keys()),
      createdAt: call.createdAt
    }));
  }

  /**
   * Get active broadcasts
   */
  getActiveBroadcasts() {
    return Array.from(this.activeBroadcasts.values()).map(broadcast => ({
      broadcastId: broadcast.broadcastId,
      listenerCount: broadcast.localListeners.size,
      listenerIds: Array.from(broadcast.localListeners),
      createdAt: broadcast.createdAt
    }));
  }

  /**
   * Cleanup service
   */
  async cleanup() {
    try {
      logger.info('Cleaning up subscriber audio routing service...');

      // Close all group call connections
      for (const [groupId] of this.activeGroupCalls) {
        await this.closeGroupCallConnection(groupId);
      }

      // Close all broadcast connections
      for (const [broadcastId] of this.activeBroadcasts) {
        await this.closeBroadcastConnection(broadcastId);
      }

      this.activeGroupCalls.clear();
      this.activeBroadcasts.clear();
      this.localParticipants.clear();

      logger.info('Subscriber audio routing service cleanup completed');
    } catch (error) {
      logger.error('Failed to cleanup subscriber audio routing service:', error);
    }
  }
}

module.exports = SubscriberAudioRoutingService;

