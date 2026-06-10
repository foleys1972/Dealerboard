/**
 * WebRTC module load smoke test.
 * Run: node server/tests/webrtcSmoke.test.js
 */

const assert = require('assert');

const MODULES = [
  '../routes/webrtc/index',
  '../routes/webrtcRoutes',
  '../routes/webrtc/routeHelpers',
  '../routes/webrtc/debug.routes',
  '../routes/webrtc/rtp.routes',
  '../routes/webrtc/plain.routes',
  '../routes/webrtc/transport.routes',
  '../routes/webrtc/media.routes',
  '../routes/webrtc/legacy.routes',
  '../routes/webrtc/lifecycle.routes',
  '../routes/webrtc/inventory.routes',
  '../routes/webrtc/control.routes',
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
