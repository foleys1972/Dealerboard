/**
 * User Favorites Model
 * 
 * Allows users to save favorite contacts and groups for quick access
 */

const mongoose = require('mongoose');

const UserFavoritesSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Favorite direct contacts
  favoriteContacts: [{
    contactId: {
      type: String,
      required: true
    },
    nickname: String, // Optional custom name
    order: {
      type: Number,
      default: 0
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Favorite groups
  favoriteGroups: [{
    groupId: {
      type: String,
      required: true
    },
    nickname: String,
    order: {
      type: Number,
      default: 0
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Favorite IPTV streams
  favoriteStreams: [{
    streamId: String,
    name: String,
    multicastAddress: String,
    port: Number,
    order: {
      type: Number,
      default: 0
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Recent calls history (for quick redial)
  recentCalls: [{
    type: {
      type: String,
      enum: ['direct', 'hunt', 'conference', 'stream']
    },
    targetId: String,
    targetName: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    duration: Number // seconds
  }],
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Limit recent calls to last 50
UserFavoritesSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  if (this.recentCalls && this.recentCalls.length > 50) {
    this.recentCalls = this.recentCalls
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);
  }
  
  next();
});

module.exports = mongoose.model('UserFavorites', UserFavoritesSchema);

