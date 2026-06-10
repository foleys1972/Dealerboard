const {
  listCountries,
  upsertCountry,
  deleteCountryByCode,
  mapCountryRow,
} = require('../../db/systemSettings/countries');
const { SystemSettingsError } = require('./errors');

async function listCountryRecords() {
  const rows = await listCountries();
  return { success: true, countries: rows.map(mapCountryRow) };
}

async function upsertCountryRecord(body) {
  const { code, name, isActive } = body || {};
  const cc = String(code || '').trim().toUpperCase();
  const nm = String(name || '').trim();

  if (!cc || !nm) {
    throw new SystemSettingsError(400, 'code and name are required');
  }
  if (!/^[A-Z0-9_-]{2,10}$/.test(cc)) {
    throw new SystemSettingsError(400, 'Invalid country code format');
  }

  await upsertCountry(cc, nm, isActive !== undefined ? !!isActive : true);
  return { success: true, code: cc };
}

async function deleteCountry(code) {
  const cc = String(code || '').trim().toUpperCase();
  if (!cc) throw new SystemSettingsError(400, 'code is required');

  await deleteCountryByCode(cc);
  return { success: true };
}

module.exports = {
  listCountryRecords,
  upsertCountryRecord,
  deleteCountry,
};
