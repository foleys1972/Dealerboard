const express = require('express');
const router = express.Router();
const { complianceService } = require('../services/complianceService');
const { encryptionService } = require('../services/encryptionService');
const logger = require('../utils/logger');

// Get compliance status
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

// Classify data
router.post('/classify', async (req, res) => {
  try {
    const { dataId, dataType, sensitivity, metadata } = req.body;
    
    if (!dataId || !dataType || !sensitivity) {
      return res.status(400).json({ error: 'Data ID, type, and sensitivity are required' });
    }
    
    const classification = complianceService.classifyData(dataId, dataType, sensitivity, metadata);
    
    res.json({
      success: true,
      classification
    });
  } catch (error) {
    logger.error('Failed to classify data:', error);
    res.status(500).json({ error: 'Failed to classify data' });
  }
});

// Log data access
router.post('/access', async (req, res) => {
  try {
    const { dataId, userId, action, details } = req.body;
    
    if (!dataId || !userId || !action) {
      return res.status(400).json({ error: 'Data ID, user ID, and action are required' });
    }
    
    complianceService.logDataAccess(dataId, userId, action, details);
    
    res.json({
      success: true,
      message: 'Data access logged'
    });
  } catch (error) {
    logger.error('Failed to log data access:', error);
    res.status(500).json({ error: 'Failed to log data access' });
  }
});

// Set legal hold
router.post('/legal-hold', async (req, res) => {
  try {
    const { dataId, reason, details } = req.body;
    
    if (!dataId || !reason) {
      return res.status(400).json({ error: 'Data ID and reason are required' });
    }
    
    const legalHold = complianceService.setLegalHold(dataId, reason, details);
    
    res.json({
      success: true,
      legalHold
    });
  } catch (error) {
    logger.error('Failed to set legal hold:', error);
    res.status(500).json({ error: 'Failed to set legal hold' });
  }
});

// Remove legal hold
router.delete('/legal-hold/:dataId', async (req, res) => {
  try {
    const { dataId } = req.params;
    const { reason, details } = req.body;
    
    if (!reason) {
      return res.status(400).json({ error: 'Reason is required' });
    }
    
    const legalHold = complianceService.removeLegalHold(dataId, reason, details);
    
    res.json({
      success: true,
      legalHold
    });
  } catch (error) {
    logger.error('Failed to remove legal hold:', error);
    res.status(500).json({ error: 'Failed to remove legal hold' });
  }
});

// Get legal holds
router.get('/legal-holds', async (req, res) => {
  try {
    const legalHolds = Array.from(complianceService.legalHolds.values());
    
    res.json({
      success: true,
      legalHolds
    });
  } catch (error) {
    logger.error('Failed to get legal holds:', error);
    res.status(500).json({ error: 'Failed to get legal holds' });
  }
});

// Check data retention
router.get('/retention-check', async (req, res) => {
  try {
    const expiredData = await complianceService.checkDataRetention();
    
    res.json({
      success: true,
      expiredData,
      count: expiredData.length
    });
  } catch (error) {
    logger.error('Failed to check data retention:', error);
    res.status(500).json({ error: 'Failed to check data retention' });
  }
});

// Get encryption status
router.get('/encryption/status', async (req, res) => {
  try {
    const status = encryptionService.getStatus();
    
    res.json({
      success: true,
      status
    });
  } catch (error) {
    logger.error('Failed to get encryption status:', error);
    res.status(500).json({ error: 'Failed to get encryption status' });
  }
});

// Get encryption keys
router.get('/encryption/keys', async (req, res) => {
  try {
    const keys = encryptionService.getActiveKeys();
    
    res.json({
      success: true,
      keys: keys.map(key => ({
        id: key.id,
        purpose: key.purpose,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        isActive: key.isActive
      }))
    });
  } catch (error) {
    logger.error('Failed to get encryption keys:', error);
    res.status(500).json({ error: 'Failed to get encryption keys' });
  }
});

