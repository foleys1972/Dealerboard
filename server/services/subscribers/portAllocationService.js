const {
  listPortAllocations,
  mapPortAllocationRow,
  setPortAllocation,
  clearPortAllocation,
} = require('../../db/subscribers/portAllocations');
const { subscriberExists } = require('../../db/subscribers/subscribers');
const { SubscriberError } = require('./errors');

async function listAllocationRecords() {
  const rows = await listPortAllocations();
  return {
    success: true,
    allocations: rows.map(mapPortAllocationRow),
  };
}

async function assignPort(subscriberId, body, assignedBy) {
  const rawPort = body?.port;
  const port = parseInt(rawPort, 10);
  const notes = body?.notes !== undefined ? String(body.notes) : null;

  if (!Number.isFinite(port) || port < 1024 || port > 65535) {
    throw new SubscriberError(400, 'port must be an integer between 1024 and 65535');
  }

  if (!(await subscriberExists(subscriberId))) {
    throw new SubscriberError(404, 'Subscriber not found');
  }

  const result = await setPortAllocation(subscriberId, port, assignedBy, notes);
  if (result.conflict) {
    throw new SubscriberError(409, `Port ${port} is already allocated`);
  }

  return { success: true, subscriberId, port };
}

async function removePortAllocation(subscriberId) {
  await clearPortAllocation(subscriberId);
  return { success: true };
}

module.exports = {
  listAllocationRecords,
  assignPort,
  removePortAllocation,
};
