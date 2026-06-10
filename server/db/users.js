const { pool } = require('./pool');
const logger = require('../utils/logger');
const { parseJsonbField } = require('./helpers');

function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: row.display_name,
    password: row.password,
    role: row.role,
    isActive: row.is_active,
    source: row.source,
    // Handle JSONB fields - pg library should parse them, but ensure they're objects
    settings: parseJsonbField(row.settings, 'settings'),
    capabilities: parseJsonbField(row.capabilities, 'capabilities'),
    status: row.status,
    statusMessage: row.status_message,
    extension: row.extension,
    sipUri: row.sip_uri,
    companyName: row.company_name,
    country: row.country,
    tenantId: row.tenant_id,
    subTenantId: row.sub_tenant_id,
    siteId: row.site_id,
    isPublic: row.is_public === true,
    employeeId: row.employee_id,
    department: row.department,
    locationId: row.location_id,
    // Convert zoom_enabled to boolean, defaulting to false if null/undefined
    zoomEnabled: row.zoom_enabled != null ? (row.zoom_enabled === true || row.zoom_enabled === 1 || row.zoom_enabled === 'true' || row.zoom_enabled === '1') : false,
    // Convert teams_enabled to boolean, defaulting to false if null/undefined
    teamsEnabled: row.teams_enabled != null ? (row.teams_enabled === true || row.teams_enabled === 1 || row.teams_enabled === 'true' || row.teams_enabled === '1') : false,
    lastLogin: row.last_login,
    lastActive: row.last_active,
    matrixUserId: row.matrix_user_id,
    lastMatrixSync: row.last_matrix_sync,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createUser(user) {
  const now = new Date();
  const result = await pool.query(
    `
      INSERT INTO users (
        id, username, email, first_name, last_name, display_name, password,
        role, is_active, source, settings, capabilities, status, status_message,
        extension, sip_uri, employee_id, department, company_name, country, last_login, last_active,
        matrix_user_id, last_matrix_sync, tenant_id, sub_tenant_id, site_id, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, COALESCE($9, true), $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22,
        $23, $24, $25, $26, $27, COALESCE($28, NOW()), $29
      )
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        display_name = EXCLUDED.display_name,
        password = EXCLUDED.password,
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active,
        source = EXCLUDED.source,
        settings = EXCLUDED.settings,
        capabilities = EXCLUDED.capabilities,
        status = EXCLUDED.status,
        status_message = EXCLUDED.status_message,
        extension = EXCLUDED.extension,
        sip_uri = EXCLUDED.sip_uri,
        company_name = EXCLUDED.company_name,
        country = EXCLUDED.country,
        tenant_id = EXCLUDED.tenant_id,
        sub_tenant_id = EXCLUDED.sub_tenant_id,
        site_id = EXCLUDED.site_id,
        employee_id = EXCLUDED.employee_id,
        department = EXCLUDED.department,
        last_login = EXCLUDED.last_login,
        last_active = EXCLUDED.last_active,
        matrix_user_id = EXCLUDED.matrix_user_id,
        last_matrix_sync = EXCLUDED.last_matrix_sync,
        updated_at = NOW()
      RETURNING *;
    `,
    [
      user.id,
      user.username,
      user.email,
      user.firstName,
      user.lastName,
      user.displayName,
      user.password,
      user.role || 'user',
      user.isActive,
      user.source || 'local',
      user.settings || {},
      user.capabilities || {},
      user.status || 'offline',
      user.statusMessage || null,
      user.extension || null,
      user.sipUri || null,
      user.employeeId || null,
      user.department || null,
      user.companyName || null,
      user.country || null,
      user.lastLogin || null,
      user.lastActive || null,
      user.matrixUserId || null,
      user.lastMatrixSync || null,
      Object.prototype.hasOwnProperty.call(user, 'tenantId') ? user.tenantId : (process.env.DEFAULT_TENANT_ID || 'tenant-default'),
      Object.prototype.hasOwnProperty.call(user, 'subTenantId') ? user.subTenantId : (process.env.DEFAULT_SUB_TENANT_ID || 'subtenant-default'),
      Object.prototype.hasOwnProperty.call(user, 'siteId') ? user.siteId : (process.env.DEFAULT_SITE_ID || 'site-default'),
      user.createdAt || now,
      user.updatedAt || now,
    ]
  );

  return mapUserRow(result.rows[0]);
}

