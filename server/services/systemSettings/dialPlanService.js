const crypto = require('crypto');
const {
  listDialPlans,
  countryExists,
  upsertDialPlan,
  deleteDialPlanById,
  listDialPlanRules,
  upsertDialPlanRule,
  deleteDialPlanRule,
  mapDialPlanRow,
  mapDialPlanRuleRow,
} = require('../../db/systemSettings/dialPlans');
const { SystemSettingsError } = require('./errors');

async function listDialPlanRecords(query) {
  const { countryCode, direction } = query || {};

  if (direction) {
    const dir = String(direction).trim();
    if (!['incoming', 'outgoing'].includes(dir)) {
      throw new SystemSettingsError(400, 'direction must be incoming or outgoing');
    }
  }

  const rows = await listDialPlans({ countryCode, direction });
  return { success: true, dialPlans: rows.map(mapDialPlanRow) };
}

async function upsertDialPlanRecord(body) {
  const { id, countryCode, direction, name, priority, isActive } = body || {};
  const cc = String(countryCode || '').trim().toUpperCase();
  const dir = String(direction || '').trim();
  const nm = String(name || '').trim();

  if (!cc || !dir || !nm) {
    throw new SystemSettingsError(400, 'countryCode, direction, and name are required');
  }
  if (!['incoming', 'outgoing'].includes(dir)) {
    throw new SystemSettingsError(400, 'direction must be incoming or outgoing');
  }
  if (!(await countryExists(cc))) {
    throw new SystemSettingsError(400, `Unknown country code ${cc}`);
  }

  const planId = id ? String(id) : crypto.randomUUID();
  const prio = priority !== undefined && priority !== null
    ? (parseInt(priority, 10) || 1000)
    : 1000;

  await upsertDialPlan([
    planId,
    cc,
    dir,
    nm,
    prio,
    isActive !== undefined ? !!isActive : true,
  ]);

  return { success: true, id: planId };
}

async function deleteDialPlan(id) {
  const planId = String(id || '').trim();
  if (!planId) throw new SystemSettingsError(400, 'id is required');

  await deleteDialPlanById(planId);
  return { success: true };
}

async function listDialPlanRuleRecords(planId) {
  const id = String(planId || '').trim();
  if (!id) throw new SystemSettingsError(400, 'id is required');

  const rows = await listDialPlanRules(id);
  return { success: true, rules: rows.map(mapDialPlanRuleRow) };
}

async function upsertDialPlanRuleRecord(planId, body) {
  const id = String(planId || '').trim();
  if (!id) throw new SystemSettingsError(400, 'id is required');

  const { id: ruleIdInput, pattern, deleteDigits, insertPrefix, priority, isActive, sipRouteId } = body || {};
  const pat = String(pattern || '').trim();
  if (!pat) throw new SystemSettingsError(400, 'pattern is required');

  const ruleId = ruleIdInput ? String(ruleIdInput) : crypto.randomUUID();
  const del = deleteDigits !== undefined && deleteDigits !== null
    ? Math.max(0, parseInt(deleteDigits, 10) || 0)
    : 0;
  const ins = insertPrefix !== undefined && insertPrefix !== null ? String(insertPrefix) : '';
  const prio = priority !== undefined && priority !== null
    ? (parseInt(priority, 10) || 1000)
    : 1000;

  await upsertDialPlanRule([
    ruleId,
    id,
    pat,
    del,
    ins,
    prio,
    isActive !== undefined ? !!isActive : true,
    sipRouteId ? String(sipRouteId) : null,
  ]);

  return { success: true, id: ruleId };
}

async function deleteDialPlanRuleRecord(planId, ruleId) {
  const id = String(planId || '').trim();
  const rid = String(ruleId || '').trim();
  if (!id || !rid) throw new SystemSettingsError(400, 'id and ruleId are required');

  await deleteDialPlanRule(id, rid);
  return { success: true };
}

module.exports = {
  listDialPlanRecords,
  upsertDialPlanRecord,
  deleteDialPlan,
  listDialPlanRuleRecords,
  upsertDialPlanRuleRecord,
  deleteDialPlanRuleRecord,
};
