import api from './api';

/**
 * Parse intercom button slots from GET /api/dealerboard/config/:userId (page 0 assignments).
 * Matches Admin Portal Configure Buttons → Intercom.
 */
export function parseIntercomAssignments(assignments = {}) {
  const readGroupId = (section, index, idKey) => {
    const row = assignments?.[section]?.[String(index)] || assignments?.[section]?.[index];
    if (!row) return null;
    return row[idKey] || row.groupId || row.broadcastId || row.lineId || null;
  };

  const readContactId = (index) => {
    const row = assignments?.contacts?.[String(index)] || assignments?.contacts?.[index];
    if (!row) return null;
    return row.contactId || row.userId || row.contactUserId || null;
  };

  const readLabel = (section, index) => {
    const row = assignments?.[section]?.[String(index)] || assignments?.[section]?.[index];
    return row?.label || null;
  };

  const broadcastSlots = Array.from({ length: 8 }, (_, i) => {
    const index = i + 1;
    return {
      index,
      groupId: readGroupId('broadcasts', index, 'broadcastId'),
      label: readLabel('broadcasts', index),
    };
  });

  const groupCallSlots = Array.from({ length: 10 }, (_, i) => {
    const index = i + 1;
    return {
      index,
      groupId: readGroupId('groups', index, 'groupId'),
      label: readLabel('groups', index),
    };
  });

  const contactSlots = Array.from({ length: 16 }, (_, i) => {
    const index = i + 1;
    return {
      index,
      contactUserId: readContactId(index),
      label: readLabel('contacts', index),
    };
  });

  return { broadcastSlots, groupCallSlots, contactSlots };
}

export async function fetchIntercomButtonLayout(userId) {
  if (!userId) {
    return parseIntercomAssignments({});
  }
  const response = await api.get(`/api/dealerboard/config/${encodeURIComponent(userId)}`);
  const assignments = response.data?.assignments || {};
  return parseIntercomAssignments(assignments);
}

export function assignedGroupIdsFromSlots(slots = []) {
  return slots
    .map((s) => s.groupId)
    .filter((id) => id != null && String(id).trim() !== '');
}

export function assignedContactIdsFromSlots(slots = []) {
  return slots
    .map((s) => s.contactUserId)
    .filter((id) => id != null && String(id).trim() !== '');
}