// Generate encryption key
router.post('/encryption/keys', async (req, res) => {
  try {
    const { purpose, metadata } = req.body;
    
    if (!purpose) {
      return res.status(400).json({ error: 'Purpose is required' });
    }
    
    const key = await encryptionService.generateKey(purpose, metadata);
    
    res.json({
      success: true,
      key: {
        id: key.id,
        purpose: key.purpose,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        isActive: key.isActive
      }
    });
  } catch (error) {
    logger.error('Failed to generate encryption key:', error);
    res.status(500).json({ error: 'Failed to generate encryption key' });
  }
});

// Rotate encryption key
router.post('/encryption/keys/:keyId/rotate', async (req, res) => {
  try {
    const { keyId } = req.params;
    
    const newKey = await encryptionService.rotateKey(keyId);
    
    res.json({
      success: true,
      newKey: {
        id: newKey.id,
        purpose: newKey.purpose,
        createdAt: newKey.createdAt,
        expiresAt: newKey.expiresAt,
        isActive: newKey.isActive
      }
    });
  } catch (error) {
    logger.error('Failed to rotate encryption key:', error);
    res.status(500).json({ error: 'Failed to rotate encryption key' });
  }
});

// Revoke encryption key
router.delete('/encryption/keys/:keyId', async (req, res) => {
  try {
    const { keyId } = req.params;
    
    await encryptionService.revokeKey(keyId);
    
    res.json({
      success: true,
      message: 'Key revoked successfully'
    });
  } catch (error) {
    logger.error('Failed to revoke encryption key:', error);
    res.status(500).json({ error: 'Failed to revoke encryption key' });
  }
});

// Get encryption audit log
router.get('/encryption/audit', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    
    const auditLog = encryptionService.getAuditLog(parseInt(limit));
    
    res.json({
      success: true,
      auditLog
    });
  } catch (error) {
    logger.error('Failed to get encryption audit log:', error);
    res.status(500).json({ error: 'Failed to get encryption audit log' });
  }
});

// Encrypt data
router.post('/encryption/encrypt', async (req, res) => {
  try {
    const { data, keyId, additionalData } = req.body;
    
    if (!data || !keyId) {
      return res.status(400).json({ error: 'Data and key ID are required' });
    }
    
    const encrypted = await encryptionService.encryptData(data, keyId, additionalData);
    
    res.json({
      success: true,
      encrypted
    });
  } catch (error) {
    logger.error('Failed to encrypt data:', error);
    res.status(500).json({ error: 'Failed to encrypt data' });
  }
});

// Decrypt data
router.post('/encryption/decrypt', async (req, res) => {
  try {
    const { encryptedData, keyId, additionalData } = req.body;
    
    if (!encryptedData || !keyId) {
      return res.status(400).json({ error: 'Encrypted data and key ID are required' });
    }
    
    const decrypted = await encryptionService.decryptData(encryptedData, keyId, additionalData);
    
    res.json({
      success: true,
      decrypted
    });
  } catch (error) {
    logger.error('Failed to decrypt data:', error);
    res.status(500).json({ error: 'Failed to decrypt data' });
  }
});

// Get compliance recommendations
router.get('/recommendations', async (req, res) => {
  try {
    const recommendations = complianceService.getComplianceRecommendations();
    
    res.json({
      success: true,
      recommendations
    });
  } catch (error) {
    logger.error('Failed to get compliance recommendations:', error);
    res.status(500).json({ error: 'Failed to get compliance recommendations' });
  }
});

// Export compliance data
router.get('/export', async (req, res) => {
  try {
    const { format = 'json', startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }
    
    const report = await complianceService.generateComplianceReport(startDate, endDate);
    
    if (format === 'csv') {
      // Convert to CSV format
      const csv = convertToCSV(report);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="compliance-report.csv"');
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="compliance-report.json"');
      res.json(report);
    }
  } catch (error) {
    logger.error('Failed to export compliance data:', error);
    res.status(500).json({ error: 'Failed to export compliance data' });
  }
});

// Helper function to convert to CSV
function convertToCSV(data) {
  const headers = ['timestamp', 'event', 'severity', 'source'];
  const rows = data.events.map(event => [
    event.timestamp,
    event.event,
    event.severity,
    event.source
  ]);
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

module.exports = router;
