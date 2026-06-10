/**
 * Subscriber API module load smoke test.
 * Run: node server/tests/subscriberApiSmoke.test.js
 */

const assert = require('assert');

const MODULES = [
  '../routes/subscriberApi/routeHelpers',
  '../routes/subscriberApi/call.routes',
  '../routes/subscriberApi/group.routes',
  '../routes/subscriberApi/broadcast.routes',
  '../routes/subscriberApi/index',
  '../routes/subscriberApiRoutes',
  '../services/subscriberApi/errors',
  '../services/subscriberApi/helpers',
  '../services/subscriberApi/callService',
  '../services/subscriberApi/groupCallService',
  '../services/subscriberApi/broadcastService',
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
