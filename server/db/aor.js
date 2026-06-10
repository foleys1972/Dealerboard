const { pool } = require('./pool');

async function allocateSixDigitAor(db = pool, { maxAttempts = 500 } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = String(100000 + Math.floor(Math.random() * 900000)); // 100000-999999

    const exists = await db.query(
      `
        SELECT 1 FROM dealerboard_private_wires WHERE aor = $1
        UNION ALL
        SELECT 1 FROM dealerboard_ddi_lines WHERE aor = $1
        UNION ALL
        SELECT 1 FROM groups WHERE (metadata->>'aor') = $1
        LIMIT 1
      `,
      [candidate]
    );

    if (!exists.rows || exists.rows.length === 0) {
      return candidate;
    }
  }
  throw new Error('Failed to allocate unique 6-digit AOR (too many collisions)');
}

// ============================================================================
// AOR Resolution Helper Functions
// ============================================================================

async function resolveLineAorByLineId(lineId) {
  const id = String(lineId);

  // Try private wire first
  const pw = await pool.query(
    `
      SELECT
        pw.id,
        pw.aor,
        pw.line_label,
        pw.uri_address,
        pw.mode,
        pw.subscriber_id,
        pw.home_subscriber_id,
        pw.secondary_subscriber_id,
        s.server_id,
        s.server_url,
        s.connection_port
      FROM dealerboard_private_wires pw
      LEFT JOIN subscribers s ON s.id = COALESCE(pw.home_subscriber_id, pw.subscriber_id)
      WHERE pw.id = $1
      LIMIT 1
    `,
    [id]
  );

  if (pw.rows.length > 0) {
    return { kind: 'privateWire', ...pw.rows[0] };
  }

  const ddi = await pool.query(
    `
      SELECT
        d.id,
        d.aor,
        d.line_name,
        d.line_number,
        d.subscriber_id,
        d.home_subscriber_id,
        d.secondary_subscriber_id,
        s.server_id,
        s.server_url,
        s.connection_port
      FROM dealerboard_ddi_lines d
      LEFT JOIN subscribers s ON s.id = COALESCE(d.home_subscriber_id, d.subscriber_id)
      WHERE d.id = $1
      LIMIT 1
    `,
    [id]
  );

  if (ddi.rows.length > 0) {
    return { kind: 'ddi', ...ddi.rows[0] };
  }

  return null;
}

async function resolveLineAorByAor(aor) {
  const a = String(aor);

  const pw = await pool.query(
    `
      SELECT
        pw.id,
        pw.aor,
        pw.line_label,
        pw.uri_address,
        pw.mode,
        pw.subscriber_id,
        pw.home_subscriber_id,
        pw.secondary_subscriber_id,
        s.server_id,
        s.server_url,
        s.connection_port
      FROM dealerboard_private_wires pw
      LEFT JOIN subscribers s ON s.id = COALESCE(pw.home_subscriber_id, pw.subscriber_id)
      WHERE pw.aor = $1
      LIMIT 1
    `,
    [a]
  );
  if (pw.rows.length > 0) {
    return { kind: 'privateWire', ...pw.rows[0] };
  }

  const ddi = await pool.query(
    `
      SELECT
        d.id,
        d.aor,
        d.line_name,
        d.line_number,
        d.subscriber_id,
        d.home_subscriber_id,
        d.secondary_subscriber_id,
        s.server_id,
        s.server_url,
        s.connection_port
      FROM dealerboard_ddi_lines d
      LEFT JOIN subscribers s ON s.id = COALESCE(d.home_subscriber_id, d.subscriber_id)
      WHERE d.aor = $1
      LIMIT 1
    `,
    [a]
  );
  if (ddi.rows.length > 0) {
    return { kind: 'ddi', ...ddi.rows[0] };
  }

  return null;
}

module.exports = {
  allocateSixDigitAor,
  resolveLineAorByLineId,
  resolveLineAorByAor,
};
