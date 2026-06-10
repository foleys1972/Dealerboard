const bcrypt = require('bcrypt');
const { allowBootstrapUsers } = require('../../utils/configValidation');
const { createUser, findUsers, updateUser } = require('../databaseService');
const logger = require('../../utils/logger');

const localUsers = new Map();
const userSessions = new Map();
let ioInstance = null;

function setSocketIO(io) {
  ioInstance = io;
  logger.info('Socket.IO instance set for auth routes');
}

function getIo() {
  return ioInstance;
}

function cacheLocalUser(user) {
  if (!user || !user.username) return;

  localUsers.set(user.username, {
    ...user,
    createdAt: user.createdAt || new Date(),
    updatedAt: user.updatedAt || new Date(),
  });
}

function findLocalUserById(userId) {
  for (const user of localUsers.values()) {
    if (user.id === userId) {
      return user;
    }
  }
  return null;
}

async function getUserByUsername(username) {
  if (!username) return null;

  let user = localUsers.get(username);
  if (user) return user;

  const users = await findUsers({ username });
  if (users && users.length > 0) {
    cacheLocalUser(users[0]);
    return users[0];
  }

  return null;
}

async function syncUsersToLocalStorage() {
  try {
    const users = await findUsers({});
    users.forEach((user) => {
      if (user.source === 'local') {
        cacheLocalUser(user);
      }
    });
    logger.info(`Synced ${users.length} users to local storage`);
  } catch (error) {
    logger.warn('Failed to sync users to local storage (this is normal if database is not ready):', error.message);
  }
}

const adminPasswordHash = bcrypt.hashSync('admin', 10);
const traderPasswordHash = bcrypt.hashSync('trader123', 10);

const defaultUsers = [
  {
    id: 'admin-001',
    username: 'admin',
    email: 'admin@trading-intercom.com',
    firstName: 'Admin',
    lastName: 'User',
    displayName: 'Administrator',
    password: adminPasswordHash,
    role: 'platform_admin',
    isActive: true,
    source: 'local',
    createdAt: new Date(),
    lastLogin: null,
  },
  {
    id: 'trader-001',
    username: 'trader1',
    email: 'trader1@trading-intercom.com',
    firstName: 'Test',
    lastName: 'Trader',
    displayName: 'Test Trader',
    password: traderPasswordHash,
    role: 'user',
    isActive: true,
    source: 'local',
    createdAt: new Date(),
    lastLogin: null,
  },
];

async function ensureDefaultUsers() {
  try {
    for (const user of defaultUsers) {
      const existing = await findUsers({ username: user.username });
      if (!existing || existing.length === 0) {
        logger.info(`Creating default user ${user.username} in Postgres`);
        await createUser(user);
        cacheLocalUser(user);
      } else {
        if (!existing[0]?.password && user?.password) {
          try {
            logger.warn(`Default user ${user.username} exists in Postgres without a password hash; repairing`);
            const repaired = await updateUser(user.username, { password: user.password });
            cacheLocalUser(repaired || { ...existing[0], password: user.password });
            continue;
          } catch (e) {
            logger.warn(`Failed to repair password hash for default user ${user.username}:`, e.message);
          }
        }

        if (user.username === 'admin' && existing[0]?.role === 'admin') {
          try {
            logger.info('Migrating legacy admin role to platform_admin for bootstrap admin user');
            const migrated = await updateUser('admin', { role: 'platform_admin' });
            cacheLocalUser(migrated || { ...existing[0], role: 'platform_admin' });
          } catch (e) {
            logger.warn('Failed to migrate legacy admin role:', e.message);
            cacheLocalUser(existing[0]);
          }
        } else {
          cacheLocalUser(existing[0]);
        }
      }
    }
  } catch (error) {
    logger.error('Failed to ensure default users exist in Postgres:', error);
  }
}

setTimeout(() => {
  syncUsersToLocalStorage().catch(() => {});
}, 2000);

if (allowBootstrapUsers()) {
  defaultUsers.forEach(cacheLocalUser);
  ensureDefaultUsers().catch(() => {});
} else {
  logger.info('Bootstrap default users disabled (production or ALLOW_BOOTSTRAP_USERS=false)');
}

module.exports = {
  localUsers,
  userSessions,
  setSocketIO,
  getIo,
  cacheLocalUser,
  findLocalUserById,
  getUserByUsername,
  syncUsersToLocalStorage,
  ensureDefaultUsers,
};
