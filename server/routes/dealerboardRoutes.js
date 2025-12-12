const express = require('express');
const router = express.Router();
const { pool } = require('../services/databaseService');
const { authenticateToken } = require('./authRoutes');
const { getSIPGateway } = require('../services/sipService');
const { getSIPMatrixBridge } = require('../services/sipMatrixBridge');
const logger = require('../utils/logger');
const crypto = require('crypto');

// Helper to generate sudo line reference
function generateSudoLineReference() {
  return `LINE-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

// ==================== PRIVATE WIRES (Admin Only) ====================

// Get all private wires
router.get('/private-wires', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(
      `SELECT * FROM dealerboard_private_wires ORDER BY created_at DESC`
    );

    const wires = result.rows.map(row => ({
      id: row.id,
      uriAddress: row.uri_address,
      sbcDetails: row.sbc_details || {},
      lineLabel: row.line_label,
      circuitNumber: row.circuit_number,
      mode: row.mode,
      subscriberId: row.subscriber_id,
      externalCommunityId: row.external_community_id,
      externalCommunityName: row.external_community_name,
      isExternalCommunity: row.is_external_community || false,
      sudoLineReference: row.sudo_line_reference,
      isActive: row.is_active,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    res.json({ success: true, wires });
  } catch (error) {
    logger.error('Failed to get private wires:', error);
    logger.error('Error details:', { 
      message: error.message, 
      stack: error.stack,
      code: error.code 
    });
    res.status(500).json({ 
      error: 'Failed to get private wires',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create private wire
router.post('/private-wires', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { 
      uriAddress, 
      sbcDetails, 
      lineLabel, 
      circuitNumber, 
      mode, 
      subscriberId,
      externalCommunityId,
      externalCommunityName,
      isExternalCommunity
    } = req.body;

    if (!uriAddress || !lineLabel || !mode) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['ARD', 'MRD', 'HOOT'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode. Must be ARD, MRD, or HOOT' });
    }

    // Validate external community fields
    if (isExternalCommunity && (!externalCommunityId || !externalCommunityName)) {
      return res.status(400).json({ error: 'External community ID and name required for external community wires' });
    }

    const id = crypto.randomUUID();
    const sudoLineReference = generateSudoLineReference();

    await pool.query(
      `INSERT INTO dealerboard_private_wires 
       (id, uri_address, sbc_details, line_label, circuit_number, mode, subscriber_id, 
        external_community_id, external_community_name, is_external_community, sudo_line_reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id, 
        uriAddress, 
        JSON.stringify(sbcDetails || {}), 
        lineLabel, 
        circuitNumber || null, 
        mode, 
        subscriberId || null,
        externalCommunityId || null,
        externalCommunityName || null,
        isExternalCommunity || false,
        sudoLineReference
      ]
    );

    res.json({ success: true, id, sudoLineReference });
  } catch (error) {
    logger.error('Failed to create private wire:', error);
    res.status(500).json({ error: 'Failed to create private wire' });
  }
});

// Update private wire
router.put('/private-wires/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { 
      uriAddress, 
      sbcDetails, 
      lineLabel, 
      circuitNumber, 
      mode, 
      subscriberId, 
      isActive,
      externalCommunityId,
      externalCommunityName,
      isExternalCommunity
    } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (uriAddress !== undefined) {
      updates.push(`uri_address = $${paramCount++}`);
      values.push(uriAddress);
    }
    if (sbcDetails !== undefined) {
      updates.push(`sbc_details = $${paramCount++}`);
      values.push(JSON.stringify(sbcDetails));
    }
    if (lineLabel !== undefined) {
      updates.push(`line_label = $${paramCount++}`);
      values.push(lineLabel);
    }
    if (circuitNumber !== undefined) {
      updates.push(`circuit_number = $${paramCount++}`);
      values.push(circuitNumber);
    }
    if (mode !== undefined) {
      if (!['ARD', 'MRD', 'HOOT'].includes(mode)) {
        return res.status(400).json({ error: 'Invalid mode' });
      }
      updates.push(`mode = $${paramCount++}`);
      values.push(mode);
    }
    if (subscriberId !== undefined) {
      updates.push(`subscriber_id = $${paramCount++}`);
      values.push(subscriberId);
    }
    if (externalCommunityId !== undefined) {
      updates.push(`external_community_id = $${paramCount++}`);
      values.push(externalCommunityId);
    }
    if (externalCommunityName !== undefined) {
      updates.push(`external_community_name = $${paramCount++}`);
      values.push(externalCommunityName);
    }
    if (isExternalCommunity !== undefined) {
      updates.push(`is_external_community = $${paramCount++}`);
      values.push(isExternalCommunity);
      
      // Validate external community fields if enabling
      if (isExternalCommunity && (!externalCommunityId || !externalCommunityName)) {
        return res.status(400).json({ error: 'External community ID and name required when enabling external community' });
      }
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    await pool.query(
      `UPDATE dealerboard_private_wires SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update private wire:', error);
    res.status(500).json({ error: 'Failed to update private wire' });
  }
});

// Delete private wire
router.delete('/private-wires/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await pool.query('DELETE FROM dealerboard_private_wires WHERE id = $1', [req.params.id]);

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete private wire:', error);
    res.status(500).json({ error: 'Failed to delete private wire' });
  }
});

// ==================== DDI LINES (Admin Only) ====================

// Get all DDI lines
router.get('/ddi-lines', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(
      `SELECT * FROM dealerboard_ddi_lines ORDER BY created_at DESC`
    );

    const lines = result.rows.map(row => ({
      id: row.id,
      lineNumber: row.line_number,
      lineName: row.line_name,
      sbcDetails: row.sbc_details || {},
      connectionDetails: row.connection_details || {},
      subscriberId: row.subscriber_id,
      sudoLineReference: row.sudo_line_reference,
      isActive: row.is_active,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    res.json({ success: true, lines });
  } catch (error) {
    logger.error('Failed to get DDI lines:', error);
    logger.error('Error details:', { 
      message: error.message, 
      stack: error.stack,
      code: error.code 
    });
    res.status(500).json({ 
      error: 'Failed to get DDI lines',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create DDI line
router.post('/ddi-lines', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { lineNumber, lineName, sbcDetails, connectionDetails, subscriberId } = req.body;

    if (!lineNumber || !lineName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = crypto.randomUUID();
    const sudoLineReference = generateSudoLineReference();

    await pool.query(
      `INSERT INTO dealerboard_ddi_lines 
       (id, line_number, line_name, sbc_details, connection_details, subscriber_id, sudo_line_reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, lineNumber, lineName, JSON.stringify(sbcDetails || {}), JSON.stringify(connectionDetails || {}), subscriberId || null, sudoLineReference]
    );

    res.json({ success: true, id, sudoLineReference });
  } catch (error) {
    logger.error('Failed to create DDI line:', error);
    res.status(500).json({ error: 'Failed to create DDI line' });
  }
});

