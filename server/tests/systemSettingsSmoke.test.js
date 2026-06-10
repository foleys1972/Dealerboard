/**
 * System settings module load smoke test.
 * Run: node server/tests/systemSettingsSmoke.test.js
 */

const assert = require('assert');

const MODULES = [
  '../routes/systemSettings/routeHelpers',
  '../routes/systemSettings/index',
  '../routes/systemSettingsRoutes',
  '../services/systemSettings/errors',
  '../services/systemSettings/helpers',
  '../services/systemSettings/settingsService',
  '../services/systemSettings/countryService',
  '../services/systemSettings/dialPlanService',
  '../db/systemSettings/settings',
  '../db/systemSettings/countries',
  '../db/systemSettings/dialPlans',
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
