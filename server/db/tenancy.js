const { pool } = require('./pool');

function normalizeTenantPair(tenantIdA, tenantIdB) {
  const a = tenantIdA || null;
  const b = tenantIdB || null;

  if (a === null && b === null) {
    return { tenantAId: null, tenantBId: null };
  }

  // Put null second for consistency (tenant <-> general population)
  if (a !== null && b === null) return { tenantAId: a, tenantBId: null };
  if (a === null && b !== null) return { tenantAId: b, tenantBId: null };

  // Both non-null: deterministic ordering
  return String(a) <= String(b)
    ? { tenantAId: a, tenantBId: b }
    : { tenantAId: b, tenantBId: a };
}

async function createTenant(tenant) {
  const { id, slug, name, isActive = true } = tenant || {};
  if (!id || !slug || !name) {
    throw new Error('createTenant requires id, slug, and name');
  }

  const result = await pool.query(
    `
      INSERT INTO tenants (id, slug, name, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING *;
    `,
    [id, slug, name, isActive]
  );

  return result.rows[0] || null;
}

async function updateTenant(tenantId, updates = {}) {
  if (!tenantId) throw new Error('updateTenant requires tenantId');

  const allowed = {
    name: 'name',
    isActive: 'is_active',
  };

  const setClauses = [];
  const values = [];

  Object.keys(allowed).forEach((key) => {
    if (updates[key] !== undefined) {
      setClauses.push(`${allowed[key]} = $${values.length + 1}`);
      values.push(key === 'isActive' ? Boolean(updates[key]) : updates[key]);
    }
  });

  if (setClauses.length === 0) {
    throw new Error('updateTenant requires at least one updatable field (name, isActive)');
  }

  values.push(tenantId);

  const result = await pool.query(
    `
      UPDATE tenants
      SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING *;
    `,
    values
  );

  return result.rows[0] || null;
}

async function setTenantActive(tenantId, isActive) {
  return updateTenant(tenantId, { isActive: Boolean(isActive) });
}

async function getTenantSettings(tenantId) {
  if (!tenantId) throw new Error('getTenantSettings requires tenantId');
  const result = await pool.query(
    `
      SELECT settings
      FROM tenant_settings
      WHERE tenant_id = $1;
    `,
    [tenantId]
  );
  return result.rows.length > 0 ? (result.rows[0].settings || {}) : {};
}

async function updateTenantSettings(tenantId, settings, updatedBy = null) {
  if (!tenantId) throw new Error('updateTenantSettings requires tenantId');
  if (!settings || typeof settings !== 'object') throw new Error('updateTenantSettings requires a settings object');

  const result = await pool.query(
    `
      INSERT INTO tenant_settings (tenant_id, settings, updated_by, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET
        settings = EXCLUDED.settings,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING settings;
    `,
    [tenantId, JSON.stringify(settings), updatedBy]
  );

  return result.rows.length > 0 ? (result.rows[0].settings || {}) : {};
}

async function createSite(site) {
  const { id, tenantId, subTenantId, name, isActive = true } = site || {};
  if (!id || !tenantId || !subTenantId || !name) {
    throw new Error('createSite requires id, tenantId, subTenantId, and name');
  }

  const result = await pool.query(
    `
      INSERT INTO sites (id, tenant_id, sub_tenant_id, name, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *;
    `,
    [id, tenantId, subTenantId, name, isActive]
  );

  return result.rows[0] || null;
}

async function getDefaultSubTenantForTenant(tenantId) {
  const result = await pool.query(
    `
      SELECT *
      FROM sub_tenants
      WHERE tenant_id = $1
      ORDER BY created_at ASC
      LIMIT 1;
    `,
    [tenantId]
  );
  return result.rows[0] || null;
}

async function getDefaultSiteForTenant(tenantId) {
  const result = await pool.query(
    `
      SELECT *
      FROM sites
      WHERE tenant_id = $1
      ORDER BY created_at ASC
      LIMIT 1;
    `,
    [tenantId]
  );
  return result.rows[0] || null;
}

async function ensureTenantScaffold(tenantId, options = {}) {
  if (!tenantId) throw new Error('ensureTenantScaffold requires tenantId');

  const {
    defaultSubTenantName = 'Default',
    defaultSiteName = 'Default',
    dataRegion = process.env.DEFAULT_DATA_REGION || null,
  } = options;

  let subTenant = await getDefaultSubTenantForTenant(tenantId);
  if (!subTenant) {
    const subTenantId = `subtenant_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    subTenant = await createSubTenant({
      id: subTenantId,
      tenantId,
      name: defaultSubTenantName,
      dataRegion,
      isActive: true,
    });
  }

  let site = await getDefaultSiteForTenant(tenantId);
  if (!site) {
    const siteId = `site_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    site = await createSite({
      id: siteId,
      tenantId,
      subTenantId: subTenant.id,
      name: defaultSiteName,
      isActive: true,
    });
  }

  return { subTenant, site };
}

async function listTenants() {
  const result = await pool.query(
    `
      SELECT *
      FROM tenants
      ORDER BY created_at DESC;
    `
  );
  return result.rows;
}

async function getTenantByIdOrSlug(identifier) {
  if (!identifier) return null;
  const result = await pool.query(
    `
      SELECT *
      FROM tenants
      WHERE id = $1 OR slug = $1
      LIMIT 1;
    `,
    [identifier]
  );
  return result.rows[0] || null;
}

async function createSubTenant(subTenant) {
  const { id, tenantId, name, dataRegion = null, isActive = true } = subTenant || {};
  if (!id || !tenantId || !name) {
    throw new Error('createSubTenant requires id, tenantId, and name');
  }

  const result = await pool.query(
    `
      INSERT INTO sub_tenants (id, tenant_id, name, data_region, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *;
    `,
    [id, tenantId, name, dataRegion, isActive]
  );

  return result.rows[0] || null;
}

