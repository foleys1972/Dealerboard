const crypto = require('crypto');
const logger = require('../../utils/logger');
const { resolveUserDbId } = require('../../db/dealerboard/helpers');
const { syncDealerboardAssignmentsFromUser } = require('../../db/dealerboard/configGroups');
const {
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
} = require('../../db/dealerboard/dealerboardGroups');
const { isAdminRole } = require('./validators');
const { LineOperationError } = require('./errors');

async function listGroups() {
  const rows = await listAllWithMemberCounts();
  return { success: true, groups: rows.map(mapGroupRow) };
}

async function createGroup(body) {
  const { name, description } = body;

  if (!name) {
    throw new LineOperationError(400, 'Group name is required');
  }

  const id = crypto.randomUUID();
  await insertGroup(id, name, description);

  return { success: true, id };
}

async function updateGroupRecord(id, body) {
  const { name, description, isActive } = body;

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
    throw new LineOperationError(400, 'No updates provided');
  }

  updates.push('updated_at = NOW()');
  values.push(id);
  await updateGroup(id, updates, values);

  return { success: true };
}

async function deleteGroup(id) {
  await deleteGroupById(id);
  return { success: true };
}

async function listGroupMembers(groupId) {
  const rows = await getGroupMembers(groupId);
  return { success: true, members: rows.map(mapMemberRow) };
}

async function addMember(groupId, rawUserId) {
  if (!rawUserId) {
    throw new LineOperationError(400, 'User ID is required');
  }

  const userId = await resolveUserDbId(rawUserId);
  const id = crypto.randomUUID();

  await addGroupMember(id, groupId, userId);

  const siblingUserId = await findSiblingMemberForSync(groupId, userId);
  let syncedFrom = null;

  if (siblingUserId) {
    const copied = await syncDealerboardAssignmentsFromUser(siblingUserId, userId);
    syncedFrom = siblingUserId;
    logger.info(`Synced ${copied} dealerboard assignments to user ${userId} from group member ${syncedFrom}`);
  }

  return { success: true, syncedAssignmentsFrom: syncedFrom };
}

async function removeMember(groupId, userId) {
  await removeGroupMember(groupId, userId);
  return { success: true };
}

async function getUserGroups({ targetUserIdRaw, requestingUserIdRaw, requesterRole }) {
  if (targetUserIdRaw !== requestingUserIdRaw && !isAdminRole(requesterRole)) {
    throw new LineOperationError(403, 'Access denied');
  }

  const rows = await getActiveGroupsForUser(targetUserIdRaw);
  return { success: true, groups: rows.map(mapUserGroupRow) };
}

module.exports = {
  listGroups,
  createGroup,
  updateGroupRecord,
  deleteGroup,
  listGroupMembers,
  addMember,
  removeMember,
  getUserGroups,
};
