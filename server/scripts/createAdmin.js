/**
 * Create an admin account in PostgreSQL.
 *
 * Intended for production bootstrap where default users are disabled
 * (NODE_ENV=production or ALLOW_BOOTSTRAP_USERS=false).
 *
 * Usage:
 *   node server/scripts/createAdmin.js --username admin --password "Str0ngPass!" [--role platform_admin] [--email admin@example.com]
 *
 * Or via environment variables:
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD="Str0ngPass!" node server/scripts/createAdmin.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'server.env') });

const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');

const VALID_ROLES = ['platform_admin', 'tenant_admin', 'user'];
const MIN_PASSWORD_LENGTH = 8;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const username = args.username || process.env.ADMIN_USERNAME;
  const password = args.password || process.env.ADMIN_PASSWORD;
  const role = args.role || process.env.ADMIN_ROLE || 'platform_admin';
  const email = args.email || process.env.ADMIN_EMAIL || null;

  if (!username || !password) {
    console.error('Usage: node server/scripts/createAdmin.js --username <name> --password <password> [--role platform_admin] [--email <email>]');
    process.exit(1);
  }

  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role "${role}". Valid roles: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  if (String(password).length < MIN_PASSWORD_LENGTH) {
    console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  const { pool } = require('../db/pool');
  const { createUser, findUsers } = require('../db/users');

  try {
    const existing = await findUsers({ username });
    if (existing && existing.length > 0) {
      console.error(`User "${username}" already exists (id: ${existing[0].id}). Use the admin UI or password reset to change it.`);
      process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await createUser({
      id: `admin-${randomUUID().slice(0, 8)}`,
      username,
      email,
      firstName: args.firstName || 'System',
      lastName: args.lastName || 'Administrator',
      displayName: args.displayName || username,
      password: hashedPassword,
      role,
      isActive: true,
      source: 'local',
    });

    console.log(`Created ${role} user "${user.username}" (id: ${user.id}).`);
    process.exit(0);
  } catch (error) {
    console.error('Failed to create admin user:', error.message);
    process.exit(1);
  } finally {
    try { await pool.end(); } catch { /* pool may already be closed */ }
  }
}

main();
