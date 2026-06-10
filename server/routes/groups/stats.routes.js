const express = require('express');
const router = express.Router();
const { groupService } = require('../../services/groupService');
const { audioRoutingService } = require('../../services/audioRoutingService');
const logger = require('../../utils/logger');

router.get('/stats/all', async (req, res) => {
  try {
    const stats = groupService.getAllGroupStats();
    const audioStats = audioRoutingService.getAllAudioRoutingStats();

    res.json({
      groups: stats,
      audioRouting: audioStats,
    });
  } catch (error) {
    logger.error('Failed to get all group stats:', error);
    res.status(500).json({ error: 'Failed to get group stats' });
  }
});

router.get('/:groupId/stats', async (req, res) => {
  try {
    const { groupId } = req.params;
    const stats = groupService.getGroupStats(groupId);

    if (!stats) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json(stats);
  } catch (error) {
    logger.error('Failed to get group stats:', error);
    res.status(500).json({ error: 'Failed to get group stats' });
  }
});

module.exports = router;
