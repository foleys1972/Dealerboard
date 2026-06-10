const crypto = require('crypto');
const logger = require('../../utils/logger');
const {
  getAssignmentsByUserId,
  upsertAssignment,
} = require('../../db/dealerboard/buttonAssignments');
const {
  getUserPreferences,
  preferencesExist,
  insertUserPreferences,
  updateUserPreferences,
} = require('../../db/dealerboard/userPreferences');
const { findDirectContacts, findGroups } = require('../../db/groups');

// Page-0 intercom button layout (see assignmentService.mapIntercomAssignmentRow):
//   buttons 1-8   -> broadcasts
//   buttons 9-18  -> groups   (10 slots)
//   buttons 19-34 -> contacts (16 slots)
const GROUP_BUTTON_RANGE = { start: 9, end: 18 };
const CONTACT_BUTTON_RANGE = { start: 19, end: 34 };

/**
 * Pure layout planner: given which page-0 buttons are already taken and the
 * user's groups/contacts, decide which new assignments to create. Kept free of
 * I/O so it can be unit-tested. Only fills empty slots within each section and
 * stops when the section is full.
 *
 * @param {object} args
 * @param {Set<number>} args.usedButtons - page-0 button numbers already assigned
 * @param {Array<{id:string}>} args.groups - groups to seed into the group section
 * @param {Array<{contactUserId:string}>} args.contacts - contacts to seed into the contact section
 * @returns {Array<{buttonNumber:number, assignmentType:string, groupId?:string, contactUserId?:string}>}
 */
function planSeedAssignments({ usedButtons, groups = [], contacts = [] }) {
  const used = usedButtons instanceof Set ? new Set(usedButtons) : new Set(usedButtons || []);
  const plan = [];

  const fillSection = (items, range, build) => {
    let btn = range.start;
    for (const item of items) {
      while (btn <= range.end && used.has(btn)) btn++;
      if (btn > range.end) break;
      plan.push({ buttonNumber: btn, ...build(item) });
      used.add(btn);
      btn++;
    }
  };

  fillSection(
    groups.filter((g) => g && g.id),
    GROUP_BUTTON_RANGE,
    (g) => ({ assignmentType: 'groupCall', groupId: g.id })
  );

  fillSection(
    contacts.filter((c) => c && c.contactUserId),
    CONTACT_BUTTON_RANGE,
    (c) => ({ assignmentType: 'directContact', contactUserId: c.contactUserId })
  );

  return plan;
}

async function markSeeded(userId) {
  const row = await getUserPreferences(userId);
  const nextPrefs = { ...(row?.preferences || {}), autoSeeded: true, autoSeededAt: new Date().toISOString() };

  if (await preferencesExist(userId)) {
    await updateUserPreferences(
      userId,
      ['preferences = $1', 'updated_at = NOW()'],
      [JSON.stringify(nextPrefs), userId]
    );
  } else {
    await insertUserPreferences([userId, true, JSON.stringify({}), JSON.stringify(nextPrefs), null]);
  }
}

/**
 * Seed a user's dealerboard once with buttons derived from their groups and
 * direct contacts, so a new user lands on a usable board instead of an empty
 * grid. Idempotent: guarded by preferences.autoSeeded, so a user who later
 * clears their board is never re-seeded. Best-effort — never throws into the
 * config read.
 *
 * @param {string} userId - resolved users.id
 * @returns {Promise<number>} number of buttons seeded
 */
async function maybeSeedDefaultAssignments(userId) {
  if (!userId) return 0;

  try {
    const prefsRow = await getUserPreferences(userId);
    if (prefsRow?.preferences?.autoSeeded) return 0;

    const existing = await getAssignmentsByUserId(userId);
    const usedButtons = new Set(
      existing.filter((r) => r.page_number === 0).map((r) => r.button_number)
    );

    // Groups: main `groups` table (FK target of button_assignments.group_id).
    let groups = [];
    try {
      const all = await findGroups({ isActive: true });
      groups = all.filter((g) => (g.participants || []).map(String).includes(String(userId)));
    } catch (err) {
      logger.warn('Auto-seed: failed to load groups', err?.message || err);
    }

    // Contacts: only those resolving to a real user (FK target of contact_user_id).
    let contacts = [];
    try {
      contacts = await findDirectContacts(userId);
    } catch (err) {
      logger.warn('Auto-seed: failed to load direct contacts', err?.message || err);
    }

    const plan = planSeedAssignments({ usedButtons, groups, contacts });

    for (const item of plan) {
      try {
        await upsertAssignment({
          id: crypto.randomUUID(),
          userId,
          pageNumber: 0,
          buttonNumber: item.buttonNumber,
          assignmentType: item.assignmentType,
          groupId: item.groupId || null,
          contactUserId: item.contactUserId || null,
          metadata: { autoSeeded: true },
        });
      } catch (err) {
        logger.warn(`Auto-seed: failed to write button ${item.buttonNumber}`, err?.message || err);
      }
    }

    await markSeeded(userId);

    if (plan.length > 0) {
      logger.info(`Auto-seeded ${plan.length} dealerboard buttons for user ${userId}`);
    }
    return plan.length;
  } catch (err) {
    logger.warn('Auto-seed skipped due to error', err?.message || err);
    return 0;
  }
}

module.exports = {
  planSeedAssignments,
  maybeSeedDefaultAssignments,
  GROUP_BUTTON_RANGE,
  CONTACT_BUTTON_RANGE,
};