// Update DDI line
router.put('/ddi-lines/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { lineNumber, lineName, sbcDetails, connectionDetails, subscriberId, isActive } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (lineNumber !== undefined) {
      updates.push(`line_number = $${paramCount++}`);
      values.push(lineNumber);
    }
    if (lineName !== undefined) {
      updates.push(`line_name = $${paramCount++}`);
      values.push(lineName);
    }
    if (sbcDetails !== undefined) {
      updates.push(`sbc_details = $${paramCount++}`);
      values.push(JSON.stringify(sbcDetails));
    }
    if (connectionDetails !== undefined) {
      updates.push(`connection_details = $${paramCount++}`);
      values.push(JSON.stringify(connectionDetails));
    }
    if (subscriberId !== undefined) {
      updates.push(`subscriber_id = $${paramCount++}`);
      values.push(subscriberId);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    await pool.query(
      `UPDATE dealerboard_ddi_lines SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update DDI line:', error);
    res.status(500).json({ error: 'Failed to update DDI line' });
  }
});

// Delete DDI line
router.delete('/ddi-lines/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await pool.query('DELETE FROM dealerboard_ddi_lines WHERE id = $1', [req.params.id]);

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete DDI line:', error);
    res.status(500).json({ error: 'Failed to delete DDI line' });
  }
});

// ==================== AVAILABLE LINES (User Access) ====================

// Get all available lines for user (private wires + DDI)
router.get('/lines', authenticateToken, async (req, res) => {
  try {
    const privateWiresResult = await pool.query(
      `SELECT id, line_label as name, line_label as label, 'private_wire' as type, mode, sudo_line_reference, is_active
       FROM dealerboard_private_wires WHERE is_active = true`
    );

    const ddiLinesResult = await pool.query(
      `SELECT id, line_name as name, line_name as label, 'DDI' as type, NULL as mode, sudo_line_reference, is_active
       FROM dealerboard_ddi_lines WHERE is_active = true`
    );

    const lines = [
      ...privateWiresResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        label: row.label,
        type: row.type,
        mode: row.mode,
        sudoLineReference: row.sudo_line_reference,
        isActive: row.is_active
      })),
      ...ddiLinesResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        label: row.label,
        type: row.type,
        mode: null,
        sudoLineReference: row.sudo_line_reference,
        isActive: row.is_active
      }))
    ];

    res.json({ success: true, lines });
  } catch (error) {
    logger.error('Failed to get available lines:', error);
    res.status(500).json({ error: 'Failed to get available lines' });
  }
});

// ==================== SPEED DIALS (User Access) ====================

// Get user's speed dials
router.get('/speed-dials', authenticateToken, async (req, res) => {
  try {
    // Allow admins to access other users' speed dials via query param
    let targetUserId = req.user.id || req.user.userId;
    if (req.user.role === 'admin' && req.query.userId) {
      targetUserId = req.query.userId;
    }
    
    if (!targetUserId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    const result = await pool.query(
      `SELECT * FROM dealerboard_speed_dials WHERE user_id = $1 ORDER BY name`,
      [targetUserId]
    );

    const speedDials = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      number: row.number,
      description: row.description,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    res.json({ success: true, speedDials });
  } catch (error) {
    logger.error('Failed to get speed dials:', error);
    logger.error('Error details:', { 
      message: error.message, 
      stack: error.stack,
      userId: req.query.userId,
      userRole: req.user?.role 
    });
    res.status(500).json({ 
      error: 'Failed to get speed dials',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create speed dial
router.post('/speed-dials', authenticateToken, async (req, res) => {
  try {
    const { name, number, description, userId: targetUserId } = req.body;

    if (!name || !number) {
      return res.status(400).json({ error: 'Name and number are required' });
    }

    // Allow admins to create speed dials for other users
    const userId = (req.user.role === 'admin' && targetUserId) ? targetUserId : (req.user.id || req.user.userId);
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Generate ID - use crypto.randomUUID() if available, otherwise fallback
    let id;
    try {
      id = crypto.randomUUID();
    } catch (e) {
      // Fallback for older Node versions
      id = `speed-dial-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    const result = await pool.query(
      `INSERT INTO dealerboard_speed_dials (id, user_id, name, number, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, userId, name, number, description || null]
    );

    const speedDial = result.rows[0];
    res.json({ 
      success: true, 
      id: speedDial.id,
      speedDial: {
        id: speedDial.id,
        name: speedDial.name,
        number: speedDial.number,
        description: speedDial.description,
        metadata: speedDial.metadata || {},
        createdAt: speedDial.created_at,
        updatedAt: speedDial.updated_at
      }
    });
  } catch (error) {
    logger.error('Failed to create speed dial:', error);
    logger.error('Error details:', { 
      message: error.message, 
      stack: error.stack,
      body: req.body,
      userId: req.user?.id || req.user?.userId,
      userRole: req.user?.role 
    });
    
    // Check for specific database errors
    if (error.code === '23503') { // Foreign key violation
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Speed dial already exists' });
    }
    
    res.status(500).json({ 
      error: 'Failed to create speed dial',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update speed dial
router.put('/speed-dials/:id', authenticateToken, async (req, res) => {
  try {
    const { name, number, description } = req.body;
    const userId = req.user.id || req.user.userId;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT user_id FROM dealerboard_speed_dials WHERE id = $1',
      [req.params.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Speed dial not found' });
    }

    if (checkResult.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (number !== undefined) {
      updates.push(`number = $${paramCount++}`);
      values.push(number);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    await pool.query(
      `UPDATE dealerboard_speed_dials SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update speed dial:', error);
    res.status(500).json({ error: 'Failed to update speed dial' });
  }
});

// Delete speed dial
router.delete('/speed-dials/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT user_id FROM dealerboard_speed_dials WHERE id = $1',
      [req.params.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Speed dial not found' });
    }

    if (checkResult.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('DELETE FROM dealerboard_speed_dials WHERE id = $1', [req.params.id]);

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete speed dial:', error);
    res.status(500).json({ error: 'Failed to delete speed dial' });
  }
});

// ==================== BUTTON ASSIGNMENTS (User Access) ====================

