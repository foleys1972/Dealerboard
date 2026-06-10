const { getUserByIdOrUsername, updateUser, findGroups } = require('../../services/databaseService');
const gridConfigService = require('../../services/userIntercom/gridConfigService');

function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  return Boolean(value === true || value === 'true' || value === 1 || value === '1');
}

async function resolveTargetUser(req) {
  const targetId = req.query.userId || req.body?.userId || null;
  const identifier = targetId || req.user.id || req.user.username;
  if (!identifier) return null;
  return getUserByIdOrUsername(identifier);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(v => (v === null || v === undefined ? '' : String(v)).trim())
    .filter(v => v.length > 0);
}

function normalizeCallMode(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

function isBroadcastGroup(group) {
  const mode = normalizeCallMode(group?.callMode);
  return mode === 'broadcast';
}

function isSelfRequest(req, targetUser) {
  if (!req?.user || !targetUser) return false;

  const callerUsername = req.user.username ? String(req.user.username) : null;
  const callerId = req.user.id ? String(req.user.id) : null;
  const callerUid = req.user.uid ? String(req.user.uid) : null;

  const targetUsername = targetUser.username ? String(targetUser.username) : null;
  const targetId = targetUser.id ? String(targetUser.id) : null;
  const targetUid = targetUser.uid ? String(targetUser.uid) : null;

  if (callerUid && targetUid && callerUid === targetUid) return true;
  if (callerUsername && targetUsername && callerUsername === targetUsername) return true;

  // Backward compatibility: tokens may have id=username, while DB has separate id.
  if (callerId && targetUsername && callerId === targetUsername) return true;
  if (callerId && targetId && callerId === targetId) return true;

  return false;
}

function ensureCanConfigureUser(req, targetUser) {
  const callerRole = req.user?.role;
  const defaultTenantId = process.env.DEFAULT_TENANT_ID || 'tenant-default';

  const rawCallerTenantId = req.user?.tid || req.user?.tenantId || null;
  const rawTargetTenantId = targetUser?.tenantId || null;

  const callerTenantId = rawCallerTenantId && rawCallerTenantId !== defaultTenantId ? rawCallerTenantId : null;
  const targetTenantId = rawTargetTenantId && rawTargetTenantId !== defaultTenantId ? rawTargetTenantId : null;

  // Self-service: allow a logged-in user to read/update their own intercom settings.
  if (isSelfRequest(req, targetUser)) {
    return { ok: true };
  }

  if (targetTenantId) {
    if (callerRole !== 'tenant_admin') {
      return { ok: false, status: 403, error: 'Tenant admin access required to configure tenant users' };
    }
    if (!callerTenantId || callerTenantId !== targetTenantId) {
      return { ok: false, status: 403, error: 'Not authorized to configure users outside your tenant' };
    }
    return { ok: true };
  }

  if (callerRole !== 'platform_admin') {
    return { ok: false, status: 403, error: 'Platform admin access required to configure tenantless users' };
  }
  if (callerTenantId) {
    return { ok: false, status: 403, error: 'Platform admin access is restricted to tenantless scope' };
  }
  return { ok: true };
}

module.exports = {
  normalizeBoolean,
  resolveTargetUser,
  normalizeStringArray,
  normalizeCallMode,
  isBroadcastGroup,
  isSelfRequest,
  ensureCanConfigureUser,
  getUserByIdOrUsername,
  updateUser,
  findGroups,
  gridConfigService,
  DEFAULT_GRID_CONFIG: gridConfigService.DEFAULT_GRID_CONFIG,
};
