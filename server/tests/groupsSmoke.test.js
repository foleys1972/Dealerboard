/**
 * Groups module load smoke test.
 * Run: node server/tests/groupsSmoke.test.js
 */

const assert = require('assert');

const MODULES = [
  '../routes/groups/index',
  '../routes/groupRoutes',
  '../routes/groups/shared',
  '../routes/groups/stats.routes',
  '../routes/groups/core.routes',
  '../routes/groups/audio.routes',
  '../routes/groups/broadcast.routes',
  '../routes/groups/participants.routes',
  '../routes/groups/hoot.routes',
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