// Get user's dealerboard configuration
router.get('/config/:userId', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.userId;
    const requestingUserId = req.user.id || req.user.userId;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Users can only access their own config, or admins can access any
    if (userId !== requestingUserId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get button assignments grouped by page
    const assignmentsResult = await pool.query(
      `SELECT * FROM dealerboard_button_assignments WHERE user_id = $1 ORDER BY page_number, button_number`,
      [userId]
    );

    const assignments = {};
    for (const row of assignmentsResult.rows) {
      if (!assignments[row.page_number]) {
        assignments[row.page_number] = {};
      }
      assignments[row.page_number][row.button_number] = {
        id: row.id,
        assignmentType: row.assignment_type,
        lineId: row.line_id,
        ddiLineId: row.ddi_line_id,
        speedDialId: row.speed_dial_id
      };
    }

    // Get user preferences
    const prefsResult = await pool.query(
      'SELECT * FROM dealerboard_user_preferences WHERE user_id = $1',
      [userId]
    );

    const preferences = prefsResult.rows[0] ? {
      audibleRinging: prefsResult.rows[0].audible_ringing,
      buttonColors: prefsResult.rows[0].button_colors || {},
      preferences: prefsResult.rows[0].preferences || {},
      defaultDdiLineId: prefsResult.rows[0].default_ddi_line_id || null
    } : {
      audibleRinging: true,
      buttonColors: {},
      preferences: {},
      defaultDdiLineId: null
    };

    res.json({
      success: true,
      assignments,
      preferences
    });
  } catch (error) {
    logger.error('Failed to get dealerboard config:', error);
    logger.error('Error details:', { 
      message: error.message, 
      stack: error.stack,
      userId: req.params.userId,
      userRole: req.user?.role 
    });
    res.status(500).json({ 
      error: 'Failed to get dealerboard config',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Set button assignment
router.post('/assignments', authenticateToken, async (req, res) => {
  try {
    const { pageNumber, buttonNumber, assignmentType, lineId, ddiLineId, speedDialId, targetUserId } = req.body;
    // Allow admins to assign to specific user, otherwise use token user
    const userId = (req.user.role === 'admin' && targetUserId) ? targetUserId : (req.user.id || req.user.userId);

    if (!pageNumber || !buttonNumber || !assignmentType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (pageNumber < 1 || pageNumber > 10 || buttonNumber < 1 || buttonNumber > 28) {
      return res.status(400).json({ error: 'Invalid page or button number' });
    }

    // Support both old format ('line', 'speed_dial') and new format ('privateWire', 'ddiLine', 'speedDial')
    const normalizedType = assignmentType === 'line' ? 'privateWire' : 
                          assignmentType === 'speed_dial' ? 'speedDial' : assignmentType;
    
    if ((normalizedType === 'privateWire' || normalizedType === 'ddiLine') && !lineId && !ddiLineId) {
      return res.status(400).json({ error: 'Line ID required for line assignment' });
    }

    if (normalizedType === 'speedDial' && !speedDialId) {
      return res.status(400).json({ error: 'Speed dial ID required for speed dial assignment' });
    }

    // Check if user is in a dealerboard group (only for line assignments, not speed dials)
    let userIdsToAssign = [userId];
    if (normalizedType === 'privateWire' || normalizedType === 'ddiLine') {
      const groupResult = await pool.query(
        `SELECT dg.id, dg.name 
         FROM dealerboard_groups dg
         INNER JOIN dealerboard_group_members dgm ON dg.id = dgm.group_id
         WHERE dgm.user_id = $1 AND dg.is_active = true`,
        [userId]
      );

      if (groupResult.rows.length > 0) {
        // User is in a group, get all members
        const groupId = groupResult.rows[0].id;
        const membersResult = await pool.query(
          'SELECT user_id FROM dealerboard_group_members WHERE group_id = $1',
          [groupId]
        );
        userIdsToAssign = membersResult.rows.map(row => row.user_id);
        logger.info(`User ${userId} is in group ${groupId}, assigning to ${userIdsToAssign.length} users`);
      }
    }

    const assignedIds = [];
    for (const targetUserId of userIdsToAssign) {
      // Check if assignment exists
      const existingResult = await pool.query(
        'SELECT id FROM dealerboard_button_assignments WHERE user_id = $1 AND page_number = $2 AND button_number = $3',
        [targetUserId, pageNumber, buttonNumber]
      );

      const id = existingResult.rows[0]?.id || crypto.randomUUID();

      if (existingResult.rows.length > 0) {
        // Update existing
        await pool.query(
          `UPDATE dealerboard_button_assignments 
           SET assignment_type = $1, line_id = $2, ddi_line_id = $3, speed_dial_id = $4, updated_at = NOW()
           WHERE id = $5`,
          [normalizedType, lineId || null, ddiLineId || null, speedDialId || null, id]
        );
      } else {
        // Create new
        await pool.query(
          `INSERT INTO dealerboard_button_assignments 
           (id, user_id, page_number, button_number, assignment_type, line_id, ddi_line_id, speed_dial_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, targetUserId, pageNumber, buttonNumber, normalizedType, lineId || null, ddiLineId || null, speedDialId || null]
        );
      }
      assignedIds.push(id);
    }

    res.json({ success: true, ids: assignedIds, assignedTo: userIdsToAssign.length });
  } catch (error) {
    logger.error('Failed to set button assignment:', error);
    res.status(500).json({ error: 'Failed to set button assignment' });
  }
});

// Remove button assignment
router.delete('/assignments/:pageNumber/:buttonNumber', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const pageNumber = parseInt(req.params.pageNumber);
    const buttonNumber = parseInt(req.params.buttonNumber);

    await pool.query(
      'DELETE FROM dealerboard_button_assignments WHERE user_id = $1 AND page_number = $2 AND button_number = $3',
      [userId, pageNumber, buttonNumber]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to remove button assignment:', error);
    res.status(500).json({ error: 'Failed to remove button assignment' });
  }
});

// ==================== USER PREFERENCES ====================

// Update user preferences
router.put('/preferences', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { audibleRinging, buttonColors, preferences, defaultDdiLineId } = req.body;

    // Validate default DDI line if provided
    if (defaultDdiLineId !== undefined && defaultDdiLineId !== null) {
      const ddiCheck = await pool.query(
        `SELECT id FROM dealerboard_ddi_lines WHERE id = $1 AND is_active = true`,
        [defaultDdiLineId]
      );
      if (ddiCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or inactive DDI line' });
      }
    }

    const existingResult = await pool.query(
      'SELECT user_id FROM dealerboard_user_preferences WHERE user_id = $1',
      [userId]
    );

    if (existingResult.rows.length > 0) {
      // Update
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (audibleRinging !== undefined) {
        updates.push(`audible_ringing = $${paramCount++}`);
        values.push(audibleRinging);
      }
      if (buttonColors !== undefined) {
        updates.push(`button_colors = $${paramCount++}`);
        values.push(JSON.stringify(buttonColors));
      }
      if (preferences !== undefined) {
        updates.push(`preferences = $${paramCount++}`);
        values.push(JSON.stringify(preferences));
      }
      if (defaultDdiLineId !== undefined) {
        updates.push(`default_ddi_line_id = $${paramCount++}`);
        values.push(defaultDdiLineId || null);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(userId);
        await pool.query(
          `UPDATE dealerboard_user_preferences SET ${updates.join(', ')} WHERE user_id = $${paramCount}`,
          values
        );
      }
    } else {
      // Create
      await pool.query(
        `INSERT INTO dealerboard_user_preferences (user_id, audible_ringing, button_colors, preferences, default_ddi_line_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          userId,
          audibleRinging !== undefined ? audibleRinging : true,
          JSON.stringify(buttonColors || {}),
          JSON.stringify(preferences || {}),
          defaultDdiLineId || null
        ]
      );
    }

    res.json({ success: true, message: 'Preferences updated' });
  } catch (error) {
    logger.error('Failed to update preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences', details: error.message });
  }
});

// Get user preferences
router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;

    const prefsResult = await pool.query(
      `SELECT audible_ringing, button_colors, preferences, default_ddi_line_id
       FROM dealerboard_user_preferences WHERE user_id = $1`,
      [userId]
    );

    if (prefsResult.rows.length === 0) {
      return res.json({
        success: true,
        preferences: {
          audibleRinging: true,
          buttonColors: {},
          preferences: {},
          defaultDdiLineId: null
        }
      });
    }

    const row = prefsResult.rows[0];
    res.json({
      success: true,
      preferences: {
        audibleRinging: row.audible_ringing,
        buttonColors: row.button_colors || {},
        preferences: row.preferences || {},
        defaultDdiLineId: row.default_ddi_line_id || null
      }
    });
  } catch (error) {
    logger.error('Failed to get preferences:', error);
    res.status(500).json({ error: 'Failed to get preferences', details: error.message });
  }
});

// ==================== DEALERBOARD GROUPS ====================

// Get all dealerboard groups
router.get('/groups', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(
      `SELECT dg.*, COUNT(dgm.user_id) as member_count
       FROM dealerboard_groups dg
       LEFT JOIN dealerboard_group_members dgm ON dg.id = dgm.group_id
       GROUP BY dg.id
       ORDER BY dg.name`
    );

    const groups = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      isActive: row.is_active,
      memberCount: parseInt(row.member_count) || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    res.json({ success: true, groups });
  } catch (error) {
    logger.error('Failed to get dealerboard groups:', error);
    res.status(500).json({ error: 'Failed to get dealerboard groups' });
  }
});

// Create dealerboard group
router.post('/groups', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO dealerboard_groups (id, name, description)
       VALUES ($1, $2, $3)`,
      [id, name, description || null]
    );

    res.json({ success: true, id });
  } catch (error) {
    logger.error('Failed to create dealerboard group:', error);
    res.status(500).json({ error: 'Failed to create dealerboard group' });
  }
});

// Update dealerboard group
router.put('/groups/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, description, isActive } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    await pool.query(
      `UPDATE dealerboard_groups SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update dealerboard group:', error);
    res.status(500).json({ error: 'Failed to update dealerboard group' });
  }
});

// Delete dealerboard group
router.delete('/groups/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await pool.query('DELETE FROM dealerboard_groups WHERE id = $1', [req.params.id]);

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete dealerboard group:', error);
    res.status(500).json({ error: 'Failed to delete dealerboard group' });
  }
});

