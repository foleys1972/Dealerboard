const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { setUserPublicFlag, getUserByIdOrUsername } = require('../../services/databaseService');
const logger = require('../../utils/logger');
const { requireTenantAdmin, requireTenantContext } = require('./routeHelpers');

router.patch('/users/:userId/public', authenticateToken, requireTenantAdmin, requireTenantContext, async (req, res) => {
  try {
    const tenantId = req.user.tid;
    const { userId } = req.params;
    const { isPublic } = req.body || {};

    if (typeof isPublic !== 'boolean') {
      return res.status(400).json({ error: 'isPublic must be a boolean' });
    }

    const user = await getUserByIdOrUsername(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Cannot update users outside your tenant' });
    }

    const updated = await setUserPublicFlag(userId, isPublic);

    return res.json({
      success: true,
      user: {
        id: updated.username || updated.id,
        username: updated.username,
        isPublic: updated.isPublic,
        tenantId: updated.tenantId,
      },
    });
  } catch (error) {
    logger.error('Failed to update user visibility:', error);
    return res.status(500).json({ error: 'Failed to update user visibility' });
  }
});

module.exports = router;
