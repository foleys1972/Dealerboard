/**
 * Role-based navigation helpers for consistent cross-app flow.
 */

export function getDefaultHomePath(user) {
  if (!user) return '/login';
  if (user.role === 'platform_admin' || user.role === 'admin') return '/admin';
  if (user.role === 'tenant_admin') return '/tenant-admin';
  return '/intercom';
}

export function canAccessAdmin(user) {
  return user?.role === 'platform_admin' || user?.role === 'admin';
}

export function canAccessTenantAdmin(user) {
  return (
    user?.role === 'tenant_admin' ||
    user?.role === 'platform_admin' ||
    user?.role === 'admin'
  );
}

export function getAppNavItems(user) {
  const items = [
    { id: 'trading', label: 'Trading', path: '/intercom', icon: 'grid' },
    { id: 'recordings', label: 'Recordings', path: '/recordings', icon: 'mic' },
  ];

  if (canAccessAdmin(user)) {
    items.push({ id: 'admin', label: 'Admin', path: '/admin', icon: 'shield' });
    items.push({ id: 'federation', label: 'Federation', path: '/federation', icon: 'globe' });
  }

  if (canAccessTenantAdmin(user)) {
    items.push({ id: 'tenant', label: 'Tenant', path: '/tenant-admin', icon: 'building' });
  }

  items.push({ id: 'settings', label: 'Settings', path: '/settings', icon: 'settings' });

  return items;
}

export function getActiveNavId(pathname) {
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/federation')) return 'federation';
  if (pathname.startsWith('/tenant-admin')) return 'tenant';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/recordings')) return 'recordings';
  if (pathname.startsWith('/intercom') || pathname === '/') return 'trading';
  return null;
}