// Get group members
router.get('/groups/:id/members', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.display_name, u.email
       FROM dealerboard_group_members dgm
       INNER JOIN users u ON dgm.user_id = u.id
       WHERE dgm.group_id = $1
       ORDER BY u.display_name, u.username`,
      [req.params.id]
    );

    const members = result.rows.map(row => ({
      id: row.id,
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
      email: row.email
    }));

    res.json({ success: true, members });
  } catch (error) {
    logger.error('Failed to get group members:', error);
    res.status(500).json({ error: 'Failed to get group members' });
  }
});

// Add user to group
router.post('/groups/:id/members', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO dealerboard_group_members (id, group_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      [id, req.params.id, userId]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to add user to group:', error);
    res.status(500).json({ error: 'Failed to add user to group' });
  }
});

// Remove user from group
router.delete('/groups/:id/members/:userId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await pool.query(
      'DELETE FROM dealerboard_group_members WHERE group_id = $1 AND user_id = $2',
      [req.params.id, req.params.userId]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to remove user from group:', error);
    res.status(500).json({ error: 'Failed to remove user from group' });
  }
});

// Get user's dealerboard groups
router.get('/users/:userId/groups', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.userId;
    const requestingUserId = req.user.id || req.user.userId;

    // Users can only access their own groups, or admins can access any
    if (userId !== requestingUserId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `SELECT dg.id, dg.name, dg.description
       FROM dealerboard_groups dg
       INNER JOIN dealerboard_group_members dgm ON dg.id = dgm.group_id
       WHERE dgm.user_id = $1 AND dg.is_active = true
       ORDER BY dg.name`,
      [userId]
    );

    const groups = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description
    }));

    res.json({ success: true, groups });
  } catch (error) {
    logger.error('Failed to get user groups:', error);
    res.status(500).json({ error: 'Failed to get user groups' });
  }
});

// ==================== COPY USER ====================

// Copy user (including dealerboard config)
router.post('/users/:userId/copy', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { username, email, firstName, lastName, copyAssignments, copySpeedDials } = req.body;
    const sourceUserId = req.params.userId;

    if (!username || !email || !firstName || !lastName) {
      return res.status(400).json({ error: 'Username, email, first name, and last name are required' });
    }

    // Get source user data
    const sourceUserResult = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [sourceUserId]
    );

    if (sourceUserResult.rows.length === 0) {
      return res.status(404).json({ error: 'Source user not found' });
    }

    const sourceUser = sourceUserResult.rows[0];

    // Create new user (this should be done via auth routes, but we'll return the data needed)
    // For now, we'll return the data structure that can be used to create the user
    const userData = {
      username,
      email,
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`,
      role: sourceUser.role || 'user',
      extension: sourceUser.extension || '',
      sipUri: sourceUser.sip_uri || '',
      employeeId: sourceUser.employee_id || '',
      department: sourceUser.department || '',
      isActive: true
    };

    // Get source user's dealerboard config if requested
    let assignments = [];
    let speedDials = [];

    if (copyAssignments) {
      const assignmentsResult = await pool.query(
        'SELECT * FROM dealerboard_button_assignments WHERE user_id = $1',
        [sourceUserId]
      );
      assignments = assignmentsResult.rows;
    }

    if (copySpeedDials) {
      const speedDialsResult = await pool.query(
        'SELECT name, number, description FROM dealerboard_speed_dials WHERE user_id = $1',
        [sourceUserId]
      );
      speedDials = speedDialsResult.rows;
    }

    res.json({
      success: true,
      userData,
      assignments,
      speedDials,
      message: 'User data ready for creation'
    });
  } catch (error) {
    logger.error('Failed to copy user:', error);
    res.status(500).json({ error: 'Failed to copy user' });
  }
});

// ==================== LINE OPERATIONS ====================

// Helper function to bridge active SIP calls to Matrix room
async function bridgeActiveSIPCallsToMatrixRoom(lineId, matrixRoomId) {
  try {
    const sipGateway = getSIPGateway();
    if (!sipGateway || !sipGateway.initialized) {
      return;
    }

    const ua = sipGateway.getUserAgent(lineId);
    if (!ua) {
      return;
    }

    const activeCalls = ua.getActiveCalls();
    const bridge = getSIPMatrixBridge();

    for (const call of activeCalls) {
      if (call.status === 'connected' && call.callId) {
        try {
          await bridge.bridgeCallToMatrixRoom(lineId, call.callId, matrixRoomId, {
            localSdp: call.localSdp,
            remoteSdp: call.remoteSdp,
            status: call.status
          });
          logger.info(`Bridged active SIP call to Matrix room`, {
            callId: call.callId,
            lineId,
            matrixRoomId
          });
        } catch (error) {
          logger.error(`Failed to bridge active SIP call:`, error);
        }
      }
    }

    // Set up callback for future call connections
    sipGateway.setCallConnectedCallback(lineId, async (callId, call) => {
      if (call.status === 'connected') {
        try {
          await bridge.bridgeCallToMatrixRoom(lineId, callId, matrixRoomId, {
            localSdp: call.localSdp,
            remoteSdp: call.remoteSdp,
            status: call.status
          });
          logger.info(`Auto-bridged newly connected SIP call to Matrix room`, {
            callId,
            lineId,
            matrixRoomId
          });
        } catch (error) {
          logger.error(`Failed to auto-bridge SIP call:`, error);
        }
      }
    });
  } catch (error) {
    logger.error(`Failed to bridge active SIP calls to Matrix room:`, error);
  }
}

// Helper function to ensure Matrix room exists for line usage
async function ensureMatrixRoomForLine(lineId, userId, sessionType = 'active') {
  try {
    const { matrixService } = require('../services/matrixService');
    const { getOrchestratorService } = require('../services/orchestratorService');
    
    // Get all active sessions for this line (both monitor and active calls)
    // Combine both dealerboard_line_sessions and dealerboard_monitor_sessions
    const lineSessions = await pool.query(
      `SELECT user_id FROM dealerboard_line_sessions
       WHERE private_wire_id = $1 AND ended_at IS NULL`,
      [lineId]
    );

    const monitorSessions = await pool.query(
      `SELECT user_id FROM dealerboard_monitor_sessions
       WHERE private_wire_id = $1 AND ended_at IS NULL`,
      [lineId]
    );

    // Combine unique users from both session types
    const allUserIds = new Set();
    lineSessions.rows.forEach(row => allUserIds.add(row.user_id));
    monitorSessions.rows.forEach(row => allUserIds.add(row.user_id));
    
    const activeUsers = Array.from(allUserIds);
    const minUsersForRoom = 3; // Create room when 3+ users are using the line

    let matrixRoomId = null;

    // If we have 2+ users, create/join Matrix room
    if (activeUsers.length >= minUsersForRoom) {
      // Check for existing room in either table
      const existingRoomLine = await pool.query(
        `SELECT matrix_room_id FROM dealerboard_line_sessions
         WHERE private_wire_id = $1 AND matrix_room_id IS NOT NULL AND ended_at IS NULL
         LIMIT 1`,
        [lineId]
      );

      const existingRoomMonitor = await pool.query(
        `SELECT matrix_room_id FROM dealerboard_monitor_sessions
         WHERE private_wire_id = $1 AND matrix_room_id IS NOT NULL AND ended_at IS NULL
         LIMIT 1`,
        [lineId]
      );

      const existingRoom = existingRoomLine.rows[0] || existingRoomMonitor.rows[0];

      if (existingRoom) {
        // Room already exists, join it
        matrixRoomId = existingRoom.matrix_room_id;
        
        // Get Matrix user ID and join room
        const matrixUserId = await matrixService.getMatrixUserId(userId);
        if (matrixUserId) {
          await matrixService.joinRoom(matrixRoomId, userId);
        }

        // Update session with room ID if not already set
        if (sessionType === 'active') {
          await pool.query(
            `UPDATE dealerboard_line_sessions
             SET matrix_room_id = $1
             WHERE private_wire_id = $2 AND user_id = $3 AND session_type = 'active' AND ended_at IS NULL`,
            [matrixRoomId, lineId, userId]
          );
        }
      } else {
        // Create new Matrix room via orchestrator
        const orchestratorService = getOrchestratorService();
        const privateWire = await pool.query(
          `SELECT line_label, mode FROM dealerboard_private_wires WHERE id = $1`,
          [lineId]
        );

        if (privateWire.rows.length > 0) {
          const lineInfo = privateWire.rows[0];
          const roomName = `${lineInfo.line_label}`;
          const roomTopic = `Communication room for ${lineInfo.line_label} (${lineInfo.mode} mode)`;

          // Get Matrix user IDs for all active users
          const matrixUserIds = [];
          for (const uid of activeUsers) {
            const muid = await matrixService.getMatrixUserId(uid);
            if (muid) {
              matrixUserIds.push(muid);
            }
          }

          // Create room through orchestrator and Matrix service
          const monitorGroupId = `line_${lineId}_${Date.now()}`;
          
          matrixRoomId = await matrixService.createGroupRoom(monitorGroupId, {
            name: roomName,
            description: roomTopic,
            members: matrixUserIds,
            participants: activeUsers
          });

          // Get room assignment info
          const roomAssignment = await pool.query(
            `SELECT homeserver_id, region FROM matrix_room_assignments WHERE room_id = $1`,
            [matrixRoomId]
          );

          const homeserverId = roomAssignment.rows[0]?.homeserver_id;

          // Update all line sessions (both active and monitor) with room ID
          await pool.query(
            `UPDATE dealerboard_line_sessions
             SET matrix_room_id = $1, last_activity = NOW()
             WHERE private_wire_id = $2 AND ended_at IS NULL`,
            [matrixRoomId, lineId]
          );

          await pool.query(
            `UPDATE dealerboard_monitor_sessions
             SET matrix_room_id = $1
             WHERE private_wire_id = $2 AND ended_at IS NULL`,
            [matrixRoomId, lineId]
          );

          // Track participants
          if (homeserverId) {
            for (const uid of activeUsers) {
              await orchestratorService.trackParticipant(matrixRoomId, uid, homeserverId);
            }
          }

          // Bridge any active SIP calls to the Matrix room
          await bridgeActiveSIPCallsToMatrixRoom(lineId, matrixRoomId);

          logger.info(`Created Matrix room for line usage`, {
            lineId,
            matrixRoomId,
            activeUsers: activeUsers.length,
            homeserverId
          });
        }
      }
    }

    return matrixRoomId;
  } catch (error) {
    logger.error('Failed to ensure Matrix room for line:', error);
    return null;
  }
}

