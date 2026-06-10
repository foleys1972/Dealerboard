const express = require('express');
const router = express.Router();
const { groupService } = require('../../services/groupService');
const logger = require('../../utils/logger');
router.get('/:groupId/hoot/status', async (req, res) => {
  try {
    const status = groupService.getHootStatus(req.params.groupId);
    if (!status) {
      return res.status(404).json({ error: 'Hoot channel not found' });
    }

    res.json({
      success: true,
      hoot: status,
    });
  } catch (error) {
    logger.error('Failed to get hoot status:', error);
    res.status(500).json({ error: error.message || 'Failed to get hoot status' });
  }
});

router.post('/:groupId/hoot/start', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, options = {} } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required to start hoot' });
    }

    const status = await groupService.startHoot(groupId, userId, options);
    res.json({
      success: true,
      hoot: status,
    });
  } catch (error) {
    logger.error('Failed to start hoot:', error);
    res.status(500).json({ error: error.message || 'Failed to start hoot' });
  }
});

router.post('/:groupId/hoot/stop', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, reason } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required to stop hoot' });
    }

    const status = await groupService.stopHoot(groupId, userId, reason);
    res.json({
      success: true,
      hoot: status,
    });
  } catch (error) {
    logger.error('Failed to stop hoot:', error);
    res.status(500).json({ error: error.message || 'Failed to stop hoot' });
  }
});

router.post('/:groupId/hoot/listen', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, persistent = false } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required to join hoot' });
    }

    const status = groupService.addHootListener(groupId, userId, { persistent });
    res.json({
      success: true,
      hoot: status,
    });
  } catch (error) {
    logger.error('Failed to join hoot:', error);
    res.status(500).json({ error: error.message || 'Failed to join hoot' });
  }
});

router.delete('/:groupId/hoot/listen/:userId', async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const { keepPersistent = false } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required to leave hoot' });
    }

    const status = groupService.removeHootListener(groupId, userId, { keepPersistent: keepPersistent === 'true' });
    res.json({
      success: true,
      hoot: status,
    });
  } catch (error) {
    logger.error('Failed to leave hoot:', error);
    res.status(500).json({ error: error.message || 'Failed to leave hoot' });
  }
});

module.exports = router;