async function findUsers(filter = {}) {
  const conditions = [];
  const values = [];

  if (filter.id) {
    values.push(filter.id);
    conditions.push(`id = $${values.length}`);
  }
  if (filter.username) {
    values.push(filter.username);
    conditions.push(`username = $${values.length}`);
  }
  if (filter.role) {
    values.push(filter.role);
    conditions.push(`role = $${values.length}`);
  }
  if (filter.tenantId !== undefined) {
    if (filter.tenantId === null) {
      conditions.push(`tenant_id IS NULL`);
    } else {
      values.push(filter.tenantId);
      conditions.push(`tenant_id = $${values.length}`);
    }
  }
  if (filter.isPublic !== undefined) {
    values.push(filter.isPublic);
    conditions.push(`is_public = $${values.length}`);
  }
  if (typeof filter.isActive === 'boolean') {
    values.push(filter.isActive);
    conditions.push(`is_active = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `
      SELECT *
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
    `,
    values
  );

  return result.rows.map(mapUserRow);
}

async function getUserById(userId) {
  const result = await pool.query(
    `
      SELECT *
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  return mapUserRow(result.rows[0]);
}

async function getUserByUsername(username) {
  if (!username) return null;
  
  const result = await pool.query(
    `
      SELECT *
      FROM users
      WHERE username = $1
      LIMIT 1
    `,
    [username]
  );

  return mapUserRow(result.rows[0]);
}

// Get user by either ID or username
async function getUserByIdOrUsername(identifier) {
  if (!identifier) {
    logger.warn('getUserByIdOrUsername called with null/undefined identifier');
    return null;
  }
  
  try {
    logger.info(`getUserByIdOrUsername: Looking up user with identifier: ${identifier}`);
    // Try by username first (more common), then by ID
    const result = await pool.query(
      `
        SELECT *
        FROM users
        WHERE LOWER(username) = LOWER($1) OR id = $1
        LIMIT 1
      `,
      [identifier]
    );

    if (!result.rows || result.rows.length === 0) {
      logger.warn(`getUserByIdOrUsername: No user found with identifier: ${identifier}`);
      return null;
    }

    logger.info(`getUserByIdOrUsername: Found user: ${result.rows[0].username} (DB ID: ${result.rows[0].id})`);
    const user = mapUserRow(result.rows[0]);
    if (!user) {
      logger.error(`getUserByIdOrUsername: mapUserRow returned null for identifier: ${identifier}`);
      return null;
    }
    return user;
  } catch (error) {
    logger.error(`getUserByIdOrUsername error for identifier "${identifier}":`, error);
    logger.error('Error message:', error.message);
    logger.error('Error stack:', error.stack);
    throw error;
  }
}

// Update user status (online/offline)
async function updateUserStatus(userIdOrUsername, status) {
  const client = await pool.connect();
  try {
    // Find user by ID or username
    const user = await getUserByIdOrUsername(userIdOrUsername);
    if (!user) {
      throw new Error(`User not found: ${userIdOrUsername}`);
    }
    
    await client.query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, user.id]
    );
    
    logger.info(`Updated user ${userIdOrUsername} status to ${status}`);
    return true;
  } catch (error) {
    logger.error('Failed to update user status:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function updateUser(userIdOrUsername, updates = {}) {
  const allowedFields = {
    username: 'username',
    email: 'email',
    firstName: 'first_name',
    lastName: 'last_name',
    displayName: 'display_name',
    password: 'password',
    role: 'role',
    isActive: 'is_active',
    source: 'source',
    settings: 'settings',
    capabilities: 'capabilities',
    status: 'status',
    statusMessage: 'status_message',
    extension: 'extension',
    sipUri: 'sip_uri',
    employeeId: 'employee_id',
    department: 'department',
    locationId: 'location_id',
    companyName: 'company_name',
    country: 'country',
    lastLogin: 'last_login',
    lastActive: 'last_active',
    matrixUserId: 'matrix_user_id',
    lastMatrixSync: 'last_matrix_sync',
    zoomEnabled: 'zoom_enabled',
    teamsEnabled: 'teams_enabled',
    tenantId: 'tenant_id',
    subTenantId: 'sub_tenant_id',
    siteId: 'site_id',
    isPublic: 'is_public',
  };

  const setClauses = [];
  const values = [];

  Object.entries(allowedFields).forEach(([key, column]) => {
    if (updates[key] !== undefined) {
      let value = updates[key];
      // Handle JSONB fields (settings, capabilities)
      if (column === 'settings' || column === 'capabilities') {
        if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        }
        values.push(value);
        setClauses.push(`${column} = $${values.length}::jsonb`);
      } else {
        values.push(value);
        setClauses.push(`${column} = $${values.length}`);
      }
    }
  });

  if (setClauses.length === 0) {
    return getUserByIdOrUsername(userIdOrUsername);
  }

  // First, get the user to find their actual database ID
  const user = await getUserByIdOrUsername(userIdOrUsername);
  if (!user) {
    throw new Error(`User not found: ${userIdOrUsername}`);
  }

  // Log what we're about to update
  logger.info(`updateUser: Updating user ${userIdOrUsername} (DB ID: ${user.id})`, {
    updateFields: Object.keys(updates).filter(key => updates[key] !== undefined),
    setClausesCount: setClauses.length,
    valuesCount: values.length
  });

  // Use the actual database ID for the UPDATE query
  values.push(user.id);
  const whereParamIndex = values.length;
  
  const query = `
    UPDATE users
    SET ${setClauses.join(', ')},
        updated_at = NOW()
    WHERE id = $${whereParamIndex}
    RETURNING *;
  `;
  
  try {
    logger.info(`updateUser: Executing query with ${values.length} parameters`);
    const result = await pool.query(query, values);
    
    if (!result.rows || result.rows.length === 0) {
      throw new Error(`User update failed: no rows returned for user ${userIdOrUsername} (DB ID: ${user.id})`);
    }
    
    logger.info(`updateUser: Successfully updated user ${userIdOrUsername}`);
    return mapUserRow(result.rows[0]);
  } catch (error) {
    // Log the actual SQL query and values for debugging
    logger.error('updateUser SQL error:', {
      query,
      values: values.map((v, i) => ({ 
        param: i + 1, 
        value: typeof v === 'object' ? JSON.stringify(v).substring(0, 100) : v,
        type: typeof v
      })),
      error: error.message,
      stack: error.stack,
      userIdOrUsername,
      userDbId: user.id,
      setClauses: setClauses,
      whereParamIndex: whereParamIndex
    });
    throw error;
  }
}

async function deleteUser(userId) {
  await pool.query(
    `
      DELETE FROM users
      WHERE id = $1 OR username = $1
    `,
    [userId]
  );
}

module.exports = {
  mapUserRow,
  createUser,
  findUsers,
  getUserById,
  getUserByUsername,
  getUserByIdOrUsername,
  updateUserStatus,
  updateUser,
  deleteUser,
};
