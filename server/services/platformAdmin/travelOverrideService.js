const crypto = require('crypto');
const { getUserByIdOrUsername } = require('../../services/databaseService');
const {
  mapTravelOverrideRow,
  listTravelOverrides,
  locationExists,
  revokeActiveTravelOverridesForUser,
  insertTravelOverride,
  getTravelOverrideById,
  revokeTravelOverrideById,
} = require('../../db/platformAdmin/travelOverrides');
const { PlatformAdminError } = require('./errors');

async function listOverrides(query) {
  const activeOnly = String(query?.activeOnly ?? 'true').toLowerCase() !== 'false';
  const username = query?.username ? String(query.username) : null;
  const userId = query?.userId ? String(query.userId) : null;

  const rows = await listTravelOverrides({ activeOnly, username, userId });
  return { success: true, overrides: rows.map(mapTravelOverrideRow) };
}

async function createOverride(body, createdBy) {
  const username = body?.username ? String(body.username) : null;
  const userIdInput = body?.userId ? String(body.userId) : null;
  const travelLocationId = body?.travelLocationId ? String(body.travelLocationId) : null;
  const startsAt = body?.startsAt ? new Date(body.startsAt) : new Date();
  const expiresAtRaw = body?.expiresAt ? new Date(body.expiresAt) : null;
  const forceOrigin = body.forceOrigin === true;
  const reason = body?.reason !== undefined ? String(body.reason || '') : null;

  if (!travelLocationId) throw new PlatformAdminError(400, 'travelLocationId is required');
  if (!expiresAtRaw || Number.isNaN(expiresAtRaw.getTime())) {
    throw new PlatformAdminError(400, 'expiresAt is required and must be a valid datetime');
  }
  if (expiresAtRaw.getTime() <= Date.now()) {
    throw new PlatformAdminError(400, 'expiresAt must be in the future');
  }

  const userIdentifier = userIdInput || username;
  if (!userIdentifier) throw new PlatformAdminError(400, 'userId or username is required');

  const dbUser = await getUserByIdOrUsername(userIdentifier);
  if (!dbUser) throw new PlatformAdminError(404, 'User not found');

  if (!(await locationExists(travelLocationId))) {
    throw new PlatformAdminError(400, 'travelLocationId not found');
  }

  await revokeActiveTravelOverridesForUser(String(dbUser.id), createdBy);

  const id = `travel_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  await insertTravelOverride([
    id,
    String(dbUser.id),
    travelLocationId,
    startsAt,
    expiresAtRaw,
    forceOrigin,
    reason,
    createdBy,
  ]);

  const row = await getTravelOverrideById(id);
  return { status: 201, body: { success: true, override: mapTravelOverrideRow(row) } };
}

async function revokeOverride(id, revokedBy) {
  const overrideId = String(id || '').trim();
  if (!overrideId) throw new PlatformAdminError(400, 'id is required');

  const revoked = await revokeTravelOverrideById(overrideId, revokedBy);
  if (!revoked) throw new PlatformAdminError(404, 'Override not found');
  return { success: true };
}

module.exports = {
  listOverrides,
  createOverride,
  revokeOverride,
};
