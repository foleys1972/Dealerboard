/**
 * Call Log Model
 * Records all instant intercom connections for compliance and auditing
 */

const mongoose = require('mongoose');

const CallLogSchema = new mongoose.Schema({
  // Call identification
  callId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Call type
  type: {
    type: String,
    enum: ['instant-intercom', 'traditional-call', 'conference', 'broadcast'],
    default: 'instant-intercom',
    required: true
  },
  
  // Call initiator
  callerId: {
    type: String,
    required: true,
    index: true
  },
  
  callerName: String,
  
  // Participants
  participants: [{
    userId: String,
    userName: String,
    joinedAt: Date,
    leftAt: Date,
    duration: Number // milliseconds
  }],
  
  // Group call info
  isGroupCall: {
    type: Boolean,
    default: false
  },
  
  groupId: {
    type: String,
    index: true
  },
  
  groupName: String,
  
  // Timing
  startTime: {
    type: Date,
    required: true,
    index: true
  },
  
  endTime: {
    type: Date
  },
  
  duration: {
    type: Number, // milliseconds
    index: true
  },
  
  // Disconnect reason
  disconnectReason: {
    type: String,
    enum: [
      'user-disconnect',
      'caller-disconnect',
      'silence-timeout',
      'all-rejected',
      'network-error',
      'admin-override',
      'system-shutdown'
    ]
  },
  
  // Audio mode
  intercomMode: {
    type: String,
    enum: ['always-on', 'push-to-talk'],
    default: 'always-on'
  },
  
  // Quality metrics
  audioMetrics: {
    averageLevel: Number,
    peakLevel: Number,
    silenceDuration: Number, // milliseconds
    transmissionQuality: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor']
    }
  },
  
  // Additional data
  metadata: {
    userAgent: String,
    ipAddress: String,
    deviceType: String,
    browser: String
  },
  
  // Compliance
  recorded: {
    type: Boolean,
    default: false
  },
  
  recordingPath: String,
  
  // Audit trail
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Indexes for efficient queries
CallLogSchema.index({ callerId: 1, startTime: -1 });
CallLogSchema.index({ groupId: 1, startTime: -1 });
CallLogSchema.index({ type: 1, startTime: -1 });
CallLogSchema.index({ disconnectReason: 1 });
CallLogSchema.index({ 'participants.userId': 1 });

// Virtual for formatted duration
CallLogSchema.virtual('durationFormatted').get(function() {
  if (!this.duration) return '0s';
  const seconds = Math.floor(this.duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 
    ? `${minutes}m ${remainingSeconds}s` 
    : `${remainingSeconds}s`;
});

// Static method to create call log
CallLogSchema.statics.logCall = async function(callData) {
  try {
    const log = new this(callData);
    await log.save();
    return log;
  } catch (error) {
    console.error('Failed to log call:', error);
    throw error;
  }
};

// Static method to get user call history
CallLogSchema.statics.getUserCallHistory = async function(userId, options = {}) {
  const {
    limit = 50,
    skip = 0,
    startDate,
    endDate
  } = options;
  
  const query = {
    $or: [
      { callerId: userId },
      { 'participants.userId': userId }
    ]
  };
  
  if (startDate || endDate) {
    query.startTime = {};
    if (startDate) query.startTime.$gte = new Date(startDate);
    if (endDate) query.startTime.$lte = new Date(endDate);
  }
  
  return this.find(query)
    .sort({ startTime: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

// Static method to get group call history
CallLogSchema.statics.getGroupCallHistory = async function(groupId, options = {}) {
  const {
    limit = 50,
    skip = 0,
    startDate,
    endDate
  } = options;
  
  const query = { groupId };
  
  if (startDate || endDate) {
    query.startTime = {};
    if (startDate) query.startTime.$gte = new Date(startDate);
    if (endDate) query.startTime.$lte = new Date(endDate);
  }
  
  return this.find(query)
    .sort({ startTime: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

// Static method to get call statistics
CallLogSchema.statics.getCallStats = async function(options = {}) {
  const {
    userId,
    groupId,
    startDate,
    endDate
  } = options;
  
  const match = {};
  
  if (userId) {
    match.$or = [
      { callerId: userId },
      { 'participants.userId': userId }
    ];
  }
  
  if (groupId) {
    match.groupId = groupId;
  }
  
  if (startDate || endDate) {
    match.startTime = {};
    if (startDate) match.startTime.$gte = new Date(startDate);
    if (endDate) match.startTime.$lte = new Date(endDate);
  }
  
  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalCalls: { $sum: 1 },
        averageDuration: { $avg: '$duration' },
        totalDuration: { $sum: '$duration' },
        callsByType: {
          $push: '$type'
        },
        callsByReason: {
          $push: '$disconnectReason'
        }
      }
    }
  ]);
  
  return stats[0] || {
    totalCalls: 0,
    averageDuration: 0,
    totalDuration: 0,
    callsByType: [],
    callsByReason: []
  };
};

// Export model
module.exports = mongoose.models.CallLog || mongoose.model('CallLog', CallLogSchema);

