const logger = require('../../utils/logger');
const { matrixService } = require('../matrixService');
const { clearCache: clearServerRoleCache } = require('../../utils/serverRole');
const { complianceService } = require('../complianceService');
const { getSettingsRow, upsertSettings } = require('../../db/systemSettings/settings');
const {
  resolveSettingsId,
  ensureDefaults,
  buildEnvDefaults,
  validateSettingsUpdate,
  mergeSettings,
} = require('./helpers');
const { SystemSettingsError } = require('./errors');

async function getSettings(user) {
  const settingsId = resolveSettingsId(user);

  try {
    logger.info('System settings GET', {
      userId: user.id,
      username: user.username,
      tid: user.tid,
      tenantId: user.tenantId,
      settingsId,
    });
  } catch {}

  const globalRow = await getSettingsRow(settingsId);
  const globalSettings = Object.keys(globalRow || {}).length > 0
    ? globalRow
    : buildEnvDefaults();

  return {
    success: true,
    settings: ensureDefaults(globalSettings),
  };
}

async function updateSettings(user, payload) {
  const settingsId = resolveSettingsId(user);
  const settings = payload?.settings ?? payload;
  const currentUserId = user.id || user.userId;

  try {
    logger.info('System settings PUT', {
      userId: currentUserId,
      tid: user.tid,
      tenantId: user.tenantId,
      settingsId,
      hasRecordings: !!settings?.recordings,
    });
  } catch {}

  if (!settings || typeof settings !== 'object') {
    throw new SystemSettingsError(400, 'Invalid settings payload');
  }

  validateSettingsUpdate(settings);

  const globalUpdate = { ...settings };
  let mergedGlobalSettings;

  if (Object.keys(globalUpdate).length > 0) {
    const existingGlobalSettings = await getSettingsRow(settingsId);
    mergedGlobalSettings = mergeSettings(existingGlobalSettings, globalUpdate);
    await upsertSettings(settingsId, mergedGlobalSettings, currentUserId);
  } else {
    mergedGlobalSettings = await getSettingsRow(settingsId);
  }

  if (mergedGlobalSettings.roomArchive?.enabled && mergedGlobalSettings.roomArchive?.inactiveDays) {
    try {
      await matrixService.archiveInactiveRooms(mergedGlobalSettings.roomArchive.inactiveDays);
    } catch (error) {
      logger.error('Failed to run initial archive:', error);
    }
  }

  if (settings.serverRole) {
    clearServerRoleCache();
    logger.info('Server role cache cleared after update');
    try {
      const { ensureLocalSubscriberRecord } = require('../subscribers/localSubscriberRegistry');
      const { getServerRole } = require('../../utils/serverRole');
      const role = await getServerRole();
      if (role?.enableSubscriber) {
        await ensureLocalSubscriberRecord({ serverRole: role });
        logger.info('Local subscriber record ensured after server role update', {
          serverId: role.serverId,
          hybrid: !!role.enablePublisher,
        });
      }
    } catch (error) {
      logger.warn('Failed to ensure local subscriber record after server role update:', error?.message || error);
    }
  }

  const responseSettings = ensureDefaults(mergedGlobalSettings);

  try {
    if (responseSettings.compliance && typeof complianceService.applyConfig === 'function') {
      await complianceService.applyConfig(responseSettings.compliance);
    }
  } catch (error) {
    logger.warn('Failed to apply compliance config after system settings update', error.message);
  }

  return {
    success: true,
    settings: responseSettings,
    message: 'System settings updated successfully',
  };
}

async function archiveRooms(user) {
  const tenantId = user.tid || user.tenantId;
  if (tenantId) {
    throw new SystemSettingsError(
      403,
      'Platform system actions apply only to users not in a tenant'
    );
  }

  const settings = await getSettingsRow('global');
  const archiveConfig = settings.roomArchive || { enabled: false, inactiveDays: 90 };

  if (!archiveConfig.enabled) {
    throw new SystemSettingsError(400, 'Room archiving is not enabled');
  }

  const result = await matrixService.archiveInactiveRooms(archiveConfig.inactiveDays);

  return {
    success: true,
    ...result,
    message: `Archived ${result.archived} inactive rooms`,
  };
}

module.exports = {
  getSettings,
  updateSettings,
  archiveRooms,
};
