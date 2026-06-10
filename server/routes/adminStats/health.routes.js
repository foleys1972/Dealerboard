const express = require('express');
const os = require('os');
const router = express.Router();
const logger = require('../../utils/logger');
const { groupService } = require('../../services/groupService');
const { findUsers } = require('../../services/databaseService');
router.get('/health', async (req, res) => {
  let dbStatus = { connected: false, error: null };
  try {
    const { pool } = require('../../services/databaseService');
    if (pool) {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      dbStatus = { connected: true };
    }
  } catch (err) {
    dbStatus = { connected: false, error: err.message };
  }

  res.json({
    success: true,
    message: 'Admin stats service online',
    timestamp: new Date().toISOString(),
    database: dbStatus,
  });
});

module.exports = router;
