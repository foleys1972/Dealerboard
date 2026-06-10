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
router.get('/config', authenticateToken, async (req, res) => {
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

    const storedBroadcast = Array.isArray(settings.intercomBroadcastLines)
      ? settings.intercomBroadcastLines
      : [];

    const broadcastSlots = Array.from({ length: 8 }, (_, i) => {
      const index = i + 1;
      const found = storedBroadcast.find(s => Number(s?.index) === index);
      return {
        index,
        groupId: found?.groupId || null,
        label: found?.label || null
      };
    });

    const storedGroupCalls = Array.isArray(settings.intercomGroupCallSlots)
      ? settings.intercomGroupCallSlots
      : [];

    const groupCallSlots = Array.from({ length: 10 }, (_, i) => {
      const index = i + 1;
      const found = storedGroupCalls.find(s => Number(s?.index) === index);
      return {
        index,
        groupId: found?.groupId || null,
        label: found?.label || null
      };
    });

    res.json({
      success: true,
      userId: user.id,
      intercomEnabled: settings.intercomEnabled !== undefined ? Boolean(settings.intercomEnabled) : true,
      allowedBroadcastGroups,
      broadcastSlots,
      groupCallSlots
    });
  } catch (error) {
    logger.error('Failed to get intercom config:', error);
    res.status(500).json({ error: 'Failed to get intercom config', details: error.message });
  }
});

router.put('/config', authenticateToken, async (req, res) => {
  try {
    const user = await resolveTargetUser(req);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const authz = ensureCanConfigureUser(req, user);
    if (!authz.ok) {
      return res.status(authz.status).json({ error: authz.error });
    }

    const { intercomEnabled, allowedBroadcastGroupIds, broadcastSlots, groupCallSlots } = req.body;

    const existingSettings = user.settings || {};
    const updatedSettings = { ...existingSettings };

    if (intercomEnabled !== undefined) {
      updatedSettings.intercomEnabled = normalizeBoolean(intercomEnabled, true);
    }

    if (allowedBroadcastGroupIds !== undefined) {
      updatedSettings.intercomAllowedBroadcastGroups = normalizeStringArray(allowedBroadcastGroupIds);
    }

    const effectiveAllowedBroadcastGroups = normalizeStringArray(updatedSettings.intercomAllowedBroadcastGroups);

    if (broadcastSlots !== undefined) {
      if (!Array.isArray(broadcastSlots)) {
        return res.status(400).json({ error: 'broadcastSlots must be an array' });
      }
      if (broadcastSlots.length > 8) {
        return res.status(400).json({ error: 'Maximum of 8 broadcast slots supported' });
      }

      const normalized = [];
      const seen = new Set();
      for (const s of broadcastSlots) {
        const index = Number(s?.index);
        if (!Number.isInteger(index) || index < 1 || index > 8) {
          return res.status(400).json({ error: 'Each broadcast slot must have an integer index between 1 and 8' });
        }
        if (seen.has(index)) {
          return res.status(400).json({ error: `Duplicate broadcast slot index: ${index}` });
        }
        seen.add(index);
        const groupId = s?.groupId ? String(s.groupId) : null;
        const label = s?.label ? String(s.label) : null;

        if (groupId && effectiveAllowedBroadcastGroups.length > 0 && !effectiveAllowedBroadcastGroups.includes(groupId)) {
          return res.status(400).json({ error: `Broadcast group ${groupId} is not allowed for this user` });
        }
        normalized.push({ index, groupId, label });
      }
      updatedSettings.intercomBroadcastLines = normalized;
    }

    if (groupCallSlots !== undefined) {
      if (!Array.isArray(groupCallSlots)) {
        return res.status(400).json({ error: 'groupCallSlots must be an array' });
      }
      if (groupCallSlots.length > 10) {
        return res.status(400).json({ error: 'Maximum of 10 group call slots supported' });
      }

      const normalized = [];
      const seen = new Set();
      for (const s of groupCallSlots) {
        const index = Number(s?.index);
        if (!Number.isInteger(index) || index < 1 || index > 10) {
          return res.status(400).json({ error: 'Each group call slot must have an integer index between 1 and 10' });
        }
        if (seen.has(index)) {
          return res.status(400).json({ error: `Duplicate group call slot index: ${index}` });
        }
        seen.add(index);
        const groupId = s?.groupId ? String(s.groupId) : null;
        const label = s?.label ? String(s.label) : null;
        normalized.push({ index, groupId, label });
      }
      updatedSettings.intercomGroupCallSlots = normalized;
    }

    updatedSettings.updatedAt = new Date().toISOString();

    await updateUser(user.id, { settings: updatedSettings });

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update intercom config:', error);
    res.status(500).json({ error: 'Failed to update intercom config', details: error.message });
  }
});

module.exports = router;
