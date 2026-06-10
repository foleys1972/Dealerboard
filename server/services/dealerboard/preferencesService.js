const { getActiveDdiLine } = require('../../db/dealerboard/ddiLines');
const {
  getUserPreferences,
  preferencesExist,
  insertUserPreferences,
  updateUserPreferences,
  mapPreferencesResponse,
} = require('../../db/dealerboard/userPreferences');
const { isAdminRole } = require('./validators');
const { LineOperationError } = require('./errors');

const UPDATE_SUCCESS_MESSAGE = 'Preferences updated. User must log out and back in to see changes.';

function resolveTargetUserId({ paramUserId, requestingUserId, requesterRole }) {
  if (!isAdminRole(requesterRole) && paramUserId && paramUserId !== requestingUserId) {
    throw new LineOperationError(403, 'Access denied');
  }

  return (isAdminRole(requesterRole) && paramUserId) ? paramUserId : requestingUserId;
}

function buildMergedPreferences({ preferences, viewingKey, ringingTone }) {
  return {
    ...(preferences || {}),
    ...(viewingKey !== undefined ? { viewingKey } : {}),
    ...(ringingTone !== undefined ? { ringingTone } : {}),
  };
}

async function validateDefaultDdiLine(defaultDdiLineId) {
  if (defaultDdiLineId === undefined || defaultDdiLineId === null) return;

  const ddiLine = await getActiveDdiLine(defaultDdiLineId);
  if (!ddiLine) {
    throw new LineOperationError(400, 'Invalid or inactive DDI line');
  }
}

async function updatePreferences(body, { paramUserId, requestingUserId, requesterRole }) {
  const targetUserId = resolveTargetUserId({ paramUserId, requestingUserId, requesterRole });
  const {
    audibleRinging,
    buttonColors,
    preferences,
    defaultDdiLineId,
    viewingKey,
    ringingTone,
  } = body;

  await validateDefaultDdiLine(defaultDdiLineId);

  const mergedPreferences = buildMergedPreferences({ preferences, viewingKey, ringingTone });
  const exists = await preferencesExist(targetUserId);

  if (exists) {
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (audibleRinging !== undefined) {
      updates.push(`audible_ringing = $${paramCount++}`);
      values.push(audibleRinging);
    }
    if (buttonColors !== undefined) {
      updates.push(`button_colors = $${paramCount++}`);
      values.push(JSON.stringify(buttonColors));
    }
    if (preferences !== undefined || viewingKey !== undefined || ringingTone !== undefined) {
      updates.push(`preferences = $${paramCount++}`);
      values.push(JSON.stringify(mergedPreferences));
    }
    if (defaultDdiLineId !== undefined) {
      updates.push(`default_ddi_line_id = $${paramCount++}`);
      values.push(defaultDdiLineId || null);
    }

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      values.push(targetUserId);
      await updateUserPreferences(targetUserId, updates, values);
    }
  } else {
    await insertUserPreferences([
      targetUserId,
      audibleRinging !== undefined ? audibleRinging : true,
      JSON.stringify(buttonColors || {}),
      JSON.stringify(mergedPreferences),
      defaultDdiLineId || null,
    ]);
  }

  return { success: true, message: UPDATE_SUCCESS_MESSAGE };
}

async function getPreferences(userId) {
  const row = await getUserPreferences(userId);
  return {
    success: true,
    preferences: mapPreferencesResponse(row),
  };
}

module.exports = {
  updatePreferences,
  getPreferences,
};
