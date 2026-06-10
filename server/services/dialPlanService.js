const { pool } = require('./databaseService');
const logger = require('../utils/logger');

function normalizeDigits(input) {
  if (input === undefined || input === null) return '';
  return String(input).replace(/\D/g, '');
}

function compilePatternToRegex(pattern) {
  const p = String(pattern || '').trim();
  if (!p) return null;

  // Supported:
  // - Digits 0-9 literal
  // - X means any single digit
  // - * means 0 or more digits
  // Anchored match.
  const escaped = p
    .replace(/[^0-9X*]/g, '')
    .replace(/X/g, '\\d')
    .replace(/\*/g, '\\d*');

  return new RegExp(`^${escaped}$`);
}

async function listRules({ countryCode, direction }) {
  const cc = String(countryCode || '').trim();
  const dir = String(direction || '').trim();
  if (!cc) throw new Error('countryCode is required');
  if (!['incoming', 'outgoing'].includes(dir)) throw new Error('direction must be incoming or outgoing');

  const res = await pool.query(
    `SELECT r.id, r.pattern, r.delete_digits, r.insert_prefix, r.priority, r.is_active, r.sip_route_id
     FROM dial_plans p
     INNER JOIN dial_plan_rules r ON r.dial_plan_id = p.id
     WHERE p.country_code = $1
       AND p.direction = $2
       AND p.is_active = true
       AND r.is_active = true
     ORDER BY p.priority ASC, r.priority ASC, r.created_at ASC`,
    [cc, dir]
  );

  return res.rows.map(r => ({
    id: String(r.id),
    pattern: r.pattern,
    deleteDigits: r.delete_digits === undefined || r.delete_digits === null ? 0 : Number(r.delete_digits),
    insertPrefix: r.insert_prefix || '',
    priority: r.priority === undefined || r.priority === null ? 1000 : Number(r.priority),
    sipRouteId: r.sip_route_id || null,
  }));
}

function applyRules(number, rules) {
  const digits = normalizeDigits(number);
  if (!digits) return { number: digits, matchedRuleId: null, sipRouteId: null };

  for (const rule of rules || []) {
    const rx = compilePatternToRegex(rule.pattern);
    if (!rx) continue;
    if (!rx.test(digits)) continue;

    const deleteDigits = Math.max(0, parseInt(rule.deleteDigits, 10) || 0);
    const remainder = deleteDigits > 0 ? digits.slice(deleteDigits) : digits;
    const out = `${rule.insertPrefix || ''}${remainder}`;
    return { number: out, matchedRuleId: rule.id, sipRouteId: rule.sipRouteId || null };
  }

  return { number: digits, matchedRuleId: null, sipRouteId: null };
}

async function applyDialPlan({ countryCode, direction, number }) {
  try {
    const rules = await listRules({ countryCode, direction });
    return applyRules(number, rules);
  } catch (e) {
    try {
      logger.warn('Dial plan apply failed; falling back to digits-only', { countryCode, direction, err: e?.message || e });
    } catch {}
    return { number: normalizeDigits(number), matchedRuleId: null, sipRouteId: null };
  }
}

module.exports = {
  normalizeDigits,
  compilePatternToRegex,
  listRules,
  applyDialPlan,
  applyRules
};
