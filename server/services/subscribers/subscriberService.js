const crypto = require('crypto');
const {
  listSubscribers,
  getSubscriberById,
  subscriberExists,
  insertSubscriber,
  updateSubscriber,
  deleteSubscriberById,
  mapSubscriberRow,
} = require('../../db/subscribers/subscribers');
const { SubscriberError } = require('./errors');
const { ensureLocalSubscriberRecord } = require('./localSubscriberRegistry');
const { getServerRole } = require('../../utils/serverRole');

async function listSubscriberRecords() {
  try {
    const role = await getServerRole();
    if (role?.enableSubscriber) {
      await ensureLocalSubscriberRecord({ serverRole: role });
    }
  } catch (error) {
    // Non-fatal — still return whatever is in the table.
  }

  const rows = await listSubscribers();
  return {
    success: true,
    subscribers: rows.map((row) => mapSubscriberRow(row)),
  };
}

async function getSubscriberRecord(subscriberId) {
  const row = await getSubscriberById(subscriberId);
  if (!row) throw new SubscriberError(404, 'Subscriber not found');

  return {
    success: true,
    subscriber: mapSubscriberRow(row),
  };
}

async function createSubscriberRecord(body) {
  const {
    name,
    serverUrl,
    serverId,
    locationId,
    connectionPort = 3002,
    config = {},
    metadata = {},
  } = body || {};

  if (!name || !serverUrl || !serverId) {
    throw new SubscriberError(400, 'Name, serverUrl, and serverId are required');
  }

  const id = `subscriber_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const authToken = crypto.randomBytes(32).toString('hex');

  const row = await insertSubscriber([
    id,
    name,
    serverUrl,
    serverId,
    locationId || null,
    connectionPort,
    'disconnected',
    true,
    JSON.stringify(config),
    JSON.stringify(metadata),
    authToken,
  ]);

  return {
    status: 201,
    body: {
      success: true,
      subscriber: mapSubscriberRow(row, { authToken }),
      message: 'Subscriber created successfully',
    },
  };
}

async function updateSubscriberRecord(subscriberId, body) {
  const {
    name,
    serverUrl,
    serverId,
    locationId,
    connectionPort,
    isActive,
    config,
    metadata,
  } = body || {};

  const updates = [];
  const values = [];
  let paramCount = 1;

  if (name !== undefined) {
    updates.push(`name = $${paramCount++}`);
    values.push(name);
  }
  if (serverUrl !== undefined) {
    updates.push(`server_url = $${paramCount++}`);
    values.push(serverUrl);
  }
  if (serverId !== undefined) {
    updates.push(`server_id = $${paramCount++}`);
    values.push(serverId);
  }
  if (locationId !== undefined) {
    updates.push(`location_id = $${paramCount++}`);
    values.push(locationId || null);
  }
  if (connectionPort !== undefined) {
    updates.push(`connection_port = $${paramCount++}`);
    values.push(connectionPort);
  }
  if (isActive !== undefined) {
    updates.push(`is_active = $${paramCount++}`);
    values.push(isActive);
  }
  if (config !== undefined) {
    updates.push(`config = $${paramCount++}`);
    values.push(JSON.stringify(config));
  }
  if (metadata !== undefined) {
    updates.push(`metadata = $${paramCount++}`);
    values.push(JSON.stringify(metadata));
  }

  if (updates.length === 0) {
    throw new SubscriberError(400, 'No fields to update');
  }

  updates.push('updated_at = NOW()');
  values.push(subscriberId);

  const row = await updateSubscriber(subscriberId, updates, values);
  if (!row) throw new SubscriberError(404, 'Subscriber not found');

  return {
    success: true,
    subscriber: mapSubscriberRow(row),
    message: 'Subscriber updated successfully',
  };
}

async function deleteSubscriberRecord(subscriberId) {
  const row = await deleteSubscriberById(subscriberId);
  if (!row) throw new SubscriberError(404, 'Subscriber not found');

  return {
    success: true,
    message: 'Subscriber deleted successfully',
  };
}

async function testSubscriberConnection(subscriberId, publisherService) {
  const row = await getSubscriberById(subscriberId);
  if (!row) throw new SubscriberError(404, 'Subscriber not found');

  if (!publisherService) {
    throw new SubscriberError(
      503,
      'Publisher subscriber service not available. Server must be in publisher mode.'
    );
  }

  const isConnected = publisherService.isSubscriberConnected(row.id);

  return {
    success: true,
    message: isConnected ? 'Subscriber is connected' : 'Subscriber is not connected',
    subscriber: {
      id: row.id,
      serverUrl: row.server_url,
      serverId: row.server_id,
      status: isConnected ? 'connected' : row.status,
      isConnected,
    },
  };
}

module.exports = {
  listSubscriberRecords,
  getSubscriberRecord,
  createSubscriberRecord,
  updateSubscriberRecord,
  deleteSubscriberRecord,
  testSubscriberConnection,
};
