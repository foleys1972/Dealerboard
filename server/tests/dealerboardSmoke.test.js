/**
 * Dealerboard module load smoke test (no HTTP server start).
 * Run: node server/tests/dealerboardSmoke.test.js
 */

const assert = require('assert');

const MODULES = [
  '../routes/dealerboard/routeHelpers',
  '../routes/dealerboard/shared',
  '../routes/dealerboard/index',
  '../routes/dealerboard/privateWires.routes',
  '../routes/dealerboard/lineOperations.routes',
  '../routes/dealerboard/assignments.routes',
  '../routes/dealerboard/lines.routes',
  '../routes/dealerboard/ddiLines.routes',
  '../routes/dealerboard/speedDials.routes',
  '../routes/dealerboard/groups.routes',
  '../routes/dealerboard/preferences.routes',
  '../routes/dealerboard/copyUser.routes',
  '../services/dealerboard/validators',
  '../services/dealerboard/errors',
  '../services/dealerboard/privateWireService',
  '../services/dealerboard/assignmentService',
  '../services/dealerboard/linesService',
  '../services/dealerboard/ddiLineService',
  '../services/dealerboard/speedDialService',
  '../services/dealerboard/dealerboardGroupService',
  '../services/dealerboard/preferencesService',
  '../services/dealerboard/copyUserService',
  '../services/dealerboard/lineCallService',
  '../services/dealerboard/lineCallAggregation',
  '../services/dealerboard/lineMediaConferenceService',
  '../services/dealerboard/lineTransferConferenceService',
  '../services/dealerboard/sbcProfile',
  '../services/dealerboard/sipRouteResolver',
  '../services/dealerboard/sipLineReloadService',
  '../services/systemSettings/sipTrunkService',
  '../services/systemSettings/sipRouteService',
  '../routes/systemSettings/sipTrunks.routes',
  '../services/sipSbcFailover',
  '../db/dealerboard',
];

let passed = 0;
let failed = 0;

for (const mod of MODULES) {
  try {
    const loaded = require(mod);
    assert.ok(loaded, `${mod} should export something`);
    console.log(`  ok ${mod}`);
    passed += 1;
  } catch (e) {
    console.error(`  FAIL ${mod}:`, e.message);
    failed += 1;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