// Call line (private wire)
router.post('/private-wires/:lineId/call', authenticateToken, async (req, res) => {
  try {
    const { lineId } = req.params;
    const { autoRing, hoot, digits } = req.body;
    const userId = req.user.id || req.user.userId;

    // Verify it's a private wire
    const lineCheck = await pool.query(
      `SELECT id FROM dealerboard_private_wires WHERE id = $1`,
      [lineId]
    );

    if (lineCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Private wire not found' });
    }

    // Create or update active session
    const sessionId = `active_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if user already has an active session
    const existingSession = await pool.query(
      `SELECT * FROM dealerboard_line_sessions 
       WHERE private_wire_id = $1 AND user_id = $2 AND session_type = 'active' AND ended_at IS NULL`,
      [lineId, userId]
    );

    if (existingSession.rows.length === 0) {
      // Create new active session
      await pool.query(
        `INSERT INTO dealerboard_line_sessions (id, private_wire_id, user_id, session_type)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (private_wire_id, user_id, session_type) DO UPDATE SET
           ended_at = NULL,
           last_activity = NOW()`,
        [sessionId, lineId, userId, 'active']
      );
    } else {
      // Update existing session
      await pool.query(
        `UPDATE dealerboard_line_sessions
         SET last_activity = NOW()
         WHERE private_wire_id = $1 AND user_id = $2 AND session_type = 'active' AND ended_at IS NULL`,
        [lineId, userId]
      );
    }

    // Get all active sessions to check if we should create Matrix room
    const allActiveSessions = await pool.query(
      `SELECT user_id FROM dealerboard_line_sessions
       WHERE private_wire_id = $1 AND ended_at IS NULL`,
      [lineId]
    );

    const activeUsers = allActiveSessions.rows.map(row => row.user_id);
    const minUsersForRoom = 3; // Create room when 3+ users are using the line

    // Ensure Matrix room exists for this line (if 3+ users)
    let matrixRoomId = null;
    if (activeUsers.length >= minUsersForRoom) {
      matrixRoomId = await ensureMatrixRoomForLine(lineId, userId, 'active');
    }

    // Get private wire details
    const privateWire = await pool.query(
      `SELECT uri_address, mode, sbc_details FROM dealerboard_private_wires WHERE id = $1`,
      [lineId]
    );

    if (privateWire.rows.length === 0) {
      return res.status(404).json({ error: 'Private wire not found' });
    }

    const wireInfo = privateWire.rows[0];
    let sipCallId = null;

    // Implement SIP call logic based on mode
    try {
      const sipGateway = getSIPGateway();
      if (sipGateway && sipGateway.initialized) {
        if (hoot) {
          // HOOT mode - immediate connection (no ringing)
          sipCallId = await sipGateway.makeCall(lineId, wireInfo.uri_address, {
            immediate: true,
            mode: 'HOOT'
          });
        } else if (autoRing) {
          // ARD mode - automatically ring far end
          sipCallId = await sipGateway.makeCall(lineId, wireInfo.uri_address, {
            autoRing: true,
            mode: 'ARD'
          });
        } else {
          // MRD mode - user can speak or signal later
          // Just prepare the line, don't initiate call yet
          logger.info(`MRD mode - line prepared for manual operation`, { lineId });
        }

        // Store SIP call ID in session
        if (sipCallId) {
          await pool.query(
            `UPDATE dealerboard_line_sessions
             SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{sipCallId}', $1::jsonb)
             WHERE id = $2`,
            [JSON.stringify(sipCallId), existingSession.rows[0]?.id || sessionId]
          );

          // Bridge SIP call to Matrix room if room exists
          if (matrixRoomId) {
            try {
              const sipGateway = getSIPGateway();
              const sipCall = sipGateway.getUserAgent(lineId)?.getCall(sipCallId);
              
              if (sipCall) {
                const bridge = getSIPMatrixBridge();
                await bridge.bridgeCallToMatrixRoom(lineId, sipCallId, matrixRoomId, {
                  localSdp: sipCall.localSdp,
                  remoteSdp: sipCall.remoteSdp,
                  status: sipCall.status
                });
                
                logger.info(`SIP call bridged to Matrix room`, {
                  callId: sipCallId,
                  lineId,
                  matrixRoomId
                });
              }
            } catch (error) {
              logger.error(`Failed to bridge SIP call to Matrix room:`, error);
              // Continue even if bridge fails
            }
          }
        }
      } else {
        logger.warn('SIP Gateway not available - call will be simulated');
      }
    } catch (error) {
      logger.error(`SIP call initiation failed for line ${lineId}:`, error);
      // Continue even if SIP fails - Matrix room still works
    }

    logger.info(`Call initiated on line ${lineId}`, { 
      autoRing, 
      hoot, 
      digits, 
      userId, 
      matrixRoomId,
      sipCallId,
      activeUsers: activeUsers.length
    });
    
    res.json({ 
      success: true, 
      message: 'Call initiated',
      matrixRoomId,
      sipCallId,
      activeUsers: activeUsers.length,
      sessionId: existingSession.rows[0]?.id || sessionId
    });
  } catch (error) {
    logger.error('Failed to call line:', error);
    res.status(500).json({ error: 'Failed to call line', details: error.message });
  }
});

// Legacy endpoint for backward compatibility
router.post('/lines/:lineId/call', authenticateToken, async (req, res) => {
  try {
    // Try private wire first
    const lineCheck = await pool.query(
      `SELECT id FROM dealerboard_private_wires WHERE id = $1`,
      [req.params.lineId]
    );

    if (lineCheck.rows.length > 0) {
      // Forward to private wire endpoint
      req.params.lineId = req.params.lineId;
      return require('./dealerboardRoutes').router.handle(req, res);
    }

    // Try DDI line
    const ddiCheck = await pool.query(
      `SELECT id FROM dealerboard_ddi_lines WHERE id = $1`,
      [req.params.lineId]
    );

    if (ddiCheck.rows.length > 0) {
      // DDI line - no Matrix room needed
      const { digits } = req.body;
      logger.info(`DDI call initiated on line ${req.params.lineId}`, { digits });
      return res.json({ success: true, message: 'DDI call initiated' });
    }

    return res.status(404).json({ error: 'Line not found' });
  } catch (error) {
    logger.error('Failed to call line:', error);
    res.status(500).json({ error: 'Failed to call line' });
  }
});

// Monitor line (private wire)
router.post('/private-wires/:lineId/monitor', authenticateToken, async (req, res) => {
  try {
    const { lineId } = req.params;
    const { enabled } = req.body;
    const userId = req.user.id || req.user.userId;

    if (enabled) {
      // Start monitoring
      const sessionId = `monitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Check if user is already monitoring this line
      const existingSession = await pool.query(
        `SELECT * FROM dealerboard_monitor_sessions 
         WHERE private_wire_id = $1 AND user_id = $2 AND ended_at IS NULL`,
        [lineId, userId]
      );

      if (existingSession.rows.length > 0) {
        return res.json({ 
          success: true, 
          message: 'Already monitoring this line',
          sessionId: existingSession.rows[0].id,
          matrixRoomId: existingSession.rows[0].matrix_room_id
        });
      }

      // Create monitor session
      await pool.query(
        `INSERT INTO dealerboard_monitor_sessions (id, private_wire_id, user_id)
         VALUES ($1, $2, $3)`,
        [sessionId, lineId, userId]
      );

      // Get all active monitor sessions for this line
      const activeSessions = await pool.query(
        `SELECT dms.*, u.username, u.display_name
         FROM dealerboard_monitor_sessions dms
         INNER JOIN users u ON dms.user_id = u.id
         WHERE dms.private_wire_id = $1 AND dms.ended_at IS NULL`,
        [lineId]
      );

      const monitoringUsers = activeSessions.rows.map(row => row.user_id);
      const minUsersForRoom = 2; // Create room when 2+ users are monitoring

      let matrixRoomId = null;

      // If we have 2+ users monitoring, create/join Matrix room
      if (monitoringUsers.length >= minUsersForRoom) {
        try {
          const { matrixService } = require('../services/matrixService');
          const { getOrchestratorService } = require('../services/orchestratorService');
          
          // Check if room already exists for this line
          const existingRoom = await pool.query(
            `SELECT matrix_room_id FROM dealerboard_monitor_sessions
             WHERE private_wire_id = $1 AND matrix_room_id IS NOT NULL AND ended_at IS NULL
             LIMIT 1`,
            [lineId]
          );

          if (existingRoom.rows.length > 0) {
            // Room already exists, join it
            matrixRoomId = existingRoom.rows[0].matrix_room_id;
            
            // Get Matrix user ID and join room
            const matrixUserId = await matrixService.getMatrixUserId(userId);
            if (matrixUserId) {
              await matrixService.joinRoom(matrixRoomId, userId);
            }
          } else {
            // Create new Matrix room via orchestrator
            const orchestratorService = getOrchestratorService();
            const privateWire = await pool.query(
              `SELECT line_label, mode FROM dealerboard_private_wires WHERE id = $1`,
              [lineId]
            );

            if (privateWire.rows.length > 0) {
              const lineInfo = privateWire.rows[0];
              const roomName = `Monitor: ${lineInfo.line_label}`;
              const roomTopic = `Monitoring session for ${lineInfo.line_label} (${lineInfo.mode} mode)`;

              // Get Matrix user IDs for all monitoring users
              const matrixUserIds = [];
              for (const uid of monitoringUsers) {
                const muid = await matrixService.getMatrixUserId(uid);
                if (muid) {
                  matrixUserIds.push(muid);
                }
              }

              // Create room through orchestrator and Matrix service
              // Use a unique group ID for this monitor session
              const monitorGroupId = `monitor_${lineId}_${Date.now()}`;
              
              matrixRoomId = await matrixService.createGroupRoom(monitorGroupId, {
                name: roomName,
                description: roomTopic,
                members: matrixUserIds,
                participants: monitoringUsers
              });

              // Get room assignment info (homeserver and region)
              const roomAssignment = await pool.query(
                `SELECT homeserver_id, region FROM matrix_room_assignments WHERE room_id = $1`,
                [matrixRoomId]
              );

              const homeserverId = roomAssignment.rows[0]?.homeserver_id;

              // Update all monitor sessions with room ID
              await pool.query(
                `UPDATE dealerboard_monitor_sessions
                 SET matrix_room_id = $1
                 WHERE private_wire_id = $2 AND ended_at IS NULL`,
                [matrixRoomId, lineId]
              );

              // Track participants (already done in createGroupRoom, but ensure it's done)
              if (homeserverId) {
                for (const uid of monitoringUsers) {
                  await orchestratorService.trackParticipant(matrixRoomId, uid, homeserverId);
                }
              }

              logger.info(`Created Matrix room for monitor session`, {
                lineId,
                matrixRoomId,
                monitoringUsers: monitoringUsers.length,
                homeserverId: decision.homeserverId
              });
            }
          }
        } catch (error) {
          logger.error('Failed to create/join Matrix room for monitor session:', error);
          // Continue even if Matrix room creation fails
        }
      }

      res.json({ 
        success: true,
        sessionId,
        matrixRoomId,
        monitoringUsers: monitoringUsers.length
      });
    } else {
      // Stop monitoring
      await pool.query(
        `UPDATE dealerboard_monitor_sessions
         SET ended_at = NOW()
         WHERE private_wire_id = $1 AND user_id = $2 AND ended_at IS NULL`,
        [lineId, userId]
      );

      // Get remaining active sessions
      const remainingSessions = await pool.query(
        `SELECT * FROM dealerboard_monitor_sessions
         WHERE private_wire_id = $1 AND ended_at IS NULL`,
        [lineId]
      );

      // If no one is monitoring, we could optionally archive/leave the Matrix room
      // For now, we'll keep the room active in case users rejoin

      res.json({ 
        success: true,
        remainingMonitors: remainingSessions.rows.length
      });
    }
  } catch (error) {
    logger.error('Failed to toggle monitor:', error);
    res.status(500).json({ error: 'Failed to toggle monitor', details: error.message });
  }
});

