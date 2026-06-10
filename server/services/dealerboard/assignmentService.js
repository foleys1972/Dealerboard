const crypto = require('crypto');
const logger = require('../../utils/logger');
const {
  getAssignmentsByUserId,
  getGroupNamesByIds,
  getUserDisplayNamesByIds,
  findAssignment,
  upsertAssignment,
  deleteAssignment,
  createInlineSpeedDial,
  getGroupAssignmentCheck,
  getBroadcastAssignmentCheck,
} = require('../../db/dealerboard/buttonAssignments');
const { getUserPreferences } = require('../../db/dealerboard/userPreferences');
const {
  getDealerboardConfigGroup,
  shouldPropagateDealerboardAssignment,
} = require('../../db/dealerboard/configGroups');
const { resolveUserDbId } = require('../../db/dealerboard/helpers');
const { maybeSeedDefaultAssignments } = require('./autoSeedService');
const { LineOperationError } = require('./errors');

function mapIntercomAssignmentRow(row) {
  let section;
  let buttonNum;

  if (row.button_number <= 8) {
    section = 'broadcast';
    buttonNum = row.button_number;
  } else if (row.button_number <= 18) {
    section = 'group';
    buttonNum = row.button_number - 8;
  } else if (row.button_number <= 34) {
    section = 'contact';
    buttonNum = row.button_number - 18;
  } else {
    return null;
  }

  let assignmentType = row.assignment_type;
  if (assignmentType !== 'broadcast') {
    if (assignmentType === 'groupCall' || (section === 'group' && row.group_id)) {
      assignmentType = 'groupCall';
    } else if (assignmentType === 'directContact' || (section === 'contact' && row.contact_user_id)) {
      assignmentType = 'directContact';
    }
  }

  const sectionKey = section === 'broadcast' ? 'broadcasts' : section === 'group' ? 'groups' : 'contacts';
  return {
    sectionKey,
    buttonNum,
    value: {
      id: row.id,
      assignmentType,
      broadcastId: assignmentType === 'broadcast' ? row.broadcast_id : null,
      groupId: assignmentType === 'groupCall' ? row.group_id : null,
      contactId: assignmentType === 'directContact' ? row.contact_user_id : null,
      userId: assignmentType === 'directContact' ? row.contact_user_id : null,
    },
  };
}

function buildAssignmentsStructure(rows) {
  const assignments = {};

  for (const row of rows) {
    if (row.page_number === 0) {
      const mapped = mapIntercomAssignmentRow(row);
      if (!mapped) continue;
      if (!assignments[mapped.sectionKey]) assignments[mapped.sectionKey] = {};
      assignments[mapped.sectionKey][mapped.buttonNum] = mapped.value;
    } else {
      if (!assignments[row.page_number]) assignments[row.page_number] = {};
      assignments[row.page_number][row.button_number] = {
        id: row.id,
        assignmentType: row.assignment_type,
        lineId: row.line_id,
        ddiLineId: row.ddi_line_id,
        speedDialId: row.speed_dial_id,
        broadcastId: row.broadcast_id,
        groupId: row.group_id,
        contactId: row.contact_user_id,
        userId: row.contact_user_id,
        metadata: row.metadata || {},
      };
    }
  }

  return assignments;
}

async function enrichIntercomAssignmentNames(assignments) {
  const groupIds = new Set();
  const contactUserIds = new Set();

  for (const sectionKey of ['broadcasts', 'groups']) {
    const section = assignments[sectionKey];
    if (!section || typeof section !== 'object') continue;
    for (const row of Object.values(section)) {
      const gid = row?.groupId || row?.broadcastId;
      if (gid) groupIds.add(String(gid));
    }
  }

  const contactsSection = assignments.contacts;
  if (contactsSection && typeof contactsSection === 'object') {
    for (const row of Object.values(contactsSection)) {
      const uid = row?.contactId || row?.userId;
      if (uid) contactUserIds.add(String(uid));
    }
  }

  const groupNameById = await getGroupNamesByIds(Array.from(groupIds));
  const userNameById = await getUserDisplayNamesByIds(Array.from(contactUserIds));

  for (const sectionKey of ['broadcasts', 'groups']) {
    const section = assignments[sectionKey];
    if (!section || typeof section !== 'object') continue;
    for (const row of Object.values(section)) {
      const gid = row?.groupId || row?.broadcastId;
      if (gid && groupNameById.has(String(gid))) {
        row.label = groupNameById.get(String(gid));
      }
    }
  }

  if (contactsSection && typeof contactsSection === 'object') {
    for (const row of Object.values(contactsSection)) {
      const uid = row?.contactId || row?.userId;
      if (uid && userNameById.has(String(uid))) {
        row.label = userNameById.get(String(uid));
      }
    }
  }
}

