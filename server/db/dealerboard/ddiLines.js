const { pool } = require('../pool');

async function ddiLineExists(lineId) {
  const result = await pool.query(
    `SELECT id FROM dealerboard_ddi_lines WHERE id = $1`,
    [lineId]
  );
  return result.rows.length > 0;
}

async function getActiveDdiLine(lineId) {
  const result = await pool.query(
    `SELECT id, country_code, line_number, sbc_details, connection_details, sip_route_id
     FROM dealerboard_ddi_lines
     WHERE id = $1 AND is_active = true`,
    [lineId]
  );
  return result.rows[0] || null;
}

async function findInternalDdiByDigits(dialDigits) {
  const result = await pool.query(
    `SELECT id, line_number, connection_details
     FROM dealerboard_ddi_lines
     WHERE is_active = true
       AND regexp_replace(line_number, '\\D', '', 'g') = $1
     LIMIT 1`,
    [dialDigits]
  );
  return result.rows[0] || null;
}

async function getDdiLineSummary(lineId) {
  const result = await pool.query(
    `SELECT id, line_number, sbc_details FROM dealerboard_ddi_lines WHERE id = $1`,
    [lineId]
  );
  return result.rows[0] || null;
}

async function listActiveLinesForCatalog() {
  const result = await pool.query(
    `SELECT id, aor, line_name as name, line_name as label, 'DDI' as type, NULL as mode, sudo_line_reference, is_active, connection_details
     FROM dealerboard_ddi_lines WHERE is_active = true`
  );
  return result.rows;
}

async function findDdiLineByAor(aor) {
  const result = await pool.query(
    `SELECT id, line_name, aor FROM dealerboard_ddi_lines WHERE aor = $1 LIMIT 1`,
    [aor]
  );
  return result.rows[0] || null;
}

async function findDdiLineByAorOrLegacy(aor) {
  const result = await pool.query(
    `SELECT id, line_name, aor FROM dealerboard_ddi_lines WHERE aor = $1 OR (metadata->>'legacyAor') = $1 LIMIT 1`,
    [aor]
  );
  return result.rows[0] || null;
}

async function updateDdiLineCallForward(lineId, payload) {
  await pool.query(
    `UPDATE dealerboard_ddi_lines
     SET connection_details = jsonb_set(COALESCE(connection_details, '{}'::jsonb), '{callForward}', $2::jsonb, true),
         updated_at = NOW()
     WHERE id = $1`,
    [String(lineId), JSON.stringify(payload)]
  );
}

async function listAllDdiLines() {
  const result = await pool.query(
    `SELECT * FROM dealerboard_ddi_lines ORDER BY created_at DESC`
  );
  return result.rows;
}

async function insertDdiLine(values) {
  await pool.query(
    `INSERT INTO dealerboard_ddi_lines
     (id, line_number, line_name, country_code, sbc_details, connection_details, subscriber_id, ring_timeout, sudo_line_reference, aor, sip_route_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    values
  );
}

async function listActiveDdiLineIdsBySipRouteId(routeId) {
  const result = await pool.query(
    `SELECT id FROM dealerboard_ddi_lines
     WHERE sip_route_id = $1 AND is_active = true`,
    [String(routeId)],
  );
  return result.rows.map((r) => String(r.id));
}

async function listActiveDdiLineIdsByTrunkId(trunkId) {
  const result = await pool.query(
    `SELECT DISTINCT d.id
     FROM dealerboard_ddi_lines d
     INNER JOIN sip_route_trunks rt ON rt.route_id = d.sip_route_id
     WHERE rt.trunk_id = $1 AND d.is_active = true`,
    [String(trunkId)],
  );
  return result.rows.map((r) => String(r.id));
}

async function updateDdiLine(id, updates, values) {
  await pool.query(
    `UPDATE dealerboard_ddi_lines SET ${updates.join(', ')} WHERE id = $${values.length}`,
    values
  );
}

async function deleteDdiLineById(id) {
  await pool.query('DELETE FROM dealerboard_ddi_lines WHERE id = $1', [id]);
}

const { flattenSbcForDisplay } = require('../../services/dealerboard/sbcProfile');

function mapDdiLineRow(row) {
  const sbcDisplay = flattenSbcForDisplay(row.sbc_details || {});
  return {
    id: row.id,
    lineNumber: row.line_number,
    lineName: row.line_name,
    aor: row.aor || null,
    countryCode: row.country_code || null,
    sbcDetails: sbcDisplay.sbcDetails,
    sbcHost: sbcDisplay.sbcHost,
    sbcPort: sbcDisplay.sbcPort,
    sbcUsername: sbcDisplay.sbcUsername,
    sbcPassword: sbcDisplay.sbcPassword,
    sbcDomain: sbcDisplay.sbcDomain,
    sbcSecondaryHost: sbcDisplay.sbcSecondaryHost,
    sbcSecondaryPort: sbcDisplay.sbcSecondaryPort,
    sbcSecondaryUsername: sbcDisplay.sbcSecondaryUsername,
    sbcSecondaryPassword: sbcDisplay.sbcSecondaryPassword,
    sbcSecondaryDomain: sbcDisplay.sbcSecondaryDomain,
    sbcFailbackToPrimary: sbcDisplay.sbcFailbackToPrimary,
    hasSecondarySbc: sbcDisplay.hasSecondarySbc,
    sipRouteId: row.sip_route_id || null,
    connectionDetails: row.connection_details || {},
    subscriberId: row.subscriber_id,
    ringTimeout: row.ring_timeout,
    sudoLineReference: row.sudo_line_reference,
    isActive: row.is_active,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  ddiLineExists,
  getActiveDdiLine,
  findInternalDdiByDigits,
  getDdiLineSummary,
  listActiveLinesForCatalog,
  findDdiLineByAor,
  findDdiLineByAorOrLegacy,
  updateDdiLineCallForward,
  listAllDdiLines,
  insertDdiLine,
  updateDdiLine,
  deleteDdiLineById,
  listActiveDdiLineIdsBySipRouteId,
  listActiveDdiLineIdsByTrunkId,
  mapDdiLineRow,
};
