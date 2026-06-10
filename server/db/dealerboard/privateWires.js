const { pool } = require('../pool');

async function privateWireExists(lineId) {
  const result = await pool.query(
    `SELECT id FROM dealerboard_private_wires WHERE id = $1`,
    [lineId]
  );
  return result.rows.length > 0;
}

async function getPrivateWireForCall(lineId) {
  const result = await pool.query(
    `SELECT uri_address, mode, sbc_details, signalling_type, metadata
     FROM dealerboard_private_wires WHERE id = $1`,
    [lineId]
  );
  return result.rows[0] || null;
}

async function getPrivateWireForSignal(lineId) {
  const result = await pool.query(
    `SELECT uri_address, mode, sbc_details, signalling_type, metadata
     FROM dealerboard_private_wires WHERE id = $1`,
    [lineId]
  );
  return result.rows[0] || null;
}

async function listAllPrivateWires() {
  const result = await pool.query(
    `SELECT * FROM dealerboard_private_wires ORDER BY created_at DESC`
  );
  return result.rows;
}

async function validateSubscriberIds(subscriberIds) {
  const result = await pool.query(
    `SELECT id FROM subscribers WHERE id = ANY($1::text[])`,
    [subscriberIds]
  );
  return result.rows.map((r) => r.id);
}

async function insertInternalWirePair(values) {
  await pool.query(
    `INSERT INTO dealerboard_private_wires
     (id, uri_address, sbc_details, line_label, circuit_number, mode, subscriber_id, ring_timeout, aor, home_subscriber_id, secondary_subscriber_id,
      external_community_id, external_community_name, is_external_community, sudo_line_reference, metadata, signalling_type)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9,  $10, $11, $12, $13, $14, $15, $16, $17),
      ($18,$19,$20,$21,$22,$23,$24,$25,$26, $27, $28, $29, $30, $31, $32, $33, $34)`,
    values
  );
}