// Send signal (ringing signal to far end)
router.post('/private-wires/:lineId/signal', authenticateToken, async (req, res) => {
  try {
    const { lineId } = req.params;
    const userId = req.user.id || req.user.userId;

    // Get private wire details
    const privateWire = await pool.query(
      `SELECT uri_address, mode, sbc_details FROM dealerboard_private_wires WHERE id = $1`,
      [lineId]
    );

    if (privateWire.rows.length === 0) {
      return res.status(404).json({ error: 'Private wire not found' });
    }

    const wireInfo = privateWire.rows[0];

    // Only MRD mode supports manual signal
    if (wireInfo.mode !== 'MRD') {
      return res.status(400).json({ 
        error: 'Signal can only be sent on MRD (Manual Ring Down) lines' 
      });
    }

    // Send ringing signal via SIP
    try {
      const sipGateway = getSIPGateway();
      if (sipGateway && sipGateway.initialized) {
        await sipGateway.sendRingingSignal(lineId, wireInfo.uri_address);
        logger.info(`Ringing signal sent for line ${lineId}`, { userId });
        res.json({ success: true, message: 'Ringing signal sent' });
      } else {
        logger.warn('SIP Gateway not available - signal simulated');
        res.json({ success: true, message: 'Signal simulated (SIP not available)' });
      }
    } catch (error) {
      logger.error(`Failed to send ringing signal for line ${lineId}:`, error);
      res.status(500).json({ error: 'Failed to send signal', details: error.message });
    }
  } catch (error) {
    logger.error('Failed to send signal:', error);
    res.status(500).json({ error: 'Failed to send signal' });
  }
});

// Legacy endpoint
router.post('/lines/:lineId/signal', authenticateToken, async (req, res) => {
  try {
    const { lineId } = req.params;
    
    // Try private wire first
    const lineCheck = await pool.query(
      `SELECT id FROM dealerboard_private_wires WHERE id = $1`,
      [lineId]
    );

    if (lineCheck.rows.length > 0) {
      req.params.lineId = lineId;
      return require('./dealerboardRoutes').router.handle(req, res);
    }

    return res.status(404).json({ error: 'Line not found' });
  } catch (error) {
    logger.error('Failed to send signal:', error);
    res.status(500).json({ error: 'Failed to send signal' });
  }
});

