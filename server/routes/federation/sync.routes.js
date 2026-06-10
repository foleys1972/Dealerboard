const express = require('express');
const router = express.Router();
const { federationService } = require('../../services/federationService');
const logger = require('../../utils/logger');
router.post('/sync/group', async (req, res) => {
  try {
    const { groupId, action, groupData } = req.body;
    
    if (!groupId || !action) {
      return res.status(400).json({ error: 'Group ID and action are required' });
    }
    
    const results = await federationService.syncGroup(groupId, action, groupData);
    
    res.json({
      success: true,
      message: 'Group sync initiated',
      results
    });
  } catch (error) {
    logger.error('Failed to sync group:', error);
    res.status(500).json({ error: 'Failed to sync group' });
  }
});

// Sync user with federation peers
router.post('/sync/user', async (req, res) => {
  try {
    const { userId, action, userData } = req.body;
    
    if (!userId || !action) {
      return res.status(400).json({ error: 'User ID and action are required' });
    }
    
    const results = await federationService.syncUser(userId, action, userData);
    
    res.json({
      success: true,
      message: 'User sync initiated',
      results
    });
  } catch (error) {
    logger.error('Failed to sync user:', error);
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

// Sync audio route with federation peers
router.post('/sync/audio-route', async (req, res) => {
  try {
    const { routeId, action, routeData } = req.body;
    
    if (!routeId || !action) {
      return res.status(400).json({ error: 'Route ID and action are required' });
    }
    
    const results = await federationService.syncAudioRoute(routeId, action, routeData);
    
    res.json({
      success: true,
      message: 'Audio route sync initiated',
      results
    });
  } catch (error) {
    logger.error('Failed to sync audio route:', error);
    res.status(500).json({ error: 'Failed to sync audio route' });
  }
});

// Sync recording with federation peers
router.post('/sync/recording', async (req, res) => {
  try {
    const { recordingId, action, recordingData } = req.body;
    
    if (!recordingId || !action) {
      return res.status(400).json({ error: 'Recording ID and action are required' });
    }
    
    const results = await federationService.syncRecording(recordingId, action, recordingData);
    
    res.json({
      success: true,
      message: 'Recording sync initiated',
      results
    });
  } catch (error) {
    logger.error('Failed to sync recording:', error);
    res.status(500).json({ error: 'Failed to sync recording' });
  }
});

// Sync Matrix room with federation peers
router.post('/sync/matrix-room', async (req, res) => {
  try {
    const { roomId, action, roomData } = req.body;
    
    if (!roomId || !action) {
      return res.status(400).json({ error: 'Room ID and action are required' });
    }
    
    const results = await federationService.syncMatrixRoom(roomId, action, roomData);
    
    res.json({
      success: true,
      message: 'Matrix room sync initiated',
      results
    });
  } catch (error) {
    logger.error('Failed to sync Matrix room:', error);
    res.status(500).json({ error: 'Failed to sync Matrix room' });
  }
});

module.exports = router;
