const { matrixService } = require('../matrixService');
const { getDirectContactById } = require('../databaseService');
const {
  mapChatRoomRow,
  listChatRoomsForUser,
  getChatRoomForUser,
  archiveChatRoom,
} = require('../../db/matrix/chatRooms');
const { isAdminRole } = require('../dealerboard/validators');
const { MatrixRouteError } = require('./errors');

async function createChatRoom(body, currentUserId) {
  const { name, type, members } = body;

  if (!name || !type || !['direct', 'group'].includes(type)) {
    throw new MatrixRouteError(400, 'Invalid room data. Name and type (direct/group) are required.');
  }

  if (type === 'direct' && (!members || members.length !== 1)) {
    throw new MatrixRouteError(400, 'Direct chat requires exactly one other member');
  }

  const memberMatrixIds = [];
  for (const userId of members || []) {
    const matrixId = await matrixService.getMatrixUserId(userId);
    if (matrixId) memberMatrixIds.push(matrixId);
  }

  const result = await matrixService.createChatRoom({
    name,
    type,
    members: memberMatrixIds,
    createdBy: currentUserId,
  });

  return {
    success: true,
    ...result,
    message: 'Chat room created successfully',
  };
}

async function listChatRooms(currentUserId, includeArchivedRaw) {
  const includeArchived = includeArchivedRaw === 'true';
  const rows = await listChatRoomsForUser(currentUserId, includeArchived);
  return {
    success: true,
    rooms: rows.map(mapChatRoomRow),
  };
}

async function archiveRoom(roomId, currentUserId) {
  const room = await getChatRoomForUser(roomId, currentUserId);
  if (!room) throw new MatrixRouteError(403, 'Access denied');

  await archiveChatRoom(roomId);
  return { success: true, message: 'Room archived successfully' };
}

async function getOrCreateDirectRoomForContact(contactId, currentUserId, requesterRole) {
  const contact = await getDirectContactById(contactId);
  if (!contact) throw new MatrixRouteError(404, 'Contact not found');

  if (contact.ownerId !== currentUserId && !isAdminRole(requesterRole)) {
    throw new MatrixRouteError(403, 'Not authorized to access this contact');
  }

  const currentUserMatrixId = await matrixService.getMatrixUserId(currentUserId);
  let contactUserMatrixId = null;

  if (contact.contactUserId) {
    contactUserMatrixId = await matrixService.getMatrixUserId(contact.contactUserId);
  } else if (contact.uri) {
    contactUserMatrixId = contact.metadata?.matrixUserId || null;
  }

  if (!currentUserMatrixId) {
    throw new MatrixRouteError(400, 'Current user does not have a Matrix account');
  }
  if (!contactUserMatrixId) {
    throw new MatrixRouteError(
      400,
      'Contact does not have a Matrix account. External contacts need Matrix user ID in metadata.'
    );
  }

  const roomId = await matrixService.getOrCreateDirectRoom(
    currentUserId,
    contact.contactUserId || contact.id,
    currentUserMatrixId,
    contactUserMatrixId
  );

  return {
    success: true,
    roomId,
    contactId,
    currentUserId,
    contactUserId: contact.contactUserId,
  };
}

module.exports = {
  createChatRoom,
  listChatRooms,
  archiveRoom,
  getOrCreateDirectRoomForContact,
};