async function insertPrivateWire(values) {
  await pool.query(
    `INSERT INTO dealerboard_private_wires
     (id, uri_address, sbc_details, line_label, circuit_number, mode, subscriber_id, ring_timeout, aor, home_subscriber_id, secondary_subscriber_id,
      external_community_id, external_community_name, is_external_community, sudo_line_reference, metadata, signalling_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    values
  );
}

async function getPrivateWireForUpdate(id) {
  const result = await pool.query(
    `SELECT uri_address, mode, metadata, is_external_community, external_community_id, external_community_name
     FROM dealerboard_private_wires
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

async function updatePrivateWire(id, updates, values) {
  await pool.query(
    `UPDATE dealerboard_private_wires SET ${updates.join(', ')} WHERE id = $${values.length}`,
    values
  );
}

async function getInternalWirePairByPairId(pairId) {
  const result = await pool.query(
    `SELECT id, mode, subscriber_id, metadata
     FROM dealerboard_private_wires
     WHERE (metadata->>'internalPairId') = $1`,
    [pairId]
  );
  return result.rows;
}

async function updateInternalWirePairShared(pairId, updates, values) {
  await pool.query(
    `UPDATE dealerboard_private_wires SET ${updates.join(', ')}
     WHERE (metadata->>'internalPairId') = $${values.length}`,
    [...values, pairId]
  );
}

async function updateWireSubscriberId(wireId, subscriberId) {
  await pool.query(
    `UPDATE dealerboard_private_wires SET subscriber_id = $1, updated_at = NOW() WHERE id = $2`,
    [subscriberId, wireId]
  );
}

async function updateWireLineLabel(wireId, lineLabel) {
  await pool.query(
    `UPDATE dealerboard_private_wires SET line_label = $1, updated_at = NOW() WHERE id = $2`,
    [lineLabel, wireId]
  );
}

async function getPrivateWireForLegacyMigration(wireId) {
  const result = await pool.query(
    `SELECT id, line_label, mode, aor, metadata, is_active
     FROM dealerboard_private_wires
     WHERE id = $1
     LIMIT 1`,
    [wireId]
  );
  return result.rows[0] || null;
}

async function getGroupSummaryById(groupId) {
  const result = await pool.query(
    `SELECT id, name, call_mode, metadata, hoot_config, is_active FROM groups WHERE id = $1 LIMIT 1`,
    [groupId]
  );
  return result.rows[0] || null;
}

async function updateLegacyBroadcastGroup(groupId, name, metadata) {
  await pool.query(
    `UPDATE groups SET name = COALESCE($2, name), call_mode = 'broadcast', metadata = $3, updated_at = NOW() WHERE id = $1`,
    [groupId, name, metadata]
  );
}

async function insertLegacyBroadcastGroup({ groupId, name, createdBy, metadata }) {
  await pool.query(
    `INSERT INTO groups
      (id, name, description, type, call_mode, is_public, max_participants, allow_recording, push_to_talk,
       created_by, sip_enabled, sip_numbers, retention_policy, hoot_config, matrix_room_id, is_active, metadata, created_at, updated_at)
     VALUES
      ($1,$2,$3,$4,'broadcast',false,200,true,false,$5,false,'[]'::jsonb,'{}'::jsonb,'{}'::jsonb,NULL,true,$6,NOW(),NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       call_mode = 'broadcast',
       metadata = EXCLUDED.metadata,
       updated_at = NOW()`,
    [groupId, name, '', 'trading', createdBy, metadata]
  );
}

async function markPrivateWireMigrated(wireId, metadata) {
  await pool.query(
    `UPDATE dealerboard_private_wires SET is_active = false, metadata = $2, updated_at = NOW() WHERE id = $1`,
    [wireId, metadata]
  );
}

async function getFullGroupById(groupId) {
  const result = await pool.query(`SELECT * FROM groups WHERE id = $1 LIMIT 1`, [groupId]);
  return result.rows[0] || null;
}

async function getPrivateWiresByIds(ids) {
  const result = await pool.query(
    `SELECT id, mode FROM dealerboard_private_wires WHERE id = ANY($1::text[])`,
    [ids]
  );
  return result.rows;
}

async function deleteLineSessionsByWireIds(ids) {
  await pool.query(
    `DELETE FROM dealerboard_line_sessions WHERE private_wire_id = ANY($1::text[])`,
    [ids]
  );
}

async function deletePrivateWiresByIds(ids) {
  const result = await pool.query(
    `DELETE FROM dealerboard_private_wires WHERE id = ANY($1::text[])`,
    [ids]
  );
  return result.rowCount || 0;
}

async function getPrivateWireForDelete(id) {
  const result = await pool.query(
    `SELECT mode, metadata FROM dealerboard_private_wires WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

async function deleteInternalWirePair(pairId) {
  await pool.query(
    `DELETE FROM dealerboard_private_wires WHERE (metadata->>'internalPairId') = $1`,
    [pairId]
  );
}

async function deletePrivateWireById(id) {
  await pool.query('DELETE FROM dealerboard_private_wires WHERE id = $1', [id]);
}

async function listActiveLinesForCatalog() {
  const result = await pool.query(
    `SELECT id, aor, line_label as name, line_label as label, 'private_wire' as type, mode, signalling_type, sudo_line_reference, is_active, metadata
     FROM dealerboard_private_wires WHERE is_active = true`
  );
  return result.rows;
}

async function findPrivateWireByAor(aor) {
  const result = await pool.query(
    `SELECT id, line_label, aor FROM dealerboard_private_wires WHERE aor = $1 LIMIT 1`,
    [aor]
  );
  return result.rows[0] || null;
}

async function findPrivateWireByAorOrLegacy(aor) {
  const result = await pool.query(
    `SELECT id, line_label, aor FROM dealerboard_private_wires WHERE aor = $1 OR (metadata->>'legacyAor') = $1 LIMIT 1`,
    [aor]
  );
  return result.rows[0] || null;
}

async function updatePrivateWireCallForward(lineId, payload) {
  await pool.query(
    `UPDATE dealerboard_private_wires
     SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{callForward}', $2::jsonb, true),
         updated_at = NOW()
     WHERE id = $1`,
    [String(lineId), JSON.stringify(payload)]
  );
}

const { flattenSbcForDisplay } = require('../../services/dealerboard/sbcProfile');

function mapPrivateWireRow(row) {
  const sbcDisplay = flattenSbcForDisplay(row.sbc_details || {});
  return {
    id: row.id,
    aor: row.aor || null,
    uriAddress: row.uri_address,
    sbcDetails: sbcDisplay.sbcDetails,
    sbcHost: sbcDisplay.sbcHost,
    sbcPort: sbcDisplay.sbcPort,
    sbcUsername: sbcDisplay.sbcUsername,
    sbcPassword: sbcDisplay.sbcPassword,
    sbcDomain: sbcDisplay.sbcDomain,
    sbcLabel: sbcDisplay.sbcLabel,
    sbcSecondaryHost: sbcDisplay.sbcSecondaryHost,
    sbcSecondaryPort: sbcDisplay.sbcSecondaryPort,
    sbcSecondaryUsername: sbcDisplay.sbcSecondaryUsername,
    sbcSecondaryPassword: sbcDisplay.sbcSecondaryPassword,
    sbcSecondaryDomain: sbcDisplay.sbcSecondaryDomain,
    sbcSecondaryLabel: sbcDisplay.sbcSecondaryLabel,
    sbcFailbackToPrimary: sbcDisplay.sbcFailbackToPrimary,
    hasSecondarySbc: sbcDisplay.hasSecondarySbc,
    lineLabel: row.line_label,
    circuitNumber: row.circuit_number,
    mode: row.mode,
    subscriberId: row.subscriber_id,
    homeSubscriberId: row.home_subscriber_id || null,
    secondarySubscriberId: row.secondary_subscriber_id || null,
    ringTimeout: row.ring_timeout,
    externalCommunityId: row.external_community_id,
    externalCommunityName: row.external_community_name,
    isExternalCommunity: row.is_external_community || false,
    sudoLineReference: row.sudo_line_reference,
    isActive: row.is_active,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  privateWireExists,
  getPrivateWireForCall,
  getPrivateWireForSignal,
  listAllPrivateWires,
  validateSubscriberIds,
  insertInternalWirePair,
  insertPrivateWire,
  getPrivateWireForUpdate,
  updatePrivateWire,
  getInternalWirePairByPairId,
  updateInternalWirePairShared,
  updateWireSubscriberId,
  updateWireLineLabel,
  getPrivateWireForLegacyMigration,
  getGroupSummaryById,
  updateLegacyBroadcastGroup,
  insertLegacyBroadcastGroup,
  markPrivateWireMigrated,
  getFullGroupById,
  getPrivateWiresByIds,
  deleteLineSessionsByWireIds,
  deletePrivateWiresByIds,
  getPrivateWireForDelete,
  deleteInternalWirePair,
  deletePrivateWireById,
  mapPrivateWireRow,
  listActiveLinesForCatalog,
  findPrivateWireByAor,
  findPrivateWireByAorOrLegacy,
  updatePrivateWireCallForward,
};
