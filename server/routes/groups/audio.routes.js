const express = require('express');
const router = express.Router();
const { groupService } = require('../../services/groupService');
const { audioRoutingService } = require('../../services/audioRoutingService');
const { audioRecordingService } = require('../../services/audioRecordingService');
const logger = require('../../utils/logger');
router.post('/:groupId/mute', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, mutedBy } = req.body;
    
    await groupService.muteUser(groupId, userId, mutedBy);
    await audioRoutingService.muteParticipant(groupId, userId, mutedBy);
    
    res.json({
      success: true,
      message: 'User muted successfully'
    });
  } catch (error) {
    logger.error('Failed to mute user:', error);
    res.status(500).json({ error: error.message || 'Failed to mute user' });
  }
});

// Unmute user in group
router.post('/:groupId/unmute', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, unmutedBy } = req.body;
    
    await groupService.unmuteUser(groupId, userId, unmutedBy);
    await audioRoutingService.unmuteParticipant(groupId, userId, unmutedBy);
    
    res.json({
      success: true,
      message: 'User unmuted successfully'
    });
  } catch (error) {
    logger.error('Failed to unmute user:', error);
    res.status(500).json({ error: error.message || 'Failed to unmute user' });
  }
});

// Set participant volume
router.post('/:groupId/volume', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, volume } = req.body;
    
    audioRoutingService.setParticipantVolume(groupId, userId, volume);
    
    res.json({
      success: true,
      message: 'Volume set successfully'
    });
  } catch (error) {
    logger.error('Failed to set volume:', error);
    res.status(500).json({ error: 'Failed to set volume' });
  }
});

// Set priority speaker
router.post('/:groupId/priority', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, isPriority } = req.body;
    
    audioRoutingService.setPrioritySpeaker(groupId, userId, isPriority);
    
    res.json({
      success: true,
      message: 'Priority speaker set successfully'
    });
  } catch (error) {
    logger.error('Failed to set priority speaker:', error);
    res.status(500).json({ error: 'Failed to set priority speaker' });
  }
});

// Start group recording
router.post('/:groupId/recording/start', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { startedBy } = req.body;
    
    const recording = await groupService.startGroupRecording(groupId, startedBy);
    
    res.json({
      success: true,
      recording,
      message: 'Recording started successfully'
    });
  } catch (error) {
    logger.error('Failed to start recording:', error);
    res.status(500).json({ error: error.message || 'Failed to start recording' });
  }
});

// Stop group recording
router.post('/:groupId/recording/stop', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { stoppedBy } = req.body;
    
    const result = await groupService.stopGroupRecording(groupId, stoppedBy);
    
    res.json({
      success: true,
      result,
      message: 'Recording stopped successfully'
    });
  } catch (error) {
    logger.error('Failed to stop recording:', error);
    res.status(500).json({ error: error.message || 'Failed to stop recording' });
  }
});

module.exports = router;
