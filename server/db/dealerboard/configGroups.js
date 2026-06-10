const crypto = require('crypto');
const { pool } = require('../pool');

/** Dealerboard config groups: users share the same page 1–10 button layout. */
async function getDealerboardConfigGroup(userId) {
  const groupResult = await pool.query(
    `SELECT dg.id, dg.name
     FROM dealerboard_groups dg
     INNER JOIN dealerboard_group_members dgm ON dg.id = dgm.group_id
     WHERE dgm.user_id = $1 AND dg.is_active = true
     ORDER BY dg.name
     LIMIT 1`,
    [userId]
  );

  if (!groupResult.rows.length) {
    return { groupId: null, groupName: null, memberIds: [userId] };
  }

  const groupId = groupResult.rows[0].id;
  const membersResult = await pool.query(
    `SELECT user_id FROM dealerboard_group_members WHERE group_id = $1 ORDER BY created_at`,
    [groupId]
  );
  const memberIds = membersResult.rows.map((row) => row.user_id).filter(Boolean);

  return {
    groupId,
    groupName: groupResult.rows[0].name,
    memberIds: memberIds.length ? memberIds : [userId],
  };
}

function shouldPropagateDealerboardAssignment({ section, pageNumber, applyToGroup }) {
  if (section) return false;
  if (applyToGroup === false || applyToGroup === 'false') return false;
  const page = parseInt(pageNumber, 10);
  return Number.isFinite(page) && page >= 1 && page <= 10;
}

async function syncDealerboardAssignmentsFromUser(fromUserId, toUserId) {
  const source = await pool.query(
    `SELECT page_number, button_number, assignment_type, line_id, ddi_line_id, speed_dial_id,
            broadcast_id, group_id, contact_user_id, metadata
     FROM dealerboard_button_assignments
     WHERE user_id = $1 AND page_number >= 1
     ORDER BY page_number, button_number`,
    [fromUserId]
  );

  await pool.query(
    `DELETE FROM dealerboard_button_assignments WHERE user_id = $1 AND page_number >= 1`,
    [toUserId]
  );

  for (const row of source.rows) {
    await pool.query(
      `INSERT INTO dealerboard_button_assignments
       (id, user_id, page_number, button_number, assignment_type, line_id, ddi_line_id, speed_dial_id, broadcast_id, group_id, contact_user_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
      [
        crypto.randomUUID(),
        toUserId,
        row.page_number,
        row.button_number,
        row.assignment_type,
        row.line_id,
        row.ddi_line_id,
        row.speed_dial_id,
        row.broadcast_id,
        row.group_id,
        row.contact_user_id,
        JSON.stringify(row.metadata || {}),
      ]
    );
  }

  return source.rows.length;
}

module.exports = {
  getDealerboardConfigGroup,
  shouldPropagateDealerboardAssignment,
  syncDealerboardAssignmentsFromUser,
};
