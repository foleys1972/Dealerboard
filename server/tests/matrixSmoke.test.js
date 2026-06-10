/**
 * Matrix module load smoke test.
 * Run: node server/tests/matrixSmoke.test.js
 */

const assert = require('assert');

const MODULES = [
  '../routes/matrix/routeHelpers',
  '../routes/matrix/index',
  '../routes/matrixRoutes',
  '../services/matrix/errors',
  '../services/matrix/roomAssignmentService',
  '../services/matrix/chatRoomService',
  '../services/matrix/homeserverRegistryService',
  '../db/matrix/roomAssignments',
  '../db/matrix/chatRooms',
  '../db/matrix/homeservers',
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