async function listSubTenants(tenantId) {
  const result = await pool.query(
    `
      SELECT *
      FROM sub_tenants
      WHERE tenant_id = $1
      ORDER BY created_at DESC;
    `,
    [tenantId]
  );
  return result.rows;
}

async function setUserPublicFlag(userIdOrUsername, isPublic) {
  const { updateUser } = require('./users');
  return updateUser(userIdOrUsername, { isPublic: Boolean(isPublic) });
}

async function requestTenantRelationship({
  requestingTenantId,
  targetTenantId,
  capabilities = {},
}) {
  const { tenantAId, tenantBId } = normalizeTenantPair(requestingTenantId, targetTenantId);
  if (!tenantAId) {
    throw new Error('requestTenantRelationship requires requestingTenantId');
  }

  const now = new Date();
  const id = `rel_${now.getTime()}_${Math.random().toString(36).slice(2, 10)}`;

  // Determine initial approvals based on whether this is tenant<->tenant or tenant<->general-population
  const isGeneral = tenantBId === null;
  const approvedByTenantAAt = requestingTenantId === tenantAId ? now : null;
  const approvedByTenantBAt = isGeneral ? now : (requestingTenantId === tenantBId ? now : null);

  const status = isGeneral
    ? 'active'
    : (approvedByTenantAAt && approvedByTenantBAt ? 'active' : 'pending');

  const result = await pool.query(
    `
      INSERT INTO tenant_relationships (
        id, tenant_a_id, tenant_b_id,
        status, requested_by_tenant_id,
        approved_by_tenant_a_at, approved_by_tenant_b_at,
        capabilities,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW(), NOW())
      ON CONFLICT (tenant_a_id, tenant_b_id)
      DO UPDATE SET
        requested_by_tenant_id = EXCLUDED.requested_by_tenant_id,
        capabilities = EXCLUDED.capabilities,
        updated_at = NOW()
      RETURNING *;
    `,
    [
      id,
      tenantAId,
      tenantBId,
      status,
      requestingTenantId,
      approvedByTenantAAt,
      approvedByTenantBAt,
      JSON.stringify(capabilities || {}),
    ]
  );

  return result.rows[0] || null;
}

async function getTenantRelationshipById(id) {
  const result = await pool.query(
    `SELECT * FROM tenant_relationships WHERE id = $1 LIMIT 1;`,
    [id]
  );
  return result.rows[0] || null;
}

async function listTenantRelationships(tenantId) {
  const result = await pool.query(
    `
      SELECT *
      FROM tenant_relationships
      WHERE tenant_a_id = $1 OR tenant_b_id = $1
      ORDER BY updated_at DESC;
    `,
    [tenantId]
  );
  return result.rows;
}

async function approveTenantRelationship({ relationshipId, approverTenantId }) {
  const rel = await getTenantRelationshipById(relationshipId);
  if (!rel) throw new Error('Relationship not found');

  const isGeneral = rel.tenant_b_id === null;

  if (isGeneral) {
    // tenant<->general population: only tenant_a approval is relevant.
    if (rel.tenant_a_id !== approverTenantId) {
      throw new Error('Only the tenant can approve general population access');
    }
    const result = await pool.query(
      `
        UPDATE tenant_relationships
        SET status = 'active',
            approved_by_tenant_a_at = COALESCE(approved_by_tenant_a_at, NOW()),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *;
      `,
      [relationshipId]
    );
    return result.rows[0] || null;
  }

  // tenant<->tenant: both must approve
  if (rel.tenant_a_id !== approverTenantId && rel.tenant_b_id !== approverTenantId) {
    throw new Error('Approver tenant is not part of this relationship');
  }

  const setTenantA = rel.tenant_a_id === approverTenantId;
  const column = setTenantA ? 'approved_by_tenant_a_at' : 'approved_by_tenant_b_at';

  const result = await pool.query(
    `
      UPDATE tenant_relationships
      SET ${column} = COALESCE(${column}, NOW()),
          status = CASE
            WHEN (COALESCE(approved_by_tenant_a_at, NOW()) IS NOT NULL)
             AND (COALESCE(approved_by_tenant_b_at, NOW()) IS NOT NULL)
            THEN 'active'
            ELSE status
          END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `,
    [relationshipId]
  );

  return result.rows[0] || null;
}

async function rejectTenantRelationship({ relationshipId, approverTenantId }) {
  const rel = await getTenantRelationshipById(relationshipId);
  if (!rel) throw new Error('Relationship not found');

  const isGeneral = rel.tenant_b_id === null;
  if (isGeneral) {
    if (rel.tenant_a_id !== approverTenantId) {
      throw new Error('Only the tenant can reject general population access');
    }
  } else {
    if (rel.tenant_a_id !== approverTenantId && rel.tenant_b_id !== approverTenantId) {
      throw new Error('Approver tenant is not part of this relationship');
    }
  }

  const result = await pool.query(
    `
      UPDATE tenant_relationships
      SET status = 'rejected', updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `,
    [relationshipId]
  );
  return result.rows[0] || null;
}

module.exports = {
  normalizeTenantPair,
  createTenant,
  updateTenant,
  setTenantActive,
  getTenantSettings,
  updateTenantSettings,
  createSite,
  getDefaultSubTenantForTenant,
  getDefaultSiteForTenant,
  ensureTenantScaffold,
  listTenants,
  getTenantByIdOrSlug,
  createSubTenant,
  listSubTenants,
  setUserPublicFlag,
  requestTenantRelationship,
  getTenantRelationshipById,
  listTenantRelationships,
  approveTenantRelationship,
  rejectTenantRelationship,
};
