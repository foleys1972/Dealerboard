const { pool } = require('../pool');

async function listCountries() {
  const result = await pool.query(
    `SELECT code, name, is_active, metadata, created_at, updated_at
     FROM countries
     ORDER BY code ASC`
  );
  return result.rows;
}

async function upsertCountry(code, name, isActive) {
  await pool.query(
    `INSERT INTO countries (code, name, is_active, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (code) DO UPDATE SET
       name = EXCLUDED.name,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()`,
    [code, name, isActive]
  );
}

async function deleteCountryByCode(code) {
  await pool.query('DELETE FROM countries WHERE code = $1', [code]);
}

function mapCountryRow(row) {
  return {
    code: row.code,
    name: row.name,
    isActive: row.is_active,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  listCountries,
  upsertCountry,
  deleteCountryByCode,
  mapCountryRow,
};