function formatUserPreferences(prefsRow) {
  if (!prefsRow) {
    return {
      audibleRinging: true,
      buttonColors: {},
      preferences: {},
      viewingKey: false,
      ringingTone: 'default',
      defaultDdiLineId: null,
    };
  }

  const prefsData = prefsRow.preferences || {};
  return {
    audibleRinging: prefsRow.audible_ringing,
    buttonColors: prefsRow.button_colors || {},
    preferences: prefsData,
    viewingKey: prefsData.viewingKey || false,
    ringingTone: prefsData.ringingTone || 'default',
    defaultDdiLineId: prefsRow.default_ddi_line_id || null,
  };
}

async function getDealerboardConfig({ userIdRaw, requestingUserIdRaw, requesterRole }) {
  if (!userIdRaw) {
    throw new LineOperationError(400, 'User ID is required');
  }

  const userId = await resolveUserDbId(userIdRaw);
  const requestingUserId = await resolveUserDbId(requestingUserIdRaw);

  const isAdmin = requesterRole === 'platform_admin' || requesterRole === 'tenant_admin' || requesterRole === 'admin';
  if (userId !== requestingUserId && !isAdmin) {
    throw new LineOperationError(403, 'Access denied');
  }

  // First-time users get a board auto-populated from their groups/contacts so
  // they don't face an empty grid. Seed-once and best-effort (never throws).
  await maybeSeedDefaultAssignments(userId);

  const rows = await getAssignmentsByUserId(userId);
  const assignments = buildAssignmentsStructure(rows);

  try {
    await enrichIntercomAssignmentNames(assignments);
  } catch (enrichErr) {
    logger.debug('Intercom assignment name enrichment skipped:', enrichErr?.message || enrichErr);
  }

  const prefsRow = await getUserPreferences(userId);
  const configGroup = await getDealerboardConfigGroup(userId);

  return {
    success: true,
    assignments,
    preferences: formatUserPreferences(prefsRow),
    dealerboardGroup: configGroup.groupId
      ? {
          id: configGroup.groupId,
          name: configGroup.groupName,
          memberCount: configGroup.memberIds.length,
        }
      : null,
  };
}

function resolveIntercomButtonMapping({ section, buttonNumber, pageNumber }) {
  if (!section) return { pageNumber, buttonNumber };

  let actualButtonNumber;
  if (section === 'broadcast') {
    actualButtonNumber = parseInt(buttonNumber, 10);
  } else if (section === 'group') {
    actualButtonNumber = 8 + parseInt(buttonNumber, 10);
  } else if (section === 'contact') {
    actualButtonNumber = 18 + parseInt(buttonNumber, 10);
  } else {
    throw new LineOperationError(400, 'Invalid section. Must be broadcast, group, or contact');
  }

  return { pageNumber: 0, buttonNumber: actualButtonNumber };
}

function normalizeAssignmentType(assignmentType) {
  if (assignmentType === 'line') return 'privateWire';
  if (assignmentType === 'speed_dial') return 'speedDial';
  return assignmentType;
}

