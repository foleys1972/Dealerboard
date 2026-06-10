/** Allowed values in Postgres groups.call_mode CHECK constraint */
const DB_CALL_MODES = new Set(['FIRST_ANSWER', 'REMAIN_GROUP', 'conference', 'broadcast']);

/**
 * Map API/UI call modes to database call_mode values.
 */
function normalizeCallModeForDb(callMode) {
  if (callMode && DB_CALL_MODES.has(callMode)) {
    return callMode;
  }

  const key = String(callMode || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');

  switch (key) {
    case 'group_call':
    case 'group':
    case 'remain_group':
      return 'REMAIN_GROUP';
    case 'hunt':
    case 'first_answer':
    case 'firstanswer':
    case 'first_responder_1to1':
    case 'firstresponder1to1':
      return 'FIRST_ANSWER';
    case 'conference':
      return 'conference';
    case 'broadcast':
      return 'broadcast';
    default:
      return 'REMAIN_GROUP';
  }
}

function isGroupCallMode(callMode) {
  const db = normalizeCallModeForDb(callMode);
  return db === 'REMAIN_GROUP' || db === 'FIRST_ANSWER';
}

function isBroadcastCallMode(callMode) {
  return normalizeCallModeForDb(callMode) === 'broadcast';
}

module.exports = {
  DB_CALL_MODES,
  normalizeCallModeForDb,
  isGroupCallMode,
  isBroadcastCallMode,
};
