const { pool } = require('../pool');

async function getUserPreferences(userId) {
  const result = await pool.query(
    'SELECT * FROM dealerboard_user_preferences WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

async function preferencesExist(userId) {
  const result = await pool.query(
    'SELECT user_id FROM dealerboard_user_preferences WHERE user_id = $1',
    [userId]
  );
  return result.rows.length > 0;
}

async function insertUserPreferences(values) {
  await pool.query(
    `INSERT INTO dealerboard_user_preferences (user_id, audible_ringing, button_colors, preferences, default_ddi_line_id)
     VALUES ($1, $2, $3, $4, $5)`,
    values
  );
}

async function updateUserPreferences(userId, updates, values) {
  await pool.query(
    `UPDATE dealerboard_user_preferences SET ${updates.join(', ')} WHERE user_id = $${values.length}`,
    values
  );
}

function mapPreferencesResponse(row) {
  if (!row) {
    return {
      audibleRinging: true,
      buttonColors: {},
      preferences: {},
      defaultDdiLineId: null,
    };
  }

  return {
    audibleRinging: row.audible_ringing,
    buttonColors: row.button_colors || {},
    preferences: row.preferences || {},
    defaultDdiLineId: row.default_ddi_line_id || null,
  };
}

async function listIntercomDndByUserIds(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return new Map();

  const result = await pool.query(
    `
      SELECT user_id, preferences
      FROM dealerboard_user_preferences
      WHERE user_id = ANY($1::text[])
    `,
    [userIds]
  );

  const map = new Map();
  for (const row of result.rows || []) {
    const prefs = row.preferences || {};
    const intercomSettings = prefs.intercomSettings || {};
    map.set(String(row.user_id), Boolean(intercomSettings.dnd));
  }
  return map;
}

module.exports = {
  getUserPreferences,
  preferencesExist,
  insertUserPreferences,
  updateUserPreferences,
  mapPreferencesResponse,
  listIntercomDndByUserIds,
};
