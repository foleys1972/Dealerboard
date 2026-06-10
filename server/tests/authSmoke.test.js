/**
 * Auth module load smoke test.
 * Run: node server/tests/authSmoke.test.js
 */

const assert = require('assert');

const MODULES = [
  '../routes/auth/index',
  '../routes/authRoutes',
  '../routes/auth/login.routes',
  '../routes/auth/session.routes',
  '../routes/auth/directory.routes',
  '../routes/auth/users.routes',
  '../routes/auth/ad.routes',
  '../routes/auth/sessions.routes',
  '../services/auth/sessionStore',
  '../services/auth/helpers',
  '../services/auth/routingService',
  '../services/auth/userPresenceService',
  '../db/auth/travelOverrides',
  '../db/auth/callSessions',
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
