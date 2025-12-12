const express = require('express');
const os = require('os');
const router = express.Router();
const logger = require('../utils/logger');
const { groupService } = require('../services/groupService');
const { findUsers } = require('../services/databaseService');

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Admin stats service online',
    timestamp: new Date().toISOString(),
  });
});

// Stats endpoint
router.get('/stats', async (req, res) => {
  try {
    await groupService.initialize();

    const [users] = await Promise.all([
      findUsers({}),
    ]);

    const groups = groupService.getAllGroups();
    const broadcastGroups = groups.filter(group => (group.callMode || 'REMAIN_GROUP') === 'broadcast');
    const activeBroadcasts = broadcastGroups.filter(group => group.hoot?.state?.isActive).length;

    const stats = {
      totalUsers: users.length,
      activeUsers: users.filter(user => user.isActive).length,
      totalGroups: groups.length,
      broadcasts: broadcastGroups.length,
      activeBroadcasts,
      activeCalls: 0,
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        load: os.loadavg(),
        memory: process.memoryUsage(),
      },
    };

    const recentActivity = broadcastGroups.slice(0, 5).map(group => ({
      type: group.hoot?.state?.isActive ? 'broadcast_active' : 'broadcast_idle',
      title: group.name,
      description: group.hoot?.state?.isActive ? 'Hoot on air' : 'Idle',
      timestamp: group.hoot?.state?.lastSpokenAt || group.hoot?.state?.lastActivity || group.updatedAt || group.createdAt,
      color: group.hoot?.state?.isActive ? '#f97316' : '#6b7280',
    }));

    // Include lastUsed/lastSpoken info with groups summary for admin UI tables
    const groupsSummary = groups.map(g => ({
      id: g.id,
      name: g.name,
      callMode: g.callMode || 'REMAIN_GROUP',
      lastUsedOn: g.lastUsedOn || g.updatedAt || g.createdAt,
      lastSpokenOn: g.hoot?.state?.lastSpokenAt || null,
    }));

    res.json({
      success: true,
      stats,
      recentActivity,
      groups: groupsSummary,
    });
  } catch (error) {
    logger.error('Admin stats error:', error);
    res.status(500).json({ error: error.message || 'Failed to load admin stats' });
  }
});

// Also support root path for backward compatibility
router.get('/', async (req, res) => {
  try {
    await groupService.initialize();

    const [users] = await Promise.all([
      findUsers({}),
    ]);

    const groups = groupService.getAllGroups();
    const broadcastGroups = groups.filter(group => (group.callMode || 'REMAIN_GROUP') === 'broadcast');
    const activeBroadcasts = broadcastGroups.filter(group => group.hoot?.state?.isActive).length;

    const stats = {
      totalUsers: users.length,
      activeUsers: users.filter(user => user.isActive).length,
      totalGroups: groups.length,
      broadcasts: broadcastGroups.length,
      activeBroadcasts,
      activeCalls: 0,
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        load: os.loadavg(),
        memory: process.memoryUsage(),
      },
    };

    const recentActivity = broadcastGroups.slice(0, 5).map(group => ({
      type: group.hoot?.state?.isActive ? 'broadcast_active' : 'broadcast_idle',
      title: group.name,
      description: group.hoot?.state?.isActive ? 'Hoot on air' : 'Idle',
      timestamp: group.hoot?.state?.lastSpokenAt || group.hoot?.state?.lastActivity || group.updatedAt || group.createdAt,
      color: group.hoot?.state?.isActive ? '#f97316' : '#6b7280',
    }));

    // Include lastUsed/lastSpoken info with groups summary for admin UI tables
    const groupsSummary = groups.map(g => ({
      id: g.id,
      name: g.name,
      callMode: g.callMode || 'REMAIN_GROUP',
      lastUsedOn: g.lastUsedOn || g.updatedAt || g.createdAt,
      lastSpokenOn: g.hoot?.state?.lastSpokenAt || null,
    }));

    res.json({
      success: true,
      stats,
      recentActivity,
      groups: groupsSummary,
    });
  } catch (error) {
    logger.error('Admin stats error:', error);
    res.status(500).json({ error: error.message || 'Failed to load admin stats' });
  }
});

module.exports = router;

