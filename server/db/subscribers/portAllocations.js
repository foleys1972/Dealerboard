const { pool } = require('../pool');

async function listPortAllocations() {
  const result = await pool.query(
    `SELECT a.subscriber_id, a.port, a.assigned_at, a.assigned_by, a.notes,
            s.server_id, s.name, s.server_url, s.connection_port, s.metadata
     FROM subscriber_port_allocations a
     LEFT JOIN subscribers s ON s.id = a.subscriber_id
     ORDER BY a.port ASC`
  );
  return result.rows;
}

function mapPortAllocationRow(row) {
  return {
    subscriberId: row.subscriber_id,
    serverId: row.server_id,
    name: row.name,
    serverUrl: row.server_url,
    port: row.port,
    assignedAt: row.assigned_at,
    assignedBy: row.assigned_by,
    notes: row.notes,
    subscriberConnectionPort: row.connection_port,
    agent: {
      allowedServices: Array.isArray(row.metadata?.agent?.allowedServices)
        ? row.metadata.agent.allowedServices
        : [],
    },
  };
}

async function setPortAllocation(subscriberId, port, assignedBy, notes) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM subscriber_port_allocations WHERE subscriber_id = $1',
      [subscriberId]
    );

    try {
      await client.query(
        `INSERT INTO subscriber_port_allocations (subscriber_id, port, assigned_by, notes)
         VALUES ($1, $2, $3, $4)`,
        [subscriberId, port, assignedBy, notes]
      );
    } catch (e) {
      if (e && e.code === '23505') {
        await client.query('ROLLBACK');
        return { conflict: true, port };
      }
      throw e;
    }

    await client.query(
      `UPDATE subscribers SET connection_port = $1, updated_at = NOW() WHERE id = $2`,
      [port, subscriberId]
    );

    await client.query('COMMIT');
    return { conflict: false };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function clearPortAllocation(subscriberId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM subscriber_port_allocations WHERE subscriber_id = $1',
      [subscriberId]
    );
    await client.query(
      `UPDATE subscribers SET updated_at = NOW() WHERE id = $1`,
      [subscriberId]
    );
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listPortAllocations,
  mapPortAllocationRow,
  setPortAllocation,
  clearPortAllocation,
};
