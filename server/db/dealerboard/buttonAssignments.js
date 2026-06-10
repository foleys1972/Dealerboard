const { pool } = require('../pool');

async function getAssignmentsByUserId(userId) {
  const result = await pool.query(
    `SELECT * FROM dealerboard_button_assignments WHERE user_id = $1 ORDER BY page_number, button_number`,
    [userId]
  );
  return result.rows;
}

async function getGroupNamesByIds(groupIds) {
  if (!groupIds.length) return new Map();
  const result = await pool.query(
    `SELECT id, name FROM groups WHERE id = ANY($1::text[])`,
    [groupIds]
  );
  return new Map(result.rows.map((g) => [String(g.id), g.name]));
}

async function getUserDisplayNamesByIds(userIds) {
  if (!userIds.length) return new Map();
  const result = await pool.query(
    `SELECT id, username, display_name, first_name, last_name FROM users WHERE id = ANY($1::text[])`,
    [userIds]
  );
  const map = new Map();
  for (const u of result.rows) {
    const label = u.display_name ||
      `${u.first_name || ''} ${u.last_name || ''}`.trim() ||
      u.username ||
      u.id;
    map.set(String(u.id), label);
  }
  return map;
}

async function findAssignment(userId, pageNumber, buttonNumber) {
  const result = await pool.query(
    'SELECT id FROM dealerboard_button_assignments WHERE user_id = $1 AND page_number = $2 AND button_number = $3',
    [userId, pageNumber, buttonNumber]
  );
  return result.rows[0] || null;
}

async function upsertAssignment({
  id,
  userId,
  pageNumber,
  buttonNumber,
  assignmentType,
  lineId,
  ddiLineId,
  speedDialId,
  broadcastId,
  groupId,
  contactUserId,
  metadata,
  isUpdate,
}) {
  if (isUpdate) {
    await pool.query(
      `UPDATE dealerboard_button_assignments
       SET assignment_type = $1, line_id = $2, ddi_line_id = $3, speed_dial_id = $4,
           broadcast_id = $5, group_id = $6, contact_user_id = $7, metadata = $8::jsonb, updated_at = NOW()
       WHERE id = $9`,
      [
        assignmentType,
        lineId,
        ddiLineId,
        speedDialId,
        broadcastId,
        groupId,
        contactUserId,
        JSON.stringify(metadata || {}),
        id,
      ]
    );
    return id;
  }

  await pool.query(
    `INSERT INTO dealerboard_button_assignments
     (id, user_id, page_number, button_number, assignment_type, line_id, ddi_line_id, speed_dial_id, broadcast_id, group_id, contact_user_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
    [
      id,
      userId,
      pageNumber,
      buttonNumber,
      assignmentType,
      lineId,
      ddiLineId,
      speedDialId,
      broadcastId,
      groupId,
      contactUserId,
      JSON.stringify(metadata || {}),
    ]
  );
  return id;
}

async function deleteAssignment(userId, pageNumber, buttonNumber) {
  await pool.query(
    'DELETE FROM dealerboard_button_assignments WHERE user_id = $1 AND page_number = $2 AND button_number = $3',
    [userId, pageNumber, buttonNumber]
  );
}

async function createInlineSpeedDial({ id, userId, name, number }) {
  await pool.query(
    `INSERT INTO dealerboard_speed_dials (id, user_id, name, number, description, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [id, userId, name, number, null, JSON.stringify({ createdBy: 'admin-portal' })]
  );
}

async function getGroupAssignmentCheck(groupId) {
  const result = await pool.query('SELECT id FROM groups WHERE id = $1 LIMIT 1', [String(groupId)]);
  return result.rows[0] || null;
}

async function getBroadcastAssignmentCheck(broadcastId) {
  const result = await pool.query(
    `SELECT id, name, call_mode FROM groups WHERE id = $1 LIMIT 1`,
    [String(broadcastId)]
  );
  return result.rows[0] || null;
}

async function migrateAssignmentsToBroadcast(wireId, groupId) {
  await pool.query(
    `UPDATE dealerboard_button_assignments
     SET assignment_type = 'broadcast',
         broadcast_id = $2,
         line_id = NULL,
         ddi_line_id = NULL,
         updated_at = NOW()
     WHERE line_id = $1
       AND assignment_type IN ('privateWire', 'line')`,
    [wireId, groupId]
  );
}

async function getAssignmentRefCounts(lineIds) {
  const result = await pool.query(
    `SELECT line_id, COUNT(*)::int as cnt
     FROM dealerboard_button_assignments
     WHERE line_id = ANY($1::text[])
     GROUP BY line_id`,
    [lineIds]
  );
  return result.rows;
}

async function getAssignmentRefDetails(lineIds, limit = 200) {
  const result = await pool.query(
    `SELECT a.line_id,
            a.user_id,
            COALESCE(u.username, a.user_id) AS username,
            a.page_number,
            a.button_number,
            a.assignment_type
     FROM dealerboard_button_assignments a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.line_id = ANY($1::text[])
     ORDER BY a.line_id, a.user_id, a.page_number, a.button_number
     LIMIT $2`,
    [lineIds, limit]
  );
  return result.rows;
}

async function getLineAssignmentsForUser(userId) {
  const result = await pool.query(
    `SELECT page_number, button_number, assignment_type, line_id, ddi_line_id
     FROM dealerboard_button_assignments
     WHERE user_id = $1
       AND assignment_type IN ('privateWire', 'ddiLine', 'line')`,
    [userId]
  );
  return result.rows;
}

module.exports = {
  getAssignmentsByUserId,
  getGroupNamesByIds,
  getUserDisplayNamesByIds,
  findAssignment,
  upsertAssignment,
  deleteAssignment,
  createInlineSpeedDial,
  getGroupAssignmentCheck,
  getBroadcastAssignmentCheck,
  migrateAssignmentsToBroadcast,
  getAssignmentRefCounts,
  getAssignmentRefDetails,
  getLineAssignmentsForUser,
};
