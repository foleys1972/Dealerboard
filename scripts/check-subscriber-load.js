// Reads subscribers and their reported load from the DB. Diagnostic for capacity telemetry.
const { pool } = require('../server/db/pool');
(async () => {
  try {
    const r = await pool.query(
      `SELECT server_id, status, metadata->'load' AS load,
              location_id, server_url
       FROM subscribers ORDER BY server_id`);
    if (r.rows.length === 0) { console.log('No subscribers registered.'); }
    for (const row of r.rows) {
      console.log(`subscriber=${row.server_id} status=${row.status} url=${row.server_url}`);
      console.log('  load=', JSON.stringify(row.load));
    }
  } catch (e) { console.log('query error:', e.message); }
  finally { await pool.end(); }
})();
