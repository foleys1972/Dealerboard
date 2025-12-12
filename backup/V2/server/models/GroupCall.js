/**
 * Group Call Configuration Model
 * 
 * Supports two types of group calling:
 * 1. Hunt Mode: First to answer gets 1-2-1 call (race condition)
 * 2. Conference Mode: All who answer join a conference
 */

const mongoose = require('mongoose');

const GroupCallSchema = new mongoose.Schema({
  // Group identification
  groupId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  name: {
    type: String,
    required: true
  },
  
  description: {
    type: String,
    default: ''
  },
  
  // Group call behavior
  callMode: {
    type: String,
    enum: ['hunt', 'conference'],
    default: 'hunt',
    required: true
  },
  
  // Hunt mode: First answer drops to 1-2-1
  // Conference mode: All answers join conference
  
  // Hunt mode settings
  huntSettings: {
    strategy: {
      type: String,
      enum: ['simultaneous', 'sequential'],
      default: 'simultaneous'
    },
    ringTimeout: {
      type: Number,
      default: 30000, // 30 seconds
      min: 5000,
      max: 120000
    },
    cancelOthersOnAnswer: {
      type: Boolean,
      default: true // For hunt mode
    }
  },
  
  // Conference mode settings
  conferenceSettings: {
    maxParticipants: {
      type: Number,
      default: 50,
      min: 2,
      max: 100
    },
    autoRecord: {
      type: Boolean,
      default: true
    },
    waitForHost: {
      type: Boolean,
      default: false
    },
    muteOnJoin: {
      type: Boolean,
      default: false
    },
    // Instant intercom mode: no ringing, immediate connection
    instantConnect: {
      type: Boolean,
      default: true
    },
    // Drop to 1-to-1 with first responder, or keep full conference
    dropTo1to1: {
      type: Boolean,
      default: false
    }
  },
  
  // Members
  members: [{
    userId: {
      type: String,
      required: true
    },
    priority: {
      type: Number,
      default: 1 // For sequential hunt strategy
    },
    isHost: {
      type: Boolean,
      default: false // For conference mode
    }
  }],
  
  // Multicast IPTV integration
  iptvStream: {
    enabled: {
      type: Boolean,
      default: false
    },
    multicastAddress: {
      type: String,
      validate: {
        validator: function(v) {
          // Validate multicast IP (224.0.0.0 to 239.255.255.255)
          if (!v) return true;
          const parts = v.split(':')[0].split('.');
          if (parts.length !== 4) return false;
          const first = parseInt(parts[0]);
          return first >= 224 && first <= 239;
        },
        message: 'Invalid multicast IP address (must be 224.0.0.0 - 239.255.255.255)'
      }
    },
    port: {
      type: Number,
      min: 1024,
      max: 65535
    },
    codec: {
      type: String,
      enum: ['G.711', 'G.722', 'opus', 'pcm'],
      default: 'G.722'
    },
    ssrc: String, // Stream identifier
    description: String
  },
  
  // Metadata
  createdBy: {
    type: String,
    required: true
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Usage stats
  stats: {
    totalCalls: {
      type: Number,
      default: 0
    },
    lastUsed: Date,
    averageAnswerTime: Number
  }
});

// Update timestamp on save
GroupCallSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes
GroupCallSchema.index({ name: 'text', description: 'text' }); // For search
GroupCallSchema.index({ 'members.userId': 1 }); // For user lookups

module.exports = mongoose.model('GroupCall', GroupCallSchema);

