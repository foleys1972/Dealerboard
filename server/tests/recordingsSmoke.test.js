/**
 * Recordings services/db module load smoke test.
 * Run: node server/tests/recordingsSmoke.test.js
 */

const assert = require('assert');

const MODULES = [
  '../routes/recordings/shared',
  '../routes/recordings/admin.routes',
  '../routes/recordings/chunks.routes',
  '../routes/recordings/recordings.routes',
  '../routes/recordings/index',
  '../routes/recordingRoutes',
  '../services/recordings/errors',
  '../services/recordings/participantReconcileService',
  '../services/recordings/clientConfigService',
  '../services/recordings/recordingEnrichmentService',
  '../db/recordings/participantReconcile',
  '../db/users/users',
  '../services/adminStats/healthService',
  '../services/userIntercom/gridConfigService',
  '../routes/subscriberApi/routeHelpers',
  '../db/integrations/teamsOAuth',
  '../db/integrations/zoomCredentials',
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
