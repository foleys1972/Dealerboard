/**
 * User Model
 * Represents system users (traders, admins, etc.)
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  
  password: {
    type: String,
    required: true
  },
  
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  
  // Role-based access control
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  
  // Personal information
  name: {
    type: String,
    required: true
  },
  
  extension: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // SIP URI for calling (e.g., sip:john.smith@trading.company.com)
  sipUri: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  
  // Employee ID from HR system
  employeeId: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  
  department: String,
  
  // Status and presence
  status: {
    type: String,
    enum: ['available', 'busy', 'away', 'dnd', 'offline'],
    default: 'offline'
  },
  
  statusMessage: String,
  
  // Settings
  settings: {
    dnd: {
      type: Boolean,
      default: false
    },
    callForward: {
      enabled: {
        type: Boolean,
        default: false
      },
      // Forward to another user (by userId, sipUri, or employeeId)
      forwardToUserId: String,
      forwardToSipUri: String,
      forwardToEmployeeId: String,
      condition: {
        type: String,
        enum: ['immediate', 'busy', 'no-answer'],
        default: 'immediate'
      }
    },
    // Block incoming calls when already in a call
    blockCallsWhenBusy: {
      type: Boolean,
      default: false
    },
    // Allow multiple simultaneous calls
    allowMultipleCalls: {
      type: Boolean,
      default: true
    },
    // Maximum simultaneous calls (if allowMultipleCalls is true)
    maxSimultaneousCalls: {
      type: Number,
      default: 3,
      min: 1,
      max: 10
    },
    notifications: {
      sound: {
        type: Boolean,
        default: true
      },
      desktop: {
        type: Boolean,
        default: true
      }
    },
    audio: {
      microphoneId: String,
      speakerId: String,
      echoCancellation: {
        type: Boolean,
        default: true
      },
      noiseSuppression: {
        type: Boolean,
        default: true
      },
      // Instant intercom mode
      intercomMode: {
        type: String,
        enum: ['always-on', 'push-to-talk'],
        default: 'always-on'
      },
      // Auto-disconnect after silence
      autoDisconnectSeconds: {
        type: Number,
        default: 10
      }
    },
    video: {
      cameraId: String,
      resolution: {
        type: String,
        enum: ['480p', '720p', '1080p'],
        default: '720p'
      },
      frameRate: {
        type: Number,
        default: 30
      }
    }
  },
  
  // WebRTC capabilities
  capabilities: {
    audio: {
      type: Boolean,
      default: true
    },
    video: {
      type: Boolean,
      default: true
    },
    screenShare: {
      type: Boolean,
      default: true
    }
  },
  
  // Activity tracking
  lastLogin: Date,
  lastActive: Date,
  
  // Account status
  isActive: {
    type: Boolean,
    default: true
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update timestamp
UserSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
UserSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// Indexes
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ extension: 1 });
UserSchema.index({ status: 1 });

// Export the model, avoiding the "OverwriteModelError" if already compiled
module.exports = mongoose.models.User || mongoose.model('User', UserSchema);

