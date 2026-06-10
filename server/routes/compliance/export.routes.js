const express = require('express');
const router = express.Router();
const { complianceService } = require('../../services/complianceService');
const logger = require('../../utils/logger');
const { convertToCSV } = require('./shared');
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

module.exports = router;
