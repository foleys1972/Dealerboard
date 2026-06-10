const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const logger = require('../../utils/logger');
const {
  resolveTargetUser,
  ensureCanConfigureUser,
  normalizeStringArray,
  normalizeBoolean,
  isBroadcastGroup,
  getUserByIdOrUsername,
  updateUser,
  findGroups,
} = require('./routeHelpers');
router.get('/broadcast-lines', authenticateToken, async (req, res) => {
  try {
    const user = await resolveTargetUser(req);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const authz = ensureCanConfigureUser(req, user);
    if (!authz.ok) {
      return res.status(authz.status).json({ error: authz.error });
    }

    const settings = user.settings || {};

    const allowedBroadcastGroupIds = normalizeStringArray(settings.intercomAllowedBroadcastGroups);
    const broadcastGroups = await findGroups({});
    const broadcastLookup = new Map(
      (broadcastGroups || [])
        .filter(isBroadcastGroup)
        .map(g => [g.id, g.name])
    );

    const allowedBroadcastGroups = allowedBroadcastGroupIds.map(id => ({
      id,
      name: broadcastLookup.get(id) || id
    }));
    const stored = Array.isArray(settings.intercomBroadcastLines)
      ? settings.intercomBroadcastLines
      : [];

    const slots = Array.from({ length: 8 }, (_, i) => {
      const index = i + 1;
      const found = stored.find(s => Number(s?.index) === index);
      return {
        index,
        groupId: found?.groupId || null,
        label: found?.label || null
      };
    });

    res.json({ success: true, slots });
  } catch (error) {
    logger.error('Failed to get broadcast line slots:', error);
    res.status(500).json({ error: 'Failed to get broadcast line slots', details: error.message });
  }
});

// Update broadcast line slots for intercom-only device (per-user, stored in users.settings)
router.put('/broadcast-lines', authenticateToken, async (req, res) => {
  try {
    const user = await resolveTargetUser(req);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const authz = ensureCanConfigureUser(req, user);
    if (!authz.ok) {
      return res.status(authz.status).json({ error: authz.error });
    }

    const { slots } = req.body;
    if (!Array.isArray(slots)) {
      return res.status(400).json({ error: 'slots must be an array' });
    }
    if (slots.length > 8) {
      return res.status(400).json({ error: 'Maximum of 8 broadcast line slots supported' });
    }

    const allowedBroadcastGroups = normalizeStringArray((user.settings || {}).intercomAllowedBroadcastGroups);

    const normalized = [];
    const seen = new Set();
    for (const s of slots) {
      const index = Number(s?.index);
      if (!Number.isInteger(index) || index < 1 || index > 8) {
        return res.status(400).json({ error: 'Each slot must have an integer index between 1 and 8' });
      }
      if (seen.has(index)) {
        return res.status(400).json({ error: `Duplicate slot index: ${index}` });
      }
      seen.add(index);

      const groupId = s?.groupId ? String(s.groupId) : null;
      const label = s?.label ? String(s.label) : null;

      if (groupId && allowedBroadcastGroups.length > 0 && !allowedBroadcastGroups.includes(groupId)) {
        return res.status(400).json({ error: `Broadcast group ${groupId} is not allowed for this user` });
      }

      // If slot is unassigned, keep it but null out values
      normalized.push({ index, groupId, label });
    }

    const existingSettings = user.settings || {};
    const updatedSettings = {
      ...existingSettings,
      intercomBroadcastLines: normalized,
      updatedAt: new Date().toISOString(),
    };

    await updateUser(user.id, { settings: updatedSettings });

    res.json({ success: true, slots: normalized });
  } catch (error) {
    logger.error('Failed to update broadcast line slots:', error);
    res.status(500).json({ error: 'Failed to update broadcast line slots', details: error.message });
  }
});

router.get('/available-broadcast-groups', authenticateToken, async (req, res) => {
  try {
    const groups = await findGroups({});
    const broadcastGroups = (groups || [])
      .filter(isBroadcastGroup)
      .map(g => ({ id: g.id, name: g.name, callMode: g.callMode }));
    res.json({ success: true, groups: broadcastGroups, count: broadcastGroups.length });
  } catch (error) {
    logger.error('Failed to list broadcast groups:', error);
    res.status(500).json({ error: 'Failed to list broadcast groups', details: error.message });
  }
});

router.get('/available-group-call-groups', authenticateToken, async (req, res) => {
  try {
    const groups = await findGroups({});
    const groupCallGroups = (groups || [])
      .filter(g => !isBroadcastGroup(g))
      .map(g => ({ id: g.id, name: g.name, callMode: g.callMode }));
    res.json({ success: true, groups: groupCallGroups, count: groupCallGroups.length });
  } catch (error) {
    logger.error('Failed to list group call groups:', error);
    res.status(500).json({ error: 'Failed to list group call groups', details: error.message });
  }
});

module.exports = router;
