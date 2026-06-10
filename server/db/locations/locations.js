const { pool } = require('../pool');

async function listLocations() {
  const result = await pool.query(
    `SELECT l.id, l.name, l.description, l.region, l.retention_days, l.voice_retention_days,
            l.messaging_retention_days, l.data_retention_days, l.legal_hold, l.timezone,
            l.voice_vox_silence_seconds, l.sftp_config, l.metadata, l.created_at, l.updated_at,
            COALESCE(uc.cnt, 0) AS user_count,
            COALESCE(sc.cnt, 0) AS subscriber_count
     FROM locations l
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS cnt
       FROM users u
       WHERE u.location_id = l.id
     ) uc ON true
     LEFT JOIN LATERAL (
       SELECT (
         CASE WHEN a.primary_subscriber_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN a.secondary_subscriber_id IS NOT NULL THEN 1 ELSE 0 END
       )::int AS cnt
       FROM location_subscriber_assignments a
       WHERE a.location_id = l.id
     ) sc ON true
     ORDER BY l.name ASC, l.created_at ASC`
  );
  return result.rows;
}

async function getLocationArchiveConfig(id) {
  const result = await pool.query(
    `SELECT id, name, sftp_config FROM locations WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function insertLocation(values) {
  const result = await pool.query(
    `INSERT INTO locations (
       id, name, description, region, timezone, retention_days,
       voice_retention_days, voice_vox_silence_seconds, messaging_retention_days, data_retention_days,
       legal_hold, sftp_config, metadata, created_at, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,NOW(),NOW())
     RETURNING id, name, description, region, retention_days, voice_retention_days, voice_vox_silence_seconds, messaging_retention_days, data_retention_days,
               legal_hold, timezone, sftp_config, metadata, created_at, updated_at`,
    values
  );
  return result.rows[0];
}

async function updateLocation(id, updates, values) {
  const result = await pool.query(
    `UPDATE locations
     SET ${updates.join(', ')}
     WHERE id = $${values.length}
     RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

async function deleteLocationById(id) {
  await pool.query('DELETE FROM locations WHERE id = $1', [id]);
}

async function listUsersByLocationId(locationId) {
  const result = await pool.query(
    `SELECT id, username, display_name, role, is_active, location_id
     FROM users
     WHERE location_id = $1
     ORDER BY username ASC`,
    [locationId]
  );
  return result.rows;
}

async function assignUsersToLocation(locationId, userIds) {
  const ids = Array.isArray(userIds) ? userIds.map(String).filter(Boolean) : [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (ids.length === 0) {
      await client.query(
        `UPDATE users SET location_id = NULL WHERE location_id = $1`,
        [locationId]
      );
    } else {
      await client.query(
        `UPDATE users
         SET location_id = NULL
         WHERE location_id = $1
           AND NOT (id = ANY($2::text[]) OR username = ANY($2::text[]))`,
        [locationId, ids]
      );
      await client.query(
        `UPDATE users
         SET location_id = $1
         WHERE id = ANY($2::text[]) OR username = ANY($2::text[])`,
        [locationId, ids]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getLocationTimezone(locationId) {
  const result = await pool.query('SELECT timezone FROM locations WHERE id = $1', [locationId]);
  return result.rows?.[0]?.timezone ? String(result.rows[0].timezone) : 'UTC';
}

async function getLocationVoiceVoxSilenceSeconds(locationId) {
  const result = await pool.query(
    'SELECT voice_vox_silence_seconds FROM locations WHERE id = $1',
    [locationId]
  );
  const v = parseInt(result.rows?.[0]?.voice_vox_silence_seconds, 10);
  return Number.isFinite(v) && v > 0 ? v : 10;
}

function mapLocationRow(row) {
  const { maskArchiveConfigForUi } = require('../../services/recordingArchiveService');
  return {
    id: String(row.id),
    name: row.name,
    description: row.description,
    region: row.region,
    timezone: row.timezone || 'UTC',
    retentionDays: row.retention_days,
    voiceRetentionDays: row.voice_retention_days,
    voiceVoxSilenceSeconds: Number.isFinite(Number(row.voice_vox_silence_seconds))
      ? Number(row.voice_vox_silence_seconds)
      : 10,
    messagingRetentionDays: row.messaging_retention_days,
    dataRetentionDays: row.data_retention_days,
    legalHold: row.legal_hold,
    sftpConfig: maskArchiveConfigForUi(row.sftp_config || {}),
    metadata: row.metadata || {},
    userCount: Number(row.user_count) || 0,
    subscriberCount: Number(row.subscriber_count) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLocationUserRow(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    isActive: row.is_active,
    locationId: row.location_id,
  };
}

module.exports = {
  listLocations,
  getLocationArchiveConfig,
  insertLocation,
  updateLocation,
  deleteLocationById,
  listUsersByLocationId,
  assignUsersToLocation,
  getLocationTimezone,
  getLocationVoiceVoxSilenceSeconds,
  mapLocationRow,
  mapLocationUserRow,
};
