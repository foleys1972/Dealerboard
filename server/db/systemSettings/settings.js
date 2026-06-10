const { pool } = require('../pool');

async function getSettingsRow(id) {
  const result = await pool.query(
    `SELECT settings FROM system_settings WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) return {};

  const raw = result.rows[0].settings;

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  return raw || {};
}

async function upsertSettings(settingsId, settings, updatedBy) {
  await pool.query(
    `INSERT INTO system_settings (id, settings, updated_by, updated_at)
     VALUES ($3, $1, $2, NOW())
     ON CONFLICT (id) DO UPDATE SET
       settings = EXCLUDED.settings,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [settings, updatedBy, settingsId]
  );
}

module.exports = {
  getSettingsRow,
  upsertSettings,
};
