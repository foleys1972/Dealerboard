const crypto = require('crypto');
const bcrypt = require('bcrypt');
const {
  createTenant,
  listTenants,
  updateTenant,
  setTenantActive,
  ensureTenantScaffold,
  createUser,
  findUsers,
} = require('../../services/databaseService');
const { PlatformAdminError } = require('./errors');

function mapPgDuplicateTenantError(error) {
  if (error && (error.code === '23505' || error.code === 23505)) {
    throw new PlatformAdminError(409, 'Tenant slug or id already exists');
  }
  throw error;
}

function mapPgDuplicateUserError(error) {
  if (error && (error.code === '23505' || error.code === 23505)) {
    throw new PlatformAdminError(409, 'User already exists');
  }
  throw error;
}

async function createTenantRecord(body) {
  const { slug, name, id } = body || {};
  if (!slug || !name) {
    throw new PlatformAdminError(400, 'Missing required fields: slug, name');
  }

  const tenantId = id || `tenant_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  try {
    const created = await createTenant({
      id: tenantId,
      slug,
      name,
      isActive: true,
    });
    return { status: 201, body: { success: true, tenant: created } };
  } catch (error) {
    mapPgDuplicateTenantError(error);
  }
}

async function listTenantRecords() {
  const tenants = await listTenants();
  return { success: true, tenants };
}

async function updateTenantRecord(tenantId, body) {
  if (!tenantId) throw new PlatformAdminError(400, 'tenantId is required');

  const { name, isActive } = body || {};
  const updated = await updateTenant(tenantId, { name, isActive });
  if (!updated) throw new PlatformAdminError(404, 'Tenant not found');

  return { success: true, tenant: updated };
}

async function deactivateTenant(tenantId) {
  if (!tenantId) throw new PlatformAdminError(400, 'tenantId is required');

  const updated = await setTenantActive(tenantId, false);
  if (!updated) throw new PlatformAdminError(404, 'Tenant not found');

  return { success: true, tenant: updated };
}

async function createTenantAdmin(tenantId, body) {
  if (!tenantId) throw new PlatformAdminError(400, 'tenantId is required');

  const { username, email, firstName, lastName, password, companyName, country } = body || {};
  if (!username || !password) {
    throw new PlatformAdminError(400, 'Missing required fields: username, password');
  }

  const existing = await findUsers({ username });
  if (existing && existing.length > 0) {
    throw new PlatformAdminError(409, 'Username already exists');
  }

  const scaffold = await ensureTenantScaffold(tenantId);
  const hashedPassword = await bcrypt.hash(password, 10);
  const now = new Date();

  try {
    const createdUser = await createUser({
      id: `user-${Date.now()}`,
      username,
      email: email || null,
      firstName: firstName || null,
      lastName: lastName || null,
      displayName: `${firstName || ''} ${lastName || ''}`.trim() || username,
      password: hashedPassword,
      role: 'tenant_admin',
      isActive: true,
      source: 'local',
      companyName: companyName || null,
      country: country || null,
      tenantId,
      subTenantId: scaffold?.subTenant?.id,
      siteId: scaffold?.site?.id,
      createdAt: now,
      lastLogin: null,
    });

    return {
      status: 201,
      body: {
        success: true,
        user: {
          id: createdUser.username || createdUser.id,
          username: createdUser.username,
          role: createdUser.role,
          tenantId: createdUser.tenantId,
          subTenantId: createdUser.subTenantId,
          siteId: createdUser.siteId,
        },
      },
    };
  } catch (error) {
    mapPgDuplicateUserError(error);
  }
}

module.exports = {
  createTenantRecord,
  listTenantRecords,
  updateTenantRecord,
  deactivateTenant,
  createTenantAdmin,
};
