const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticateToken } = require('../authRoutes');
const { getZoomService } = require('../../services/zoomService');
const logger = require('../../utils/logger');
router.post('/meetings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const zoomService = getZoomService();

    if (!zoomService.config.enabled) {
      return res.status(503).json({ error: 'Zoom integration is not enabled' });
    }

    const meeting = await zoomService.createMeeting(userId, req.body);

    res.json({
      success: true,
      meeting: {
        id: meeting.id,
        topic: meeting.topic,
        joinUrl: meeting.join_url,
        startUrl: meeting.start_url,
        password: meeting.password,
        startTime: meeting.start_time,
        duration: meeting.duration
      }
    });
  } catch (error) {
    logger.error('Failed to create Zoom meeting:', error);
    res.status(500).json({ error: 'Failed to create Zoom meeting', details: error.message });
  }
});

// Get user's Zoom meetings
router.get('/meetings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const zoomService = getZoomService();

    if (!zoomService.config.enabled) {
      return res.status(503).json({ error: 'Zoom integration is not enabled' });
    }

    const { type, from, to, pageSize } = req.query;
    const meetings = await zoomService.getUserMeetings(userId, {
      type,
      from,
      to,
      pageSize: pageSize ? parseInt(pageSize) : undefined
    });

    res.json({
      success: true,
      meetings: meetings.meetings || [],
      pageCount: meetings.page_count,
      pageNumber: meetings.page_number,
      pageSize: meetings.page_size,
      totalRecords: meetings.total_records
    });
  } catch (error) {
    logger.error('Failed to get Zoom meetings:', error);
    res.status(500).json({ error: 'Failed to get Zoom meetings', details: error.message });
  }
});

// Get specific meeting
router.get('/meetings/:meetingId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const zoomService = getZoomService();

    if (!zoomService.config.enabled) {
      return res.status(503).json({ error: 'Zoom integration is not enabled' });
    }

    const meeting = await zoomService.getMeeting(req.params.meetingId, userId);

    res.json({
      success: true,
      meeting: {
        id: meeting.id,
        topic: meeting.topic,
        joinUrl: meeting.join_url,
        startUrl: meeting.start_url,
        password: meeting.password,
        startTime: meeting.start_time,
        duration: meeting.duration,
        status: meeting.status
      }
    });
  } catch (error) {
    logger.error('Failed to get Zoom meeting:', error);
    res.status(500).json({ error: 'Failed to get Zoom meeting', details: error.message });
  }
});

// Join a Zoom meeting (get join URL)
router.post('/meetings/:meetingId/join', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const zoomService = getZoomService();

    if (!zoomService.config.enabled) {
      return res.status(503).json({ error: 'Zoom integration is not enabled' });
    }

    const joinInfo = await zoomService.joinMeeting(req.params.meetingId, userId);

    res.json({
      success: true,
      joinUrl: joinInfo.joinUrl,
      startUrl: joinInfo.startUrl,
      meetingId: joinInfo.meetingId
    });
  } catch (error) {
    logger.error('Failed to join Zoom meeting:', error);
    res.status(500).json({ error: 'Failed to join Zoom meeting', details: error.message });
  }
});

module.exports = router;
