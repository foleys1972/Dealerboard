const logger = require('../../utils/logger');
const {
  getRoomAssignmentByRoomId,
  listAllRoomAssignments,
  mapRoomAssignmentInfo,
} = require('../../db/matrix/roomAssignments');

async function lookupAssignmentForRoom(roomId) {
  try {
    const row = await getRoomAssignmentByRoomId(roomId);
    return mapRoomAssignmentInfo(row);
  } catch (error) {
    logger.warn('Failed to get room assignment info:', error.message);
    return null;
  }
}

async function listRoomMappings(matrixService) {
  const rows = await listAllRoomAssignments();
  const assignmentsMap = new Map();
  for (const row of rows) {
    assignmentsMap.set(row.room_id, mapRoomAssignmentInfo(row));
  }

  const rooms = Array.from(matrixService.roomMappings.entries()).map(([groupId, roomId]) => ({
    groupId,
    roomId,
    assignment: assignmentsMap.get(roomId) || null,
  }));

  return { roomCount: rooms.length, rooms };
}

module.exports = {
  lookupAssignmentForRoom,
  listRoomMappings,
};
