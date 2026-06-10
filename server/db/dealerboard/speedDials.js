const { pool } = require('../pool');

async function getSpeedDialForUser(speedDialId, userId) {
  const result = await pool.query(
    `SELECT id, name, number, description FROM dealerboard_speed_dials
     WHERE id = $1 AND user_id = $2`,
    [speedDialId, userId]
  );
  return result.rows[0] || null;
}

async function resolveDdiLineForUser(userId) {
  const prefsResult = await pool.query(
    `SELECT default_ddi_line_id FROM dealerboard_user_preferences WHERE user_id = $1`,
    [userId]
  );

  if (prefsResult.rows[0]?.default_ddi_line_id) {
    const defaultDdiResult = await pool.query(
      `SELECT id, line_number, country_code, sbc_details, connection_details, sip_route_id
       FROM dealerboard_ddi_lines
       WHERE id = $1 AND is_active = true`,
      [prefsResult.rows[0].default_ddi_line_id]
    );
    if (defaultDdiResult.rows.length > 0) {
      return { ddiLine: defaultDdiResult.rows[0], source: 'default' };
    }
  }

  const ddiAssignmentResult = await pool.query(
    `SELECT dba.ddi_line_id, ddl.id, ddl.line_number, ddl.country_code, ddl.sbc_details, ddl.connection_details, ddl.sip_route_id
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
    return { ddiLine: ddiAssignmentResult.rows[0], source: 'assignment' };
  }

  return { ddiLine: null, source: null };
}

async function listSpeedDialsByUserId(userId) {
  const result = await pool.query(
    `SELECT * FROM dealerboard_speed_dials WHERE user_id = $1 ORDER BY name`,
    [userId]
  );
  return result.rows;
}

async function insertSpeedDial(values) {
  const result = await pool.query(
    `INSERT INTO dealerboard_speed_dials (id, user_id, name, number, description)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    values
  );
  return result.rows[0];
}

async function getSpeedDialOwner(speedDialId) {
  const result = await pool.query(
    'SELECT user_id FROM dealerboard_speed_dials WHERE id = $1',
    [speedDialId]
  );
  return result.rows[0]?.user_id || null;
}

async function updateSpeedDial(id, updates, values) {
  await pool.query(
    `UPDATE dealerboard_speed_dials SET ${updates.join(', ')} WHERE id = $${values.length}`,
    values
  );
}

async function deleteSpeedDialById(id) {
  await pool.query('DELETE FROM dealerboard_speed_dials WHERE id = $1', [id]);
}

function mapSpeedDialRow(row) {
  return {
    id: row.id,
    name: row.name,
    number: row.number,
    description: row.description,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  getSpeedDialForUser,
  resolveDdiLineForUser,
  listSpeedDialsByUserId,
  insertSpeedDial,
  getSpeedDialOwner,
  updateSpeedDial,
  deleteSpeedDialById,
  mapSpeedDialRow,
};
