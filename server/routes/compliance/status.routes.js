const express = require('express');
const router = express.Router();
const { complianceService } = require('../../services/complianceService');
const logger = require('../../utils/logger');
router.get('/status', async (req, res) => {
  try {
    const status = complianceService.getStatus();
    res.json({
      success: true,
      status
    });
  } catch (error) {
    logger.error('Failed to get compliance status:', error);
    res.status(500).json({ error: 'Failed to get compliance status' });
  }
});

// Get compliance report
router.get('/report', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }
    
    const report = await complianceService.generateComplianceReport(startDate, endDate);
    
    res.json({
      success: true,
      report
    });
  } catch (error) {
    logger.error('Failed to generate compliance report:', error);
    res.status(500).json({ error: 'Failed to generate compliance report' });
  }
});

// Get audit log
router.get('/audit', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    
    const auditLog = complianceService.getAuditLog ? complianceService.getAuditLog(parseInt(limit)) : [];
    const paginatedLog = auditLog.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    
    res.json({
      success: true,
      auditLog: paginatedLog,
      total: auditLog.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Failed to get audit log:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

// Get compliance events
router.get('/events', async (req, res) => {
  try {
    const { severity, limit = 100, offset = 0 } = req.query;
    
    let events = complianceService.complianceEvents;
    
    if (severity) {
      events = events.filter(event => event.severity === severity);
    }
    
    const paginatedEvents = events.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    
    res.json({
      success: true,
      events: paginatedEvents,
      total: events.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Failed to get compliance events:', error);
    res.status(500).json({ error: 'Failed to get compliance events' });
  }
});

module.exports = router;
