/**
 * Ensures the database facade exports the full public API.
 * Run: node server/tests/dbExports.test.js
 */

const assert = require('assert');

const REQUIRED = [
  'pool',
  'parseBoolean',
  'initializeDatabase',
  'allocateSixDigitAor',
  'resolveLineAorByLineId',
  'resolveLineAorByAor',
  'createUser',
  'findUsers',
  'getUserById',
  'updateUser',
  'deleteUser',
  'getUserByUsername',
  'getUserByIdOrUsername',
  'updateUserStatus',
  'createTenant',
  'updateTenant',
  'setTenantActive',
  'getTenantSettings',
  'updateTenantSettings',
  'createSite',
  'listTenants',
  'getTenantByIdOrSlug',
  'createSubTenant',
  'listSubTenants',
  'ensureTenantScaffold',
  'setUserPublicFlag',
  'requestTenantRelationship',
  'getTenantRelationshipById',
  'listTenantRelationships',
  'approveTenantRelationship',
  'rejectTenantRelationship',
  'createGroup',
  'findGroups',
  'getGroupById',
  'updateGroup',
  'addUserToGroup',
  'removeUserFromGroup',
  'createDirectContact',
  'findDirectContacts',
  'getDirectContactById',
  'deleteDirectContact',
  'createCallSession',
  'getCallSession',
  'updateCallSession',
  'findCallSessions',
  'getLineConfiguration',
  'updateLineConfiguration',
  'findLineConfigurations',
  'createRecording',
  'getRecording',
  'updateRecording',
  'findRecordings',
  'createUserNotification',
  'getUserNotifications',
  'deleteUserNotification',
];

const db = require('../services/databaseService');

let failed = 0;
for (const name of REQUIRED) {
  try {
    assert.ok(name in db, `missing export: ${name}`);
    if (name === 'pool') {
      assert.ok(db.pool && typeof db.pool.query === 'function');
    } else {
      assert.strictEqual(typeof db[name], 'function', `${name} should be a function`);
    }
    console.log(`  ok ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}:`, e.message);
    failed += 1;
  }
}

console.log(`\n${REQUIRED.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
