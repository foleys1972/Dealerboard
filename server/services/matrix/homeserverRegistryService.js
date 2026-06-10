const logger = require('../../utils/logger');
const { getServerRole } = require('../../utils/serverRole');
const { getOrchestratorService } = require('../orchestratorService');
const { getMatrixFederationService } = require('../matrixFederationService');
const {
  mapHomeserverRow,
  listHomeservers,
  listHomeserversLegacy,
  getHomeserverById,
  getSubscriberIdByServerId,
  insertHomeserver,
  updateHomeserver,
  countRoomAssignmentsForHomeserver,
  deleteHomeserverById,
} = require('../../db/matrix/homeservers');
const { MatrixRouteError } = require('./errors');

async function reloadMatrixInfrastructure() {
  try {
    const orchestratorService = getOrchestratorService();
    if (orchestratorService.isInitialized) {
      await orchestratorService.loadManagedHomeservers();
    }
  } catch (error) {
    logger.warn('Failed to reload orchestrator homeservers:', error);
  }

  try {
    const federationService = getMatrixFederationService();
    if (federationService.isInitialized) {
      await federationService.reloadFederationConfig();
    }
  } catch (error) {
    logger.warn('Failed to reload federation config:', error);
  }
}

async function listHomeserverRecords({ isAdmin, userId, region, isActive }) {
  const rows = await listHomeservers({
    isAdmin,
    region,
    isActive: isActive !== undefined ? isActive === 'true' : undefined,
    userId,
  });

  return {
    homeservers: rows.map((row) => mapHomeserverRow(row, { includeMetadata: isAdmin })),
  };
}

async function listHomeserversOld(query) {
  const rows = await listHomeserversLegacy({
    region: query?.region,
    subscriberId: query?.subscriberId,
  });
  const homeservers = rows.map((row) => mapHomeserverRow(row, { includeNames: true }));
  return { success: true, homeservers, count: homeservers.length };
}

async function getHomeserverRecord(id) {
  const row = await getHomeserverById(id);
  if (!row) throw new MatrixRouteError(404, 'Homeserver not found');
  return { success: true, homeserver: mapHomeserverRow(row, { includeNames: true }) };
}

async function createHomeserver(body) {
  const {
    subscriberId,
    region,
    serverName,
    baseUrl,
    federationUrl,
    isSelfHosted = true,
    externalProvider,
    locationId,
    capacity = 1000,
    metadata = {},
  } = body;

  if (!region || !['US', 'UK', 'APAC'].includes(region)) {
    throw new MatrixRouteError(400, 'Valid region (US, UK, APAC) is required');
  }
  if (!serverName) throw new MatrixRouteError(400, 'Server name is required');
  if (!baseUrl) throw new MatrixRouteError(400, 'Base URL is required');

  let finalSubscriberId = subscriberId;
  if (!finalSubscriberId) {
    const serverRole = await getServerRole();
    if (serverRole.enableSubscriber && serverRole.serverId) {
      finalSubscriberId = await getSubscriberIdByServerId(serverRole.serverId);
    }
  }

  const id = `homeserver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const row = await insertHomeserver([
    id,
    finalSubscriberId,
    region,
    serverName,
    baseUrl,
    federationUrl || null,
    isSelfHosted,
    externalProvider || null,
    locationId || null,
    capacity,
    JSON.stringify(metadata),
  ]);

  await reloadMatrixInfrastructure();

  return {
    success: true,
    homeserver: mapHomeserverRow(row),
    message: 'Homeserver created successfully',
  };
}

async function updateHomeserverRecord(id, body) {
  const {
    region,
    serverName,
    baseUrl,
    federationUrl,
    isSelfHosted,
    externalProvider,
    locationId,
    isActive,
    capacity,
    metadata,
  } = body;

  const updates = [];
  const values = [];
  let paramCount = 1;

  if (region !== undefined) {
    if (!['US', 'UK', 'APAC'].includes(region)) {
      throw new MatrixRouteError(400, 'Invalid region. Must be US, UK, or APAC');
    }
    updates.push(`region = $${paramCount++}`);
    values.push(region);
  }
  if (serverName !== undefined) {
    updates.push(`server_name = $${paramCount++}`);
    values.push(serverName);
  }
  if (baseUrl !== undefined) {
    updates.push(`base_url = $${paramCount++}`);
    values.push(baseUrl);
  }
  if (federationUrl !== undefined) {
    updates.push(`federation_url = $${paramCount++}`);
    values.push(federationUrl);
  }
  if (isSelfHosted !== undefined) {
    updates.push(`is_self_hosted = $${paramCount++}`);
    values.push(isSelfHosted);
  }
  if (externalProvider !== undefined) {
    updates.push(`external_provider = $${paramCount++}`);
    values.push(externalProvider);
  }
  if (locationId !== undefined) {
    updates.push(`location_id = $${paramCount++}`);
    values.push(locationId);
  }
  if (isActive !== undefined) {
    updates.push(`is_active = $${paramCount++}`);
    values.push(isActive);
  }
  if (capacity !== undefined) {
    updates.push(`capacity = $${paramCount++}`);
    values.push(capacity);
  }
  if (metadata !== undefined) {
    updates.push(`metadata = $${paramCount++}`);
    values.push(JSON.stringify(metadata));
  }

  if (updates.length === 0) throw new MatrixRouteError(400, 'No fields to update');

  updates.push('updated_at = NOW()');
  values.push(id);

  const row = await updateHomeserver(id, updates, values);
  if (!row) throw new MatrixRouteError(404, 'Homeserver not found');

  await reloadMatrixInfrastructure();

  return {
    success: true,
    homeserver: mapHomeserverRow(row),
    message: 'Homeserver updated successfully',
  };
}

async function deleteHomeserverRecord(id) {
  const assignmentCount = await countRoomAssignmentsForHomeserver(id);
  if (assignmentCount > 0) {
    throw new MatrixRouteError(
      400,
      'Cannot delete homeserver with active room assignments. Deactivate it instead.'
    );
  }

  const deleted = await deleteHomeserverById(id);
  if (!deleted) throw new MatrixRouteError(404, 'Homeserver not found');

  await reloadMatrixInfrastructure();
  return { success: true, message: 'Homeserver deleted successfully' };
}

function getHomeserverOrchestratorStatus(homeserverId) {
  const orchestratorService = getOrchestratorService();
  if (!orchestratorService.isInitialized) {
    throw new MatrixRouteError(503, 'Orchestrator service not initialized');
  }

  const homeserver = orchestratorService.managedHomeservers.get(homeserverId);
  if (!homeserver) {
    throw new MatrixRouteError(404, 'Homeserver not found in orchestrator');
  }

  const health = orchestratorService.homeserverHealth.get(homeserverId);

  return {
    success: true,
    homeserver: {
      id: homeserver.id,
      serverName: homeserver.serverName,
      region: homeserver.region,
      baseUrl: homeserver.baseUrl,
      isActive: homeserver.isActive,
      capacity: homeserver.capacity,
      currentLoad: homeserver.currentLoad,
    },
    health: health || {
      status: 'unknown',
      lastCheck: null,
      responseTime: null,
      errorCount: 0,
    },
  };
}

module.exports = {
  listHomeserverRecords,
  listHomeserversOld,
  getHomeserverRecord,
  createHomeserver,
  updateHomeserverRecord,
  deleteHomeserverRecord,
  getHomeserverOrchestratorStatus,
  reloadMatrixInfrastructure,
};
