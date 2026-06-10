const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { getTeamsService } = require('../../services/teamsService');
const logger = require('../../utils/logger');
router.post('/meetings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { subject, startTime, endTime, participants } = req.body;
    const teamsService = getTeamsService();

    if (!teamsService.config.enabled) {
      return res.status(503).json({ error: 'Teams integration is not enabled' });
    }

    const meeting = await teamsService.createMeeting(userId, {
      subject,
      startTime,
      endTime,
      participants
    });

    res.json({
      success: true,
      meeting: {
        id: meeting.id,
        subject: meeting.subject,
        joinUrl: meeting.joinUrl,
        joinWebUrl: meeting.joinWebUrl,
        startTime: meeting.startTime,
        endTime: meeting.endTime
      }
    });
  } catch (error) {
    logger.error('Failed to create Teams meeting:', error);
    res.status(500).json({ error: 'Failed to create Teams meeting', details: error.message });
  }
});

// List user's Teams meetings
router.get('/meetings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { limit } = req.query;
    const teamsService = getTeamsService();

    if (!teamsService.config.enabled) {
      return res.status(503).json({ error: 'Teams integration is not enabled' });
    }

    const meetings = await teamsService.listMeetings(userId, { limit: parseInt(limit) || 10 });

    res.json({
      success: true,
      meetings: meetings.map(m => ({
        id: m.id,
        subject: m.subject,
        joinUrl: m.joinUrl,
        joinWebUrl: m.joinWebUrl,
        startTime: m.startDateTime,
        endTime: m.endDateTime
      }))
    });
  } catch (error) {
    logger.error('Failed to list Teams meetings:', error);
    res.status(500).json({ error: 'Failed to list Teams meetings', details: error.message });
  }
});

// Get a specific Teams meeting
router.get('/meetings/:meetingId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const teamsService = getTeamsService();

    if (!teamsService.config.enabled) {
      return res.status(503).json({ error: 'Teams integration is not enabled' });
    }

    const meeting = await teamsService.getMeeting(req.params.meetingId, userId);

    res.json({
      success: true,
      meeting: {
        id: meeting.id,
        subject: meeting.subject,
        joinUrl: meeting.joinUrl,
        joinWebUrl: meeting.joinWebUrl,
        startTime: meeting.startDateTime,
        endTime: meeting.endDateTime
      }
    });
  } catch (error) {
    logger.error('Failed to get Teams meeting:', error);
    res.status(500).json({ error: 'Failed to get Teams meeting', details: error.message });
  }
});

// Join a Teams meeting (get join URL)
router.post('/meetings/:meetingId/join', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const teamsService = getTeamsService();

    if (!teamsService.config.enabled) {
      return res.status(503).json({ error: 'Teams integration is not enabled' });
    }

    const joinInfo = await teamsService.joinMeeting(req.params.meetingId, userId);

    res.json({
      success: true,
      joinUrl: joinInfo.joinUrl,
      joinWebUrl: joinInfo.joinWebUrl,
      meetingId: joinInfo.meetingId
    });
  } catch (error) {
    logger.error('Failed to join Teams meeting:', error);
    res.status(500).json({ error: 'Failed to join Teams meeting', details: error.message });
  }
});

module.exports = router;
