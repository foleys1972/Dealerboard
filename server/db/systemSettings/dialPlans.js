const { pool } = require('../pool');

async function listDialPlans({ countryCode, direction }) {
  const filters = [];
  const values = [];
  let p = 1;

  if (countryCode) {
    filters.push(`p.country_code = $${p++}`);
    values.push(String(countryCode).trim().toUpperCase());
  }
  if (direction) {
    filters.push(`p.direction = $${p++}`);
    values.push(direction);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT p.id, p.country_code, p.direction, p.name, p.priority, p.is_active, p.metadata, p.created_at, p.updated_at
     FROM dial_plans p
     ${where}
     ORDER BY p.country_code ASC, p.direction ASC, p.priority ASC, p.created_at ASC`,
    values
  );
  return result.rows;
}

async function countryExists(code) {
  const result = await pool.query('SELECT code FROM countries WHERE code = $1', [code]);
  return result.rows.length > 0;
}

async function upsertDialPlan(values) {
  await pool.query(
    `INSERT INTO dial_plans (id, country_code, direction, name, priority, is_active, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (id) DO UPDATE SET
       country_code = EXCLUDED.country_code,
       direction = EXCLUDED.direction,
       name = EXCLUDED.name,
       priority = EXCLUDED.priority,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()`,
    values
  );
}

async function deleteDialPlanById(id) {
  await pool.query('DELETE FROM dial_plans WHERE id = $1', [id]);
}

async function listDialPlanRules(planId) {
  const result = await pool.query(
    `SELECT id, dial_plan_id, pattern, delete_digits, insert_prefix, priority, is_active, sip_route_id, metadata, created_at, updated_at
     FROM dial_plan_rules
     WHERE dial_plan_id = $1
     ORDER BY priority ASC, created_at ASC`,
    [planId]
  );
  return result.rows;
}

async function upsertDialPlanRule(values) {
  await pool.query(
    `INSERT INTO dial_plan_rules (id, dial_plan_id, pattern, delete_digits, insert_prefix, priority, is_active, sip_route_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (id) DO UPDATE SET
       dial_plan_id = EXCLUDED.dial_plan_id,
       pattern = EXCLUDED.pattern,
       delete_digits = EXCLUDED.delete_digits,
       insert_prefix = EXCLUDED.insert_prefix,
       priority = EXCLUDED.priority,
       is_active = EXCLUDED.is_active,
       sip_route_id = EXCLUDED.sip_route_id,
       updated_at = NOW()`,
    values
  );
}

async function deleteDialPlanRule(planId, ruleId) {
  await pool.query(
    'DELETE FROM dial_plan_rules WHERE id = $1 AND dial_plan_id = $2',
    [ruleId, planId]
  );
}

function mapDialPlanRow(row) {
  return {
    id: String(row.id),
    countryCode: row.country_code,
    direction: row.direction,
    name: row.name,
    priority: row.priority,
    isActive: row.is_active,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDialPlanRuleRow(row) {
  return {
    id: String(row.id),
    dialPlanId: String(row.dial_plan_id),
    pattern: row.pattern,
    deleteDigits: row.delete_digits,
    insertPrefix: row.insert_prefix,
    priority: row.priority,
    isActive: row.is_active,
    sipRouteId: row.sip_route_id || null,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  listDialPlans,
  countryExists,
  upsertDialPlan,
  deleteDialPlanById,
  listDialPlanRules,
  upsertDialPlanRule,
  deleteDialPlanRule,
  mapDialPlanRow,
  mapDialPlanRuleRow,
};