async function setButtonAssignment(body, requester) {
  const {
    pageNumber,
    buttonNumber,
    assignmentType,
    lineId,
    ddiLineId,
    speedDialId,
    broadcastId,
    targetUserId,
    section,
    groupId,
    contactId,
    contactUserId,
    userId: legacyUserIdField,
    applyToGroup,
    metadata,
  } = body;

  const isAdmin = requester.role === 'platform_admin' || requester.role === 'tenant_admin' || requester.role === 'admin';
  const rawUserId = (isAdmin && targetUserId) ? targetUserId : (requester.id || requester.userId);
  const userId = await resolveUserDbId(rawUserId);

  const intercomMapping = section
    ? resolveIntercomButtonMapping({ section, buttonNumber, pageNumber })
    : { pageNumber, buttonNumber };

  const actualPageNumber = intercomMapping.pageNumber;
  const actualButtonNumber = intercomMapping.buttonNumber;

  if ((actualPageNumber === undefined || actualPageNumber === null) || !actualButtonNumber || !assignmentType) {
    throw new LineOperationError(400, 'Missing required fields');
  }

  if (actualPageNumber === 0) {
    if (actualButtonNumber < 1 || actualButtonNumber > 34) {
      throw new LineOperationError(400, 'Invalid button number for Intercom (must be 1-34)');
    }
  } else if (actualPageNumber < 1 || actualPageNumber > 10 || actualButtonNumber < 1 || actualButtonNumber > 28) {
    throw new LineOperationError(400, 'Invalid page or button number');
  }

  const normalizedType = normalizeAssignmentType(assignmentType);

  let finalLineId = lineId || null;
  let finalDdiLineId = ddiLineId || null;
  let finalSpeedDialId = speedDialId || null;
  let finalBroadcastId = broadcastId || null;
  let finalGroupId = null;
  let finalContactUserId = null;
  let finalMetadata = (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) ? metadata : {};

  if (normalizedType === 'groupCall') {
    finalGroupId = groupId || null;
    if (!finalGroupId) throw new LineOperationError(400, 'Group ID required for group call assignment');
    const groupCheck = await getGroupAssignmentCheck(finalGroupId);
    if (!groupCheck) {
      throw new LineOperationError(400, 'Group not found', `No group with id "${finalGroupId}". Create the group in Admin → Groups first.`);
    }
  } else if (normalizedType === 'directContact') {
    finalContactUserId = contactId || contactUserId || legacyUserIdField || null;
    if (!finalContactUserId) throw new LineOperationError(400, 'Contact ID required for direct contact assignment');
  }

  if (normalizedType === 'viewingKey' || normalizedType === 'callForward') {
    finalLineId = null;
    finalDdiLineId = null;
    finalSpeedDialId = null;
    finalBroadcastId = null;
    finalGroupId = null;
    finalContactUserId = null;
  }

  if (normalizedType === 'callForward') {
    const fromId = finalMetadata?.from?.id ? String(finalMetadata.from.id) : '';
    const toTarget = finalMetadata?.to?.target ? String(finalMetadata.to.target).trim() : '';
    if (!fromId) throw new LineOperationError(400, 'Call forward: metadata.from.id is required');
    if (!toTarget) throw new LineOperationError(400, 'Call forward: metadata.to.target is required');
  }

  if ((normalizedType === 'privateWire' || normalizedType === 'ddiLine') && !finalLineId && !finalDdiLineId) {
    throw new LineOperationError(400, 'Line ID required for line assignment');
  }

  if (normalizedType === 'speedDial' && !finalSpeedDialId) {
    const number = finalMetadata?.number ? String(finalMetadata.number).trim() : '';
    if (!number) throw new LineOperationError(400, 'Speed dial requires speedDialId or metadata.number');
    const newId = crypto.randomUUID();
    const name = finalMetadata?.name ? String(finalMetadata.name) : `SpeedDial ${actualButtonNumber}-${actualPageNumber}`;
    await createInlineSpeedDial({ id: newId, userId, name, number });
    finalSpeedDialId = newId;
  }

  if (normalizedType === 'speedDial') {
    const label = finalMetadata?.label ? String(finalMetadata.label).trim() : '';
    if (label) finalMetadata.label = label;
    else delete finalMetadata.label;
  }

  if (normalizedType === 'broadcast' && !finalBroadcastId) {
    throw new LineOperationError(400, 'Broadcast ID required for broadcast assignment');
  }

  if (normalizedType === 'broadcast' && finalBroadcastId) {
    const broadcast = await getBroadcastAssignmentCheck(finalBroadcastId);
    if (!broadcast) {
      throw new LineOperationError(400, 'Broadcast group not found', `No group with id "${finalBroadcastId}". Create it in Admin → Broadcasts first.`);
    }
    const callMode = (broadcast.call_mode || '').toLowerCase();
    if (callMode !== 'broadcast') {
      throw new LineOperationError(
        400,
        'Selected group is not a broadcast',
        `"${broadcast.name || finalBroadcastId}" is call mode "${broadcast.call_mode || 'REMAIN_GROUP'}". Broadcast buttons require a group with call mode "broadcast".`
      );
    }
  }

  let userIdsToAssign = [userId];
  let dealerboardGroupMeta = null;

  if (shouldPropagateDealerboardAssignment({ section, pageNumber: actualPageNumber, applyToGroup })) {
    const configGroup = await getDealerboardConfigGroup(userId);
    if (configGroup.memberIds.length > 1) {
      userIdsToAssign = configGroup.memberIds;
      dealerboardGroupMeta = {
        id: configGroup.groupId,
        name: configGroup.groupName,
        memberCount: configGroup.memberIds.length,
      };
      logger.info(`Dealerboard group "${configGroup.groupName}": propagating assignment to ${userIdsToAssign.length} users`);
    }
  }

  const assignedIds = [];
  for (const targetUid of userIdsToAssign) {
    const existing = await findAssignment(targetUid, actualPageNumber, actualButtonNumber);
    const id = existing?.id || crypto.randomUUID();
    await upsertAssignment({
      id,
      userId: targetUid,
      pageNumber: actualPageNumber,
      buttonNumber: actualButtonNumber,
      assignmentType: normalizedType,
      lineId: finalLineId,
      ddiLineId: finalDdiLineId,
      speedDialId: finalSpeedDialId,
      broadcastId: finalBroadcastId,
      groupId: finalGroupId,
      contactUserId: finalContactUserId,
      metadata: finalMetadata,
      isUpdate: Boolean(existing),
    });
    assignedIds.push(id);
  }

  return {
    success: true,
    ids: assignedIds,
    assignedTo: userIdsToAssign.length,
    dealerboardGroup: dealerboardGroupMeta,
  };
}

