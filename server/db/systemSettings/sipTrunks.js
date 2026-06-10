const { pool } = require('../pool');

async function listSipTrunks({ activeOnly = false } = {}) {
  const where = activeOnly ? 'WHERE is_active = true' : '';
  const result = await pool.query(
    `SELECT id, name, host, port, username, password, domain, label, is_active, metadata, created_at, updated_at
     FROM sip_trunks
     ${where}
     ORDER BY name ASC, created_at ASC`,
  );
  return result.rows;
}

async function getSipTrunkById(id) {
  const result = await pool.query(
    `SELECT id, name, host, port, username, password, domain, label, is_active, metadata, created_at, updated_at
     FROM sip_trunks WHERE id = $1`,
    [String(id)],
  );
  return result.rows[0] || null;
}

async function upsertSipTrunk(values) {
  await pool.query(
    `INSERT INTO sip_trunks (id, name, host, port, username, password, domain, label, is_active, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       host = EXCLUDED.host,
       port = EXCLUDED.port,
       username = EXCLUDED.username,
       password = COALESCE(NULLIF(EXCLUDED.password, ''), sip_trunks.password),
       domain = EXCLUDED.domain,
       label = EXCLUDED.label,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()`,
    values,
  );
}

async function deleteSipTrunkById(id) {
  await pool.query('DELETE FROM sip_trunks WHERE id = $1', [String(id)]);
}

function mapSipTrunkRow(row, { maskPassword = true } = {}) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name,
    host: row.host,
    port: row.port,
    username: row.username || '',
    password: maskPassword && row.password ? '********' : (row.password || ''),
    domain: row.domain || '',
    label: row.label || '',
    isActive: row.is_active !== false,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  listSipTrunks,
  getSipTrunkById,
  upsertSipTrunk,
  deleteSipTrunkById,
  mapSipTrunkRow,
};
