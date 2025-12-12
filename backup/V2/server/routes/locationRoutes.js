const express = require('express');
const router = express.Router();
const { pool } = require('../services/databaseService');
const { authenticateToken } = require('./authRoutes');
const logger = require('../utils/logger');
const crypto = require('crypto');

// Get all locations
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(
      `SELECT l.*, 
       COUNT(DISTINCT u.id) as user_count,
       COUNT(DISTINCT s.id) as subscriber_count
       FROM locations l
       LEFT JOIN users u ON u.location_id = l.id
       LEFT JOIN subscribers s ON s.location_id = l.id
       GROUP BY l.id
       ORDER BY l.created_at DESC`
    );

    const locations = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      retentionDays: row.retention_days,
      voiceRetentionDays: row.voice_retention_days || row.retention_days,
      messagingRetentionDays: row.messaging_retention_days || row.retention_days,
      dataRetentionDays: row.data_retention_days || row.retention_days,
      legalHold: row.legal_hold,
      sftpConfig: row.sftp_config || {},
      metadata: row.metadata || {},
      userCount: parseInt(row.user_count) || 0,
      subscriberCount: parseInt(row.subscriber_count) || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    res.json({
      success: true,
      locations
    });
  } catch (error) {
    logger.error('Failed to get locations:', error);
    res.status(500).json({ error: 'Failed to get locations' });
  }
});