// End call (private wire)
router.post('/private-wires/:lineId/end', authenticateToken, async (req, res) => {
  try {
    const { lineId } = req.params;
    const userId = req.user.id || req.user.userId;

    // Get session to retrieve SIP call ID
    const session = await pool.query(
      `SELECT id, metadata FROM dealerboard_line_sessions
       WHERE private_wire_id = $1 AND user_id = $2 AND session_type = 'active' AND ended_at IS NULL
       ORDER BY started_at DESC LIMIT 1`,
      [lineId, userId]
    );

    // End SIP call if active
    if (session.rows.length > 0) {
      const sipCallId = session.rows[0].metadata?.sipCallId;
      if (sipCallId) {
        try {
          // End bridge first
          const bridge = getSIPMatrixBridge();
          await bridge.endBridge(sipCallId);
          
          // End SIP call
          const sipGateway = getSIPGateway();
          if (sipGateway && sipGateway.initialized) {
            await sipGateway.endCall(lineId, sipCallId);
            logger.info(`SIP call ended for line ${lineId}`, { userId, sipCallId });
          }
        } catch (error) {
          logger.error(`Failed to end SIP call for line ${lineId}:`, error);
          // Continue to end session even if SIP end fails
        }
      }
    }

    // End active session
    await pool.query(
      `UPDATE dealerboard_line_sessions
       SET ended_at = NOW()
       WHERE private_wire_id = $1 AND user_id = $2 AND session_type = 'active' AND ended_at IS NULL`,
      [lineId, userId]
    );

    // Get remaining active sessions (both active calls and monitor)
    const remainingLineSessions = await pool.query(
      `SELECT user_id FROM dealerboard_line_sessions
       WHERE private_wire_id = $1 AND ended_at IS NULL`,
      [lineId]
    );

    const remainingMonitorSessions = await pool.query(
      `SELECT user_id FROM dealerboard_monitor_sessions
       WHERE private_wire_id = $1 AND ended_at IS NULL`,
      [lineId]
    );

    const allRemainingUsers = new Set();
    remainingLineSessions.rows.forEach(row => allRemainingUsers.add(row.user_id));
    remainingMonitorSessions.rows.forEach(row => allRemainingUsers.add(row.user_id));

    res.json({ 
      success: true,
      remainingUsers: allRemainingUsers.size
    });
  } catch (error) {
    logger.error('Failed to end call:', error);
    res.status(500).json({ error: 'Failed to end call', details: error.message });
  }
});

// Legacy endpoint for backward compatibility
router.post('/lines/:lineId/end', authenticateToken, async (req, res) => {
  try {
    const { lineId } = req.params;
    const userId = req.user.id || req.user.userId;

    // Try private wire first
    const lineCheck = await pool.query(
      `SELECT id FROM dealerboard_private_wires WHERE id = $1`,
      [lineId]
    );

    if (lineCheck.rows.length > 0) {
      // Forward to private wire endpoint
      req.params.lineId = lineId;
      return require('./dealerboardRoutes').router.handle(req, res);
    }

    // Try DDI line
    const ddiCheck = await pool.query(
      `SELECT id FROM dealerboard_ddi_lines WHERE id = $1`,
      [lineId]
    );

    if (ddiCheck.rows.length > 0) {
      // DDI line - just log
      logger.info(`DDI call ended on line ${lineId}`);
      return res.json({ success: true, message: 'DDI call ended' });
    }

    return res.status(404).json({ error: 'Line not found' });
  } catch (error) {
    logger.error('Failed to end call:', error);
    res.status(500).json({ error: 'Failed to end call' });
  }
});

// Send DTMF (for DDI lines)
router.post('/ddi-lines/:lineId/dtmf', authenticateToken, async (req, res) => {
  try {
    const { lineId } = req.params;
    const { digit, callId } = req.body;
    const userId = req.user.id || req.user.userId;

    if (!digit) {
      return res.status(400).json({ error: 'Digit required' });
    }

    // Get DDI line details
    const ddiLine = await pool.query(
      `SELECT id, line_number, sbc_details FROM dealerboard_ddi_lines WHERE id = $1`,
      [lineId]
    );

    if (ddiLine.rows.length === 0) {
      return res.status(404).json({ error: 'DDI line not found' });
    }

    // Get active call for this line
    const session = await pool.query(
      `SELECT metadata FROM dealerboard_line_sessions
       WHERE private_wire_id = $1 AND user_id = $2 AND ended_at IS NULL
       ORDER BY started_at DESC LIMIT 1`,
      [lineId, userId]
    );

    const sipCallId = callId || (session.rows[0]?.metadata?.sipCallId);

    if (!sipCallId) {
      return res.status(400).json({ error: 'No active call found. Please initiate a call first.' });
    }

    // Send DTMF via SIP
    try {
      const sipGateway = getSIPGateway();
      if (sipGateway && sipGateway.initialized) {
        await sipGateway.sendDTMF(lineId, sipCallId, digit);
        logger.info(`DTMF digit ${digit} sent for DDI line ${lineId}`, { userId, sipCallId });
        res.json({ success: true, message: `DTMF digit ${digit} sent` });
      } else {
        logger.warn('SIP Gateway not available - DTMF simulated');
        res.json({ success: true, message: `DTMF digit ${digit} simulated (SIP not available)` });
      }
    } catch (error) {
      logger.error(`Failed to send DTMF for line ${lineId}:`, error);
      res.status(500).json({ error: 'Failed to send DTMF', details: error.message });
    }
  } catch (error) {
    logger.error('Failed to send DTMF:', error);
    res.status(500).json({ error: 'Failed to send DTMF' });
  }
});

// Legacy endpoint
router.post('/lines/:lineId/dtmf', authenticateToken, async (req, res) => {
  try {
    const { lineId } = req.params;
    const { digit, callId } = req.body;
    const userId = req.user.id || req.user.userId;
    
    if (!digit) {
      return res.status(400).json({ error: 'Digit required' });
    }

    // Try DDI line first
    const ddiCheck = await pool.query(
      `SELECT id FROM dealerboard_ddi_lines WHERE id = $1`,
      [lineId]
    );

    if (ddiCheck.rows.length > 0) {
      req.params.lineId = lineId;
      return require('./dealerboardRoutes').router.handle(req, res);
    }

    // Try private wire (DTMF not typically used, but allow it)
    const wireCheck = await pool.query(
      `SELECT id FROM dealerboard_private_wires WHERE id = $1`,
      [lineId]
    );

    if (wireCheck.rows.length > 0) {
      // For private wires, we might send DTMF during an active call
      const session = await pool.query(
        `SELECT metadata FROM dealerboard_line_sessions
         WHERE private_wire_id = $1 AND user_id = $2 AND ended_at IS NULL
         ORDER BY started_at DESC LIMIT 1`,
        [lineId, userId]
      );

      const sipCallId = callId || (session.rows[0]?.metadata?.sipCallId);

      if (!sipCallId) {
        return res.status(400).json({ error: 'No active call found' });
      }

      const sipGateway = getSIPGateway();
      if (sipGateway && sipGateway.initialized) {
        await sipGateway.sendDTMF(lineId, sipCallId, digit);
        res.json({ success: true, message: `DTMF digit ${digit} sent` });
      } else {
        res.json({ success: true, message: `DTMF digit ${digit} simulated` });
      }
    }

    return res.status(404).json({ error: 'Line not found' });
  } catch (error) {
    logger.error('Failed to send DTMF:', error);
    res.status(500).json({ error: 'Failed to send DTMF' });
  }
});

