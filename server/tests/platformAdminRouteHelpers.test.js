/**
 * Platform admin route helper unit tests.
 * Run: node server/tests/platformAdminRouteHelpers.test.js
 */

const assert = require('assert');
const { requirePlatformAdmin, handleServiceError } = require('../routes/platformAdmin/routeHelpers');
const { PlatformAdminError } = require('../services/platformAdmin/errors');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ok ${name}`);
    passed += 1;
  } catch (e) {
    console.error(`  FAIL ${name}:`, e.message);
    failed += 1;
  }
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('requirePlatformAdmin rejects non-platform admins', () => {
  const res = mockRes();
  let nextCalled = false;
  requirePlatformAdmin({ user: { role: 'tenant_admin' } }, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
});

test('handleServiceError maps PlatformAdminError extra fields', () => {
  const err = new PlatformAdminError(409, 'Conflict', undefined, { mappings: [] });
  const res = mockRes();
  handleServiceError(res, err, 'fallback');
  assert.strictEqual(res.statusCode, 409);
  assert.deepStrictEqual(res.body.mappings, []);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
