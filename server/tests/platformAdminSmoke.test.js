/**
 * Platform admin module load smoke test.
 * Run: node server/tests/platformAdminSmoke.test.js
 */

const assert = require('assert');

const MODULES = [
  '../routes/platformAdmin/routeHelpers',
  '../routes/platformAdmin/index',
  '../routes/platformAdminRoutes',
  '../services/platformAdmin/errors',
  '../services/platformAdmin/haSiteService',
  '../services/platformAdmin/travelOverrideService',
  '../services/platformAdmin/subscriberAgentService',
  '../services/platformAdmin/serverControlService',
  '../routes/platformAdmin/server.routes',
  '../services/platformAdmin/tenantService',
  '../db/platformAdmin/haSites',
  '../db/platformAdmin/travelOverrides',
  '../db/platformAdmin/subscribers',
];

let passed = 0;
let failed = 0;

for (const mod of MODULES) {
  try {
    const loaded = require(mod);
    assert.ok(loaded);
    console.log(`  ok ${mod}`);
    passed += 1;
  } catch (e) {
    console.error(`  FAIL ${mod}:`, e.message);
    failed += 1;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
