const express = require('express');
const router = express.Router();
const { complianceService } = require('../../services/complianceService');
const logger = require('../../utils/logger');
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

module.exports = router;
