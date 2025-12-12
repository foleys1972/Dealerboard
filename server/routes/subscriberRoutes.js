const express = require('express');
const router = express.Router();
const { pool } = require('../services/databaseService');
const { authenticateToken } = require('./authRoutes');
const logger = require('../utils/logger');
const crypto = require('crypto');

// Get all subscribers
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(
      `SELECT * FROM subscribers ORDER BY created_at DESC`
    );

    const subscribers = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      serverUrl: row.server_url,
      serverId: row.server_id,
      locationId: row.location_id,
      connectionPort: row.connection_port,
      status: row.status,
      lastConnected: row.last_connected,
      isActive: row.is_active,
      config: row.config || {},
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    res.json({
      success: true,
      subscribers
    });
  } catch (error) {
    logger.error('Failed to get subscribers:', error);
    res.status(500).json({ error: 'Failed to get subscribers' });
  }
});

// Get subscriber by ID
router.get('/:subscriberId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { subscriberId } = req.params;
    const result = await pool.query(
      `SELECT * FROM subscribers WHERE id = $1`,
      [subscriberId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    const row = result.rows[0];
    res.json({
      success: true,
      subscriber: {
        id: row.id,
        name: row.name,
        serverUrl: row.server_url,
        serverId: row.server_id,
        locationId: row.location_id,
        connectionPort: row.connection_port,
        status: row.status,
        lastConnected: row.last_connected,
        isActive: row.is_active,
        config: row.config || {},
        metadata: row.metadata || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (error) {
    logger.error('Failed to get subscriber:', error);
    res.status(500).json({ error: 'Failed to get subscriber' });
  }
});

// Create subscriber
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const {
      name,
      serverUrl,
      serverId,
      locationId,
      connectionPort = 3002,
      config = {},
      metadata = {}
    } = req.body;

    if (!name || !serverUrl || !serverId) {
      return res.status(400).json({ error: 'Name, serverUrl, and serverId are required' });
    }

    const id = `subscriber_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const authToken = crypto.randomBytes(32).toString('hex');

    const result = await pool.query(
      `INSERT INTO subscribers (
        id, name, server_url, server_id, location_id, connection_port,
        status, is_active, config, metadata, auth_token, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING *`,
      [
        id,
        name,
        serverUrl,
        serverId,
        locationId || null,
        connectionPort,
        'disconnected',
        true,
        JSON.stringify(config),
        JSON.stringify(metadata),
        authToken
      ]
    );

    const row = result.rows[0];
    res.status(201).json({
      success: true,
      subscriber: {
        id: row.id,
        name: row.name,
        serverUrl: row.server_url,
        serverId: row.server_id,
        locationId: row.location_id,
        connectionPort: row.connection_port,
        status: row.status,
        isActive: row.is_active,
        authToken, // Only returned on creation
        config: row.config || {},
        metadata: row.metadata || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
      },
      message: 'Subscriber created successfully'
    });
  } catch (error) {
    logger.error('Failed to create subscriber:', error);
    res.status(500).json({ error: 'Failed to create subscriber', details: error.message });
  }
});

// Update subscriber
router.put('/:subscriberId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { subscriberId } = req.params;
    const {
      name,
      serverUrl,
      serverId,
      locationId,
      connectionPort,
      isActive,
      config,
      metadata
    } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (serverUrl !== undefined) {
      updates.push(`server_url = $${paramCount++}`);
      values.push(serverUrl);
    }
    if (serverId !== undefined) {
      updates.push(`server_id = $${paramCount++}`);
      values.push(serverId);
    }
    if (locationId !== undefined) {
      updates.push(`location_id = $${paramCount++}`);
      values.push(locationId || null);
    }
    if (connectionPort !== undefined) {
      updates.push(`connection_port = $${paramCount++}`);
      values.push(connectionPort);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(isActive);
    }
    if (config !== undefined) {
      updates.push(`config = $${paramCount++}`);
      values.push(JSON.stringify(config));
    }
    if (metadata !== undefined) {
      updates.push(`metadata = $${paramCount++}`);
      values.push(JSON.stringify(metadata));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(subscriberId);

    const result = await pool.query(
      `UPDATE subscribers 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    const row = result.rows[0];
    res.json({
      success: true,
      subscriber: {
        id: row.id,
        name: row.name,
        serverUrl: row.server_url,
        serverId: row.server_id,
        locationId: row.location_id,
        connectionPort: row.connection_port,
        status: row.status,
        isActive: row.is_active,
        config: row.config || {},
        metadata: row.metadata || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
      },
      message: 'Subscriber updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update subscriber:', error);
    res.status(500).json({ error: 'Failed to update subscriber', details: error.message });
  }
});

// Delete subscriber
router.delete('/:subscriberId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { subscriberId } = req.params;
    const result = await pool.query(
      `DELETE FROM subscribers WHERE id = $1 RETURNING id`,
      [subscriberId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    res.json({
      success: true,
      message: 'Subscriber deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete subscriber:', error);
    res.status(500).json({ error: 'Failed to delete subscriber' });
  }
});

// Test subscriber connection
router.post('/:subscriberId/test', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { subscriberId } = req.params;
    const result = await pool.query(
      `SELECT * FROM subscribers WHERE id = $1`,
      [subscriberId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    const subscriber = result.rows[0];
    
    // Check if publisher subscriber service is available via app locals
    const publisherService = req.app.locals.publisherSubscriberService;
    
    if (!publisherService) {
      return res.status(503).json({ 
        error: 'Publisher subscriber service not available. Server must be in publisher mode.' 
      });
    }

    // Check if subscriber is currently connected
    const isConnected = publisherService.isSubscriberConnected(subscriber.id);
    
    res.json({
      success: true,
      message: isConnected ? 'Subscriber is connected' : 'Subscriber is not connected',
      subscriber: {
        id: subscriber.id,
        serverUrl: subscriber.server_url,
        serverId: subscriber.server_id,
        status: isConnected ? 'connected' : subscriber.status,
        isConnected
      }
    });
  } catch (error) {
    logger.error('Failed to test subscriber connection:', error);
    res.status(500).json({ error: 'Failed to test connection' });
  }
});

module.exports = router;

