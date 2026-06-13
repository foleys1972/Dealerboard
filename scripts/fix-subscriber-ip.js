const { pool } = require('../server/db/pool');
(async () => {
  try {
    const r = await pool.query(
      `UPDATE subscribers
       SET server_url = REPLACE(server_url, '192.168.1.41', '192.168.1.58'), updated_at = NOW()
       WHERE server_url LIKE '%192.168.1.41%'
       RETURNING server_id, server_url`);
    if (r.rows.length === 0) console.log('No subscriber rows referenced 192.168.1.41');
    for (const row of r.rows) console.log('updated', row.server_id, '->', row.server_url);
    // Also check location_subscriber_assignments / system_settings for the stale IP
    const ss = await pool.query(`SELECT settings->'network' AS network FROM system_settings WHERE id='global'`);
    console.log('system_settings.network:', JSON.stringify(ss.rows[0]?.network || null));
  } catch (e) { console.log('error:', e.message); }
  finally { await pool.end(); }
})();
