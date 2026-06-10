const { pool } = require('../pool');

async function getRoomAssignmentByRoomId(roomId) {
  const result = await pool.query(
    `SELECT mra.*, mh.server_name, mh.region, mh.base_url
     FROM matrix_room_assignments mra
     LEFT JOIN matrix_homeservers mh ON mra.homeserver_id = mh.id
     WHERE mra.room_id = $1`,
    [roomId]
  );
  return result.rows[0] || null;
}

async function listAllRoomAssignments() {
  const result = await pool.query(
    `SELECT mra.*, mh.server_name, mh.region, mh.base_url
     FROM matrix_room_assignments mra
     LEFT JOIN matrix_homeservers mh ON mra.homeserver_id = mh.id
     ORDER BY mra.created_at DESC`
  );
  return result.rows;
}

function mapRoomAssignmentInfo(row) {
  if (!row) return null;
  return {
    homeserverId: row.homeserver_id,
    homeserverName: row.server_name,
    region: row.region,
    baseUrl: row.base_url,
  };
}

module.exports = {
  getRoomAssignmentByRoomId,
  listAllRoomAssignments,
  mapRoomAssignmentInfo,
};
