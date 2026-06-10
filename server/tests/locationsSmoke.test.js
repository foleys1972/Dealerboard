/**
 * Locations module load smoke test.
 * Run: node server/tests/locationsSmoke.test.js
 */

const assert = require('assert');

const MODULES = [
  '../routes/locations/routeHelpers',
  '../routes/locations/index',
  '../routes/locationRoutes',
  '../services/locations/errors',
  '../services/locations/locationService',
  '../db/locations/locations',
  '../db/locations/subscriberAssignments',
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
