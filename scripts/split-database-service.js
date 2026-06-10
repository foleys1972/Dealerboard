const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'server', 'services', 'databaseService.js');
const lines = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/);
const slice = (a, b) => lines.slice(a - 1, b).join('\n');

const dbDir = path.join(__dirname, '..', 'server', 'db');
fs.mkdirSync(dbDir, { recursive: true });

const poolHeader = [
  "const { Pool } = require('pg');",
  "const logger = require('../utils/logger');",
  '',
].join('\n');

const poolBody = slice(4, 24);
fs.writeFileSync(
  path.join(dbDir, 'pool.js'),
  poolHeader + poolBody + '\n\nmodule.exports = { pool, parseBoolean };\n'
);

const helpers = slice(1812, 1824);
fs.writeFileSync(
  path.join(dbDir, 'helpers.js'),
  "const logger = require('../utils/logger');\n\n" +
    helpers +
    '\n\nmodule.exports = { parseJsonbField };\n'
);

const schemaFn = slice(240, 1810);
fs.writeFileSync(
  path.join(dbDir, 'schema.js'),
  "const { pool } = require('./pool');\nconst logger = require('../utils/logger');\n\n" +
    schemaFn +
    '\n\nmodule.exports = { initializeDatabase };\n'
);

const aor = slice(26, 164);
fs.writeFileSync(
  path.join(dbDir, 'aor.js'),
  "const { pool } = require('./pool');\n\n" +
    aor +
    '\n\nmodule.exports = {\n  allocateSixDigitAor,\n  resolveLineAorByLineId,\n  resolveLineAorByAor,\n};\n'
);

const notifications = slice(170, 238);
fs.writeFileSync(
  path.join(dbDir, 'notifications.js'),
  "const { pool } = require('./pool');\n\n" +
    notifications +
    '\n\nmodule.exports = {\n  createUserNotification,\n  getUserNotifications,\n  deleteUserNotification,\n};\n'
);

const users =
  slice(1826, 1866) + '\n\n' + slice(2343, 2688);
fs.writeFileSync(
  path.join(dbDir, 'users.js'),
  "const { pool } = require('./pool');\nconst logger = require('../utils/logger');\nconst { parseJsonbField } = require('./helpers');\n\n" +
    users +
    '\n\nmodule.exports = {\n  mapUserRow,\n  createUser,\n  findUsers,\n  getUserById,\n  getUserByUsername,\n  getUserByIdOrUsername,\n  updateUserStatus,\n  updateUser,\n  deleteUser,\n};\n'
);

const setUserPublicFlagFn = [
  'async function setUserPublicFlag(userIdOrUsername, isPublic) {',
  '  const { updateUser } = require(\'./users\');',
  '  return updateUser(userIdOrUsername, { isPublic: Boolean(isPublic) });',
  '}',
].join('\n');

const tenancy =
  slice(1868, 2114) + '\n\n' + setUserPublicFlagFn + '\n\n' + slice(2120, 2273);
fs.writeFileSync(
  path.join(dbDir, 'tenancy.js'),
  "const { pool } = require('./pool');\n\n" +
    tenancy +
    '\n\nmodule.exports = {\n  normalizeTenantPair,\n  createTenant,\n  updateTenant,\n  setTenantActive,\n  getTenantSettings,\n  updateTenantSettings,\n  createSite,\n  getDefaultSubTenantForTenant,\n  getDefaultSiteForTenant,\n  ensureTenantScaffold,\n  listTenants,\n  getTenantByIdOrSlug,\n  createSubTenant,\n  listSubTenants,\n  setUserPublicFlag,\n  requestTenantRelationship,\n  getTenantRelationshipById,\n  listTenantRelationships,\n  approveTenantRelationship,\n  rejectTenantRelationship,\n};\n'
);

const groups = slice(2275, 2982);
fs.writeFileSync(
  path.join(dbDir, 'groups.js'),
  "const { pool } = require('./pool');\nconst logger = require('../utils/logger');\nconst { allocateSixDigitAor } = require('./aor');\n\n" +
    groups +
    '\n\nmodule.exports = {\n  mapGroupRow,\n  mapDirectContactRow,\n  getParticipantsForGroups,\n  createGroup,\n  findGroups,\n  getGroupById,\n  updateGroup,\n  addUserToGroup,\n  removeUserFromGroup,\n  createDirectContact,\n  findDirectContacts,\n  getDirectContactById,\n  deleteDirectContact,\n};\n'
);

const calls = slice(2988, 3200);
fs.writeFileSync(
  path.join(dbDir, 'calls.js'),
  "const { pool } = require('./pool');\n\n" +
    calls +
    '\n\nmodule.exports = {\n  createCallSession,\n  getCallSession,\n  updateCallSession,\n  findCallSessions,\n  mapCallSessionRow,\n};\n'
);

const linesMod = slice(3206, 3364);
fs.writeFileSync(
  path.join(dbDir, 'lines.js'),
  "const { pool } = require('./pool');\n\n" +
    linesMod +
    '\n\nmodule.exports = {\n  getLineConfiguration,\n  updateLineConfiguration,\n  findLineConfigurations,\n  mapLineConfigurationRow,\n};\n'
);

const recordings = slice(3370, 3647);
fs.writeFileSync(
  path.join(dbDir, 'recordings.js'),
  "const { pool } = require('./pool');\n\n" +
    recordings +
    '\n\nmodule.exports = {\n  createRecording,\n  getRecording,\n  updateRecording,\n  findRecordings,\n  mapRecordingRow,\n};\n'
);

console.log('Wrote domain modules to', dbDir);
