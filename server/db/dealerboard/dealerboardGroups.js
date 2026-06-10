const { pool } = require('../pool');

async function listAllWithMemberCounts() {
  const result = await pool.query(
    `SELECT dg.*, COUNT(dgm.user_id) as member_count
     FROM dealerboard_groups dg
     LEFT JOIN dealerboard_group_members dgm ON dg.id = dgm.group_id
     GROUP BY dg.id
     ORDER BY dg.name`
  );
  return result.rows;
}

async function insertGroup(id, name, description) {
  await pool.query(
    `INSERT INTO dealerboard_groups (id, name, description)
     VALUES ($1, $2, $3)`,
    [id, name, description || null]
  );
}

async function updateGroup(id, updates, values) {
  await pool.query(
    `UPDATE dealerboard_groups SET ${updates.join(', ')} WHERE id = $${values.length}`,
    values
  );
}

async function deleteGroupById(id) {
  await pool.query('DELETE FROM dealerboard_groups WHERE id = $1', [id]);
}

async function getGroupMembers(groupId) {
  const result = await pool.query(
    `SELECT u.id, u.username, u.first_name, u.last_name, u.display_name, u.email
     FROM dealerboard_group_members dgm
     INNER JOIN users u ON dgm.user_id = u.id
     WHERE dgm.group_id = $1
     ORDER BY u.display_name, u.username`,
    [groupId]
  );
  return result.rows;
}

async function addGroupMember(id, groupId, userId) {
  await pool.query(
    `INSERT INTO dealerboard_group_members (id, group_id, user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (group_id, user_id) DO NOTHING`,
    [id, groupId, userId]
  );
}

async function findSiblingMemberForSync(groupId, userId) {
  const result = await pool.query(
    `SELECT user_id FROM dealerboard_group_members
     WHERE group_id = $1 AND user_id != $2
     ORDER BY created_at
     LIMIT 1`,
    [groupId, userId]
  );
  return result.rows[0]?.user_id || null;
}

async function removeGroupMember(groupId, userId) {
  await pool.query(
    'DELETE FROM dealerboard_group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
}

async function getActiveGroupsForUser(userId) {
  const result = await pool.query(
    `SELECT dg.id, dg.name, dg.description
     FROM dealerboard_groups dg
     INNER JOIN dealerboard_group_members dgm ON dg.id = dgm.group_id
     WHERE dgm.user_id = $1 AND dg.is_active = true
     ORDER BY dg.name`,
    [userId]
  );
  return result.rows;
}

function mapGroupRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    memberCount: parseInt(row.member_count, 10) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMemberRow(row) {
  return {
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: row.display_name,
    email: row.email,
  };
}

function mapUserGroupRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
  };
}

module.exports = {
  listAllWithMemberCounts,
  insertGroup,
  updateGroup,
  deleteGroupById,
  getGroupMembers,
  addGroupMember,
  findSiblingMemberForSync,
  removeGroupMember,
  getActiveGroupsForUser,
  mapGroupRow,
  mapMemberRow,
  mapUserGroupRow,
};
