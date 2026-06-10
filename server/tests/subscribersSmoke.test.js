/**
 * Subscribers module load smoke test.
 * Run: node server/tests/subscribersSmoke.test.js
 */

const assert = require('assert');

const MODULES = [
  '../routes/subscribers/routeHelpers',
  '../routes/subscribers/index',
  '../routes/subscriberRoutes',
  '../services/subscribers/errors',
  '../services/subscribers/subscriberService',
  '../services/subscribers/portAllocationService',
  '../db/subscribers/subscribers',
  '../db/subscribers/portAllocations',
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