// Get location by ID
router.get('/:locationId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { locationId } = req.params;
    const result = await pool.query(
      `SELECT * FROM locations WHERE id = $1`,
      [locationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const row = result.rows[0];
    res.json({
      success: true,
      location: {
        id: row.id,
        name: row.name,
        description: row.description,
        retentionDays: row.retention_days,
        voiceRetentionDays: row.voice_retention_days || row.retention_days,
        messagingRetentionDays: row.messaging_retention_days || row.retention_days,
        dataRetentionDays: row.data_retention_days || row.retention_days,
        legalHold: row.legal_hold,
        sftpConfig: row.sftp_config || {},
        metadata: row.metadata || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (error) {
    logger.error('Failed to get location:', error);
    res.status(500).json({ error: 'Failed to get location' });
  }
});

// Create location
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const {
      name,
      description,
      retentionDays = 30,
      voiceRetentionDays,
      messagingRetentionDays,
      dataRetentionDays,
      legalHold = false,
      sftpConfig = {},
      metadata = {}
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const id = `location_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const result = await pool.query(
      `INSERT INTO locations (
        id, name, description, retention_days,
        voice_retention_days, messaging_retention_days, data_retention_days,
        legal_hold, sftp_config, metadata, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *`,
      [
        id,
        name,
        description || null,
        retentionDays,
        voiceRetentionDays || retentionDays,
        messagingRetentionDays || retentionDays,
        dataRetentionDays || retentionDays,
        legalHold,
        JSON.stringify(sftpConfig),
        JSON.stringify(metadata)
      ]
    );

    const row = result.rows[0];
    res.status(201).json({
      success: true,
      location: {
        id: row.id,
        name: row.name,
        description: row.description,
        retentionDays: row.retention_days,
        voiceRetentionDays: row.voice_retention_days || row.retention_days,
        messagingRetentionDays: row.messaging_retention_days || row.retention_days,
        dataRetentionDays: row.data_retention_days || row.retention_days,
        legalHold: row.legal_hold,
        sftpConfig: row.sftp_config || {},
        metadata: row.metadata || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
      },
      message: 'Location created successfully'
    });
  } catch (error) {
    logger.error('Failed to create location:', error);
    res.status(500).json({ error: 'Failed to create location', details: error.message });
  }
});

// Update location
router.put('/:locationId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { locationId } = req.params;
    const {
      name,
      description,
      retentionDays,
      voiceRetentionDays,
      messagingRetentionDays,
      dataRetentionDays,
      legalHold,
      sftpConfig,
      metadata
    } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description || null);
    }
    if (retentionDays !== undefined) {
      updates.push(`retention_days = $${paramCount++}`);
      values.push(retentionDays);
    }
    if (voiceRetentionDays !== undefined) {
      updates.push(`voice_retention_days = $${paramCount++}`);
      values.push(voiceRetentionDays);
    }
    if (messagingRetentionDays !== undefined) {
      updates.push(`messaging_retention_days = $${paramCount++}`);
      values.push(messagingRetentionDays);
    }
    if (dataRetentionDays !== undefined) {
      updates.push(`data_retention_days = $${paramCount++}`);
      values.push(dataRetentionDays);
    }
    if (legalHold !== undefined) {
      updates.push(`legal_hold = $${paramCount++}`);
      values.push(legalHold);
    }
    if (sftpConfig !== undefined) {
      updates.push(`sftp_config = $${paramCount++}`);
      values.push(JSON.stringify(sftpConfig));
    }
    if (metadata !== undefined) {
      updates.push(`metadata = $${paramCount++}`);
      values.push(JSON.stringify(metadata));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(locationId);

    const result = await pool.query(
      `UPDATE locations 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const row = result.rows[0];
    res.json({
      success: true,
      location: {
        id: row.id,
        name: row.name,
        description: row.description,
        retentionDays: row.retention_days,
        voiceRetentionDays: row.voice_retention_days || row.retention_days,
        messagingRetentionDays: row.messaging_retention_days || row.retention_days,
        dataRetentionDays: row.data_retention_days || row.retention_days,
        legalHold: row.legal_hold,
        sftpConfig: row.sftp_config || {},
        metadata: row.metadata || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
      },
      message: 'Location updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update location:', error);
    res.status(500).json({ error: 'Failed to update location', details: error.message });
  }
});

// Delete location
router.delete('/:locationId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { locationId } = req.params;
    
    // Check if location has users or subscribers
    const userCheck = await pool.query(
      `SELECT COUNT(*) as count FROM users WHERE location_id = $1`,
      [locationId]
    );
    const subscriberCheck = await pool.query(
      `SELECT COUNT(*) as count FROM subscribers WHERE location_id = $1`,
      [locationId]
    );

    if (parseInt(userCheck.rows[0].count) > 0 || parseInt(subscriberCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete location with assigned users or subscribers. Please reassign them first.' 
      });
    }

    const result = await pool.query(
      `DELETE FROM locations WHERE id = $1 RETURNING id`,
      [locationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    res.json({
      success: true,
      message: 'Location deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete location:', error);
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

// Assign users to location
router.post('/:locationId/assign-users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { locationId } = req.params;
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }

    // Verify location exists
    const locationCheck = await pool.query(
      `SELECT id FROM locations WHERE id = $1`,
      [locationId]
    );

    if (locationCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    // Update users
    const result = await pool.query(
      `UPDATE users 
       SET location_id = $1, updated_at = NOW()
       WHERE id = ANY($2)
       RETURNING id, username`,
      [locationId, userIds]
    );

    res.json({
      success: true,
      message: `Assigned ${result.rows.length} users to location`,
      users: result.rows
    });
  } catch (error) {
    logger.error('Failed to assign users to location:', error);
    res.status(500).json({ error: 'Failed to assign users' });
  }
});

// Get users in location
router.get('/:locationId/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { locationId } = req.params;
    const result = await pool.query(
      `SELECT id, username, email, display_name, first_name, last_name, 
       extension, sip_uri, role, is_active
       FROM users 
       WHERE location_id = $1
       ORDER BY username`,
      [locationId]
    );

    const users = result.rows.map(row => ({
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.display_name,
      firstName: row.first_name,
      lastName: row.last_name,
      extension: row.extension,
      sipUri: row.sip_uri,
      role: row.role,
      isActive: row.is_active
    }));

    res.json({
      success: true,
      users
    });
  } catch (error) {
    logger.error('Failed to get location users:', error);
    res.status(500).json({ error: 'Failed to get location users' });
  }
});

module.exports = router;

