function requireTenantAdmin(req, res, next) {
  const role = req.user?.role;
  if (role !== 'tenant_admin' && role !== 'platform_admin') {
    return res.status(403).json({ error: 'Tenant admin access required' });
  }
  return next();
}

function requireTenantContext(req, res, next) {
  const tid = req.user?.tid;
  if (!tid) {
    return res.status(400).json({ error: 'Tenant context required for this action' });
  }
  return next();
}

function deepMerge(base, override) {
  if (!override || typeof override !== 'object') return { ...(base || {}) };

  const merged = { ...(base || {}) };
  for (const [key, value] of Object.entries(override)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      merged[key] = deepMerge(merged[key], value);
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

module.exports = {
  requireTenantAdmin,
  requireTenantContext,
  deepMerge,
};
