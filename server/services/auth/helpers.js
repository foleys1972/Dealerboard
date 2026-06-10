function buildSipUriForUser(uid, tenantSlug) {
  const rootDomain = process.env.ROOT_DOMAIN || 'yourapp.com';
  const slug = tenantSlug || process.env.DEFAULT_TENANT_SLUG || 'default';
  return `sip:${uid}@${slug}.${rootDomain}`;
}

function getTenantRoom(tenantId, subTenantId) {
  const tid = tenantId || process.env.DEFAULT_TENANT_ID || 'tenant-default';
  const stid = subTenantId || process.env.DEFAULT_SUB_TENANT_ID || 'subtenant-default';
  return `tenant:${tid}:sub:${stid}`;
}

function collectOnlineKeys(socketHandler) {
  const onlineKeys = new Set();
  try {
    const sessions = socketHandler?.userSessions;
    if (sessions && sessions.entries) {
      for (const [, sess] of sessions.entries()) {
        if (!sess?.isAuthenticated || !sess?.userId) continue;
        onlineKeys.add(String(sess.userId));
        if (sess.username) onlineKeys.add(String(sess.username));
      }
    }
  } catch {}
  return onlineKeys;
}

module.exports = {
  buildSipUriForUser,
  getTenantRoom,
  collectOnlineKeys,
};
