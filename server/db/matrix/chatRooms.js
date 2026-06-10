const { pool } = require('../pool');

function mapChatRoomRow(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    name: row.name,
    type: row.type,
    createdBy: row.created_by,
    members: row.members || [],
    lastActivity: row.last_activity,
    isArchived: row.is_archived,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  };
}

async function listChatRoomsForUser(userId, includeArchived) {
  const query = includeArchived
    ? `SELECT * FROM matrix_chat_rooms WHERE created_by = $1 OR $2 = ANY(members) ORDER BY last_activity DESC NULLS LAST`
    : `SELECT * FROM matrix_chat_rooms WHERE (created_by = $1 OR $2 = ANY(members)) AND is_archived = false ORDER BY last_activity DESC NULLS LAST`;

  const result = await pool.query(query, [userId, userId]);
  return result.rows;
}

async function getChatRoomForUser(roomId, userId) {
  const result = await pool.query(
    `SELECT * FROM matrix_chat_rooms WHERE room_id = $1 AND (created_by = $2 OR $2 = ANY(members))`,
    [roomId, userId]
  );
  return result.rows[0] || null;
}

async function archiveChatRoom(roomId) {
  await pool.query(
    `UPDATE matrix_chat_rooms SET is_archived = true, archived_at = NOW() WHERE room_id = $1`,
    [roomId]
  );
}

module.exports = {
  mapChatRoomRow,
  listChatRoomsForUser,
  getChatRoomForUser,
  archiveChatRoom,
};