async function removeButtonAssignment({ targetUserIdRaw, requestingUserIdRaw, requesterRole, pageNumber, buttonNumber, applyToGroup }) {
  const requestingUserId = await resolveUserDbId(requestingUserIdRaw);
  const targetUserId = await resolveUserDbId(targetUserIdRaw);

  const isAdmin = requesterRole === 'platform_admin' || requesterRole === 'tenant_admin' || requesterRole === 'admin';
  if (targetUserIdRaw !== requestingUserIdRaw && !isAdmin) {
    throw new LineOperationError(403, 'Access denied');
  }

  let userIdsToClear = [targetUserId];
  let dealerboardGroupMeta = null;

  if (shouldPropagateDealerboardAssignment({ section: null, pageNumber, applyToGroup })) {
    const configGroup = await getDealerboardConfigGroup(targetUserId);
    if (configGroup.memberIds.length > 1) {
      userIdsToClear = configGroup.memberIds;
      dealerboardGroupMeta = {
        id: configGroup.groupId,
        name: configGroup.groupName,
        memberCount: configGroup.memberIds.length,
      };
    }
  }

  for (const uid of userIdsToClear) {
    await deleteAssignment(uid, pageNumber, buttonNumber);
  }

  return {
    success: true,
    clearedFor: userIdsToClear.length,
    dealerboardGroup: dealerboardGroupMeta,
  };
}

module.exports = {
  getDealerboardConfig,
  setButtonAssignment,
  removeButtonAssignment,
};
