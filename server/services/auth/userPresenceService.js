const logger = require('../../utils/logger');
const { listIntercomDndByUserIds } = require('../../db/dealerboard/userPreferences');
const { listActiveIntercomGroupSessions } = require('../../db/auth/callSessions');

function collectInCallUserIds(rows) {
  const inCallUserIds = new Set();

  for (const row of rows || []) {
    if (row.initiator_user_id) inCallUserIds.add(String(row.initiator_user_id));
    if (row.first_answerer_user_id) inCallUserIds.add(String(row.first_answerer_user_id));

    const parts = Array.isArray(row.participants) ? row.participants : [];
    for (const p of parts) {
      const pid = p?.userId || p?.user_id || p?.id;
      if (pid) inCallUserIds.add(String(pid));
    }
  }

  return inCallUserIds;
}

async function loadAdminPresenceMaps(userDbIds) {
  let intercomDndByUserId = new Map();
  let inCallUserIds = new Set();

  try {
    if (userDbIds.length > 0) {
      intercomDndByUserId = await listIntercomDndByUserIds(userDbIds);
    }
  } catch (e) {
    logger.debug('Failed to load intercom DND preferences for users', e?.message || e);
  }

  try {
    const rows = await listActiveIntercomGroupSessions();
    inCallUserIds = collectInCallUserIds(rows);
  } catch (e) {
    logger.debug('Failed to load active intercom/group call sessions', e?.message || e);
  }

  return { intercomDndByUserId, inCallUserIds };
}

module.exports = {
  loadAdminPresenceMaps,
  collectInCallUserIds,
};
