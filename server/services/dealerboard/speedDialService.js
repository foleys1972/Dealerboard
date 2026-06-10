const crypto = require('crypto');
const {
  listSpeedDialsByUserId,
  insertSpeedDial,
  getSpeedDialOwner,
  updateSpeedDial,
  deleteSpeedDialById,
  mapSpeedDialRow,
} = require('../../db/dealerboard/speedDials');
const { isAdminRole } = require('./validators');
const { LineOperationError } = require('./errors');

function resolveTargetUserId({ requesterId, requesterRole, targetUserIdRaw, queryUserIdRaw }) {
  let targetUserId = requesterId;
  if (isAdminRole(requesterRole) && (targetUserIdRaw || queryUserIdRaw)) {
    targetUserId = targetUserIdRaw || queryUserIdRaw;
  }
  return targetUserId;
}

function mapPgError(error) {
  if (error.code === '23503') {
    throw new LineOperationError(400, 'Invalid user ID');
  }
  if (error.code === '23505') {
    throw new LineOperationError(409, 'Speed dial already exists');
  }
  throw error;
}

async function listSpeedDials({ requesterId, requesterRole, queryUserIdRaw }) {
  const targetUserId = resolveTargetUserId({
    requesterId,
    requesterRole,
    queryUserIdRaw,
  });

  if (!targetUserId) {
    throw new LineOperationError(400, 'User ID is required');
  }

  const rows = await listSpeedDialsByUserId(targetUserId);
  return { success: true, speedDials: rows.map(mapSpeedDialRow) };
}

async function createSpeedDial(body, { requesterId, requesterRole }) {
  const { name, number, description, userId: targetUserIdRaw } = body;

  if (!name || !number) {
    throw new LineOperationError(400, 'Name and number are required');
  }

  const userId = resolveTargetUserId({
    requesterId,
    requesterRole,
    targetUserIdRaw,
  });

  if (!userId) {
    throw new LineOperationError(400, 'User ID is required');
  }

  let id;
  try {
    id = crypto.randomUUID();
  } catch {
    id = `speed-dial-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  try {
    const row = await insertSpeedDial([id, userId, name, number, description || null]);
    return {
      success: true,
      id: row.id,
      speedDial: mapSpeedDialRow(row),
    };
  } catch (error) {
    mapPgError(error);
  }
}

async function updateSpeedDialRecord(id, body, requesterId) {
  const { name, number, description } = body;

  const ownerId = await getSpeedDialOwner(id);
  if (!ownerId) {
    throw new LineOperationError(404, 'Speed dial not found');
  }
  if (ownerId !== requesterId) {
    throw new LineOperationError(403, 'Access denied');
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
    throw new LineOperationError(400, 'No updates provided');
  }

  updates.push('updated_at = NOW()');
  values.push(id);
  await updateSpeedDial(id, updates, values);

  return { success: true };
}

async function deleteSpeedDial(id, requesterId) {
  const ownerId = await getSpeedDialOwner(id);
  if (!ownerId) {
    throw new LineOperationError(404, 'Speed dial not found');
  }
  if (ownerId !== requesterId) {
    throw new LineOperationError(403, 'Access denied');
  }

  await deleteSpeedDialById(id);
  return { success: true };
}

module.exports = {
  listSpeedDials,
  createSpeedDial,
  updateSpeedDialRecord,
  deleteSpeedDial,
};