// Speed dial call
router.post('/speed-dial/:speedDialId/call', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const speedDialId = req.params.speedDialId;
    
    // Get speed dial details
    const speedDialResult = await pool.query(
      `SELECT id, name, number, description FROM dealerboard_speed_dials 
       WHERE id = $1 AND user_id = $2`,
      [speedDialId, userId]
    );

    if (speedDialResult.rows.length === 0) {
      return res.status(404).json({ error: 'Speed dial not found' });
    }

    const speedDial = speedDialResult.rows[0];
    const targetNumber = speedDial.number;

    if (!targetNumber || targetNumber.trim() === '') {
      return res.status(400).json({ error: 'Speed dial number is empty' });
    }

    // Find a DDI line for this user
    // First check user preferences for default DDI line
    const prefsResult = await pool.query(
      `SELECT default_ddi_line_id FROM dealerboard_user_preferences WHERE user_id = $1`,
      [userId]
    );

    let ddiLineId = null;
    let ddiLine = null;

    // Try default DDI line first
    if (prefsResult.rows[0]?.default_ddi_line_id) {
      const defaultDdiResult = await pool.query(
        `SELECT id, line_number, sbc_details, connection_details
         FROM dealerboard_ddi_lines
         WHERE id = $1 AND is_active = true`,
        [prefsResult.rows[0].default_ddi_line_id]
      );

      if (defaultDdiResult.rows.length > 0) {
        ddiLine = defaultDdiResult.rows[0];
        ddiLineId = ddiLine.id;
        logger.info(`Using default DDI line for speed dial`, { userId, ddiLineId });
      }
    }

    // Fallback to button assignments if no default set
    if (!ddiLineId) {
      const ddiAssignmentResult = await pool.query(
        `SELECT dba.ddi_line_id, ddl.id, ddl.line_number, ddl.sbc_details, ddl.connection_details
         FROM dealerboard_button_assignments dba
         INNER JOIN dealerboard_ddi_lines ddl ON dba.ddi_line_id = ddl.id
         WHERE dba.user_id = $1 
           AND dba.assignment_type = 'ddiLine'
           AND ddl.is_active = true
         ORDER BY dba.created_at DESC
         LIMIT 1`,
        [userId]
      );

      if (ddiAssignmentResult.rows.length > 0) {
        ddiLine = ddiAssignmentResult.rows[0];
        ddiLineId = ddiLine.id;
        logger.info(`Using assigned DDI line for speed dial`, { userId, ddiLineId });
      }
    }

    if (!ddiLineId) {
      return res.status(400).json({ 
        error: 'No DDI line available. Please assign a DDI line to a button or set a default DDI line in your preferences.' 
      });
    }

    // Create a call session for tracking
    const sessionId = `speeddial_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Note: DDI lines use dealerboard_line_sessions with private_wire_id pointing to the DDI line
    // For speed dial calls, we'll track it as an active session
    await pool.query(
      `INSERT INTO dealerboard_line_sessions (id, private_wire_id, user_id, session_type, metadata)
       VALUES ($1, $2, $3, 'active', $4::jsonb)`,
      [
        sessionId,
        ddiLineId, // Using private_wire_id field to store DDI line ID for speed dial calls
        userId,
        JSON.stringify({
          speedDialId: speedDialId,
          speedDialName: speedDial.name,
          targetNumber: targetNumber,
          callType: 'speedDial'
        })
      ]
    );

    let sipCallId = null;

    // Initiate SIP call on DDI line (this provides dial tone)
    try {
      const sipGateway = getSIPGateway();
      if (sipGateway && sipGateway.initialized) {
        // For DDI lines, we need to initiate a call to get dial tone
        // The target URI should be the SBC gateway or a dial tone provider
        const sbcDetails = ddiLine.sbc_details || {};
        const connectionDetails = ddiLine.connection_details || {};
        
        // Get the gateway URI from connection details or SBC details
        const gatewayUri = connectionDetails.gatewayUri || 
                          sbcDetails.gatewayUri || 
                          `sip:${sbcDetails.host || 'localhost'}`;

        // Check if there's already an active call on this DDI line
        const existingSession = await pool.query(
          `SELECT metadata FROM dealerboard_line_sessions
           WHERE private_wire_id = $1 AND user_id = $2 AND ended_at IS NULL
           ORDER BY started_at DESC LIMIT 1`,
          [ddiLineId, userId]
        );

        const existingSipCallId = existingSession.rows[0]?.metadata?.sipCallId;

        if (existingSipCallId) {
          // Reuse existing call
          sipCallId = existingSipCallId;
          logger.info(`Reusing existing call ${sipCallId} for speed dial`, {
            speedDialId,
            ddiLineId
          });
        } else {
          // Initiate new call to get dial tone
          // For DDI lines, we call the gateway which provides dial tone
          sipCallId = await sipGateway.makeCall(ddiLineId, gatewayUri, {
            autoAnswer: false, // Don't auto-answer, we need to dial digits
            mode: 'DDI'
          });

          // Update session with SIP call ID
          await pool.query(
            `UPDATE dealerboard_line_sessions
             SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{sipCallId}', $1::jsonb)
             WHERE id = $2`,
            [JSON.stringify(sipCallId), sessionId]
          );

          // Wait for call to be connected before sending digits
          // Set up callback to send DTMF when call connects
          const ua = sipGateway.getUserAgent(ddiLineId);
          if (ua) {
            const originalCallback = ua.onCallConnected;
            ua.onCallConnected = async (callId, callInfo) => {
              // Call original callback if it exists
              if (originalCallback) {
                await originalCallback(callId, callInfo);
              }

              // If this is our speed dial call, send DTMF digits
              if (callId === sipCallId && callInfo.status === 'connected') {
                try {
                  // Send each digit of the target number
                  const digits = targetNumber.replace(/\D/g, ''); // Remove non-digits
                  
                  // Wait a moment for call to fully establish
                  await new Promise(resolve => setTimeout(resolve, 500));
                  
                  for (let i = 0; i < digits.length; i++) {
                    const digit = digits[i];
                    await new Promise(resolve => setTimeout(resolve, 200)); // 200ms between digits
                    
                    await sipGateway.sendDTMF(ddiLineId, sipCallId, digit);
                    logger.debug(`Sent DTMF digit ${digit} for speed dial call`, {
                      speedDialId,
                      ddiLineId,
                      sipCallId
                    });
                  }

                  logger.info(`Speed dial number ${targetNumber} dialed via DDI line ${ddiLineId}`, {
                    speedDialId,
                    speedDialName: speedDial.name,
                    ddiLineId,
                    sipCallId,
                    userId
                  });
                } catch (error) {
                  logger.error(`Failed to send DTMF digits for speed dial:`, error);
                }
              }
            };
          }

          // Fallback: If call doesn't connect within 3 seconds, try sending digits anyway
          // (Some gateways may provide dial tone immediately)
          setTimeout(async () => {
            try {
              const ua = sipGateway.getUserAgent(ddiLineId);
              const call = ua?.getCall(sipCallId);
              
              if (call && (call.status === 'connected' || call.status === 'ringing')) {
                // Send digits
                const digits = targetNumber.replace(/\D/g, '');
                
                for (let i = 0; i < digits.length; i++) {
                  const digit = digits[i];
                  await new Promise(resolve => setTimeout(resolve, 200));
                  await sipGateway.sendDTMF(ddiLineId, sipCallId, digit);
                }

                logger.info(`Speed dial number ${targetNumber} dialed (fallback)`, {
                  speedDialId,
                  ddiLineId,
                  sipCallId
                });
              }
            } catch (error) {
              logger.error(`Failed to send DTMF digits (fallback):`, error);
            }
          }, 3000);
        }

        // If we have an existing call, send digits immediately
        if (existingSipCallId) {
          setTimeout(async () => {
            try {
              const digits = targetNumber.replace(/\D/g, '');
              
              for (let i = 0; i < digits.length; i++) {
                const digit = digits[i];
                await new Promise(resolve => setTimeout(resolve, 200));
                await sipGateway.sendDTMF(ddiLineId, sipCallId, digit);
              }

              logger.info(`Speed dial number ${targetNumber} dialed on existing call`, {
                speedDialId,
                ddiLineId,
                sipCallId
              });
            } catch (error) {
              logger.error(`Failed to send DTMF digits on existing call:`, error);
            }
          }, 500);
        }

        logger.info(`Speed dial call initiated`, {
          speedDialId,
          speedDialName: speedDial.name,
          targetNumber,
          ddiLineId,
          sipCallId,
          userId
        });

        res.json({ 
          success: true, 
          message: `Calling ${speedDial.name} (${targetNumber})`,
          speedDialId: speedDialId,
          speedDialName: speedDial.name,
          targetNumber: targetNumber,
          ddiLineId: ddiLineId,
          sipCallId: sipCallId,
          sessionId: sessionId
        });
      } else {
        logger.warn('SIP Gateway not available - speed dial call simulated');
        res.json({ 
          success: true, 
          message: `Speed dial call to ${speedDial.name} (${targetNumber}) simulated (SIP not available)`,
          speedDialId: speedDialId,
          speedDialName: speedDial.name,
          targetNumber: targetNumber,
          ddiLineId: ddiLineId,
          sessionId: sessionId
        });
      }
    } catch (error) {
      logger.error(`Failed to initiate speed dial call:`, error);
      
      // Clean up session on error
      await pool.query(
        `UPDATE dealerboard_line_sessions SET ended_at = NOW() WHERE id = $1`,
        [sessionId]
      );

      res.status(500).json({ 
        error: 'Failed to initiate speed dial call', 
        details: error.message 
      });
    }
  } catch (error) {
    logger.error('Failed to call speed dial:', error);
    res.status(500).json({ error: 'Failed to call speed dial', details: error.message });
  }
});

module.exports = router;

