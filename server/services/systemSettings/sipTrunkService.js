const crypto = require('crypto');
const {
  listSipTrunks,
  getSipTrunkById,
  upsertSipTrunk,
  deleteSipTrunkById,
  mapSipTrunkRow,
} = require('../../db/systemSettings/sipTrunks');
const { SystemSettingsError } = require('./errors');
const { reloadDdiLinesForTrunk } = require('../dealerboard/sipLineReloadService');

async function listSipTrunkRecords(query = {}) {
  const activeOnly = query.activeOnly === true || query.activeOnly === 'true';
  const rows = await listSipTrunks({ activeOnly });
  return { success: true, trunks: rows.map((r) => mapSipTrunkRow(r)) };
}

async function upsertSipTrunkRecord(body) {
  const {
    id,
    name,
    host,
    port,
    username,
    password,
    domain,
    label,
    isActive,
  } = body || {};

  const nm = String(name || '').trim();
  const h = String(host || '').trim();
  if (!nm || !h) {
    throw new SystemSettingsError(400, 'name and host are required');
  }

  const trunkId = id ? String(id) : crypto.randomUUID();
  const existing = id ? await getSipTrunkById(trunkId) : null;
  const portNum = port !== undefined && port !== null
    ? (parseInt(port, 10) || 5060)
    : (existing?.port || 5060);

  await upsertSipTrunk([
    trunkId,
    nm,
    h,
    portNum,
    username ? String(username) : null,
    password !== undefined ? String(password || '') : (existing?.password || null),
    domain ? String(domain) : null,
    label ? String(label) : null,
    isActive !== undefined ? !!isActive : true,
  ]);

  reloadDdiLinesForTrunk(trunkId, 'sip_trunk_updated');
  return { success: true, id: trunkId };
}

async function deleteSipTrunk(id) {
  const trunkId = String(id || '').trim();
  if (!trunkId) throw new SystemSettingsError(400, 'id is required');
  reloadDdiLinesForTrunk(trunkId, 'sip_trunk_deleted');
  await deleteSipTrunkById(trunkId);
  return { success: true };
}

module.exports = {
  listSipTrunkRecords,
  upsertSipTrunkRecord,
  deleteSipTrunk,
};
