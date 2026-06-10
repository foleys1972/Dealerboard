const express = require('express');
const router = express.Router();
const { groupService } = require('../../services/groupService');
const logger = require('../../utils/logger');
router.post('/:groupId/broadcast', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { message, senderId } = req.body;
    
    const broadcast = await groupService.sendBroadcast(groupId, message, senderId);
    
    res.json({
      success: true,
      broadcast,
      message: 'Broadcast sent successfully'
    });
  } catch (error) {
    logger.error('Failed to send broadcast:', error);
    res.status(500).json({ error: 'Failed to send broadcast' });
  }
});

// Get group broadcasts
router.get('/:groupId/broadcasts', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { limit = 50 } = req.query;
    
    const broadcasts = groupService.getGroupBroadcasts(groupId, parseInt(limit));
    
    res.json(broadcasts);
  } catch (error) {
    logger.error('Failed to get broadcasts:', error);
    res.status(500).json({ error: 'Failed to get broadcasts' });
  }
});

module.exports = router;
