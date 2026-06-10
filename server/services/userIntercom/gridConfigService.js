const DEFAULT_GRID_CONFIG = {
  columns: 3,
  gap: '1rem',
  mobileColumns: 1,
  mobileGap: '0.75rem',
  tabletColumns: 2,
  contactColumns: 2,
  contactGap: '0.75rem',
  contactMobileColumns: 1,
};

const SETTINGS_ID = 'user-intercom-config';

const { getSettingsRow, upsertSettings } = require('../../db/systemSettings/settings');
const { UserIntercomError } = require('./errors');

function normalizeGridConfig(gridConfig) {
  return {
    columns: Math.max(1, Math.min(6, parseInt(gridConfig.columns, 10) || 3)),
    gap: gridConfig.gap || '1rem',
    mobileColumns: Math.max(1, Math.min(3, parseInt(gridConfig.mobileColumns, 10) || 1)),
    mobileGap: gridConfig.mobileGap || '0.75rem',
    tabletColumns: Math.max(1, Math.min(4, parseInt(gridConfig.tabletColumns, 10) || 2)),
    contactColumns: Math.max(1, Math.min(6, parseInt(gridConfig.contactColumns, 10) || 2)),
    contactGap: gridConfig.contactGap || '0.75rem',
    contactMobileColumns: Math.max(1, Math.min(2, parseInt(gridConfig.contactMobileColumns, 10) || 1)),
  };
}

async function getGridConfig() {
  const settings = await getSettingsRow(SETTINGS_ID);
  const config = settings?.gridConfig || DEFAULT_GRID_CONFIG;
  return { config };
}

async function updateGridConfig(gridConfig, updatedBy) {
  if (!gridConfig) {
    throw new UserIntercomError(400, 'gridConfig is required');
  }

  const validConfig = normalizeGridConfig(gridConfig);
  const existingSettings = await getSettingsRow(SETTINGS_ID);
  const mergedSettings = {
    ...existingSettings,
    gridConfig: validConfig,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  await upsertSettings(SETTINGS_ID, mergedSettings, updatedBy);

  return {
    success: true,
    config: validConfig,
    message: 'Grid configuration updated successfully',
  };
}

module.exports = {
  DEFAULT_GRID_CONFIG,
  getGridConfig,
  updateGridConfig,
};
