/**
 * Dealerboard route helper unit tests (no database required).
 * Run: node server/tests/dealerboardRouteHelpers.test.js
 */

const assert = require('assert');
const { handleServiceError, requireAdmin } = require('../routes/dealerboard/routeHelpers');
const { LineOperationError } = require('../services/dealerboard/errors');

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

test('handleServiceError maps LineOperationError with extra fields', () => {
  const err = new LineOperationError(404, 'Not found', undefined, { missing: ['a'] });
  const res = mockRes();
  handleServiceError(res, err, 'fallback');
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(res.body.error, 'Not found');
  assert.deepStrictEqual(res.body.missing, ['a']);
});

test('handleServiceError uses fallback for generic errors', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const res = mockRes();
  handleServiceError(res, new Error('boom'), 'Something failed');
  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body.error, 'Something failed');
  assert.strictEqual(res.body.details, 'boom');
  process.env.NODE_ENV = prev;
});

test('requireAdmin rejects non-admin users', () => {
  const res = mockRes();
  const ok = requireAdmin({ user: { role: 'user' } }, res);
  assert.strictEqual(ok, false);
  assert.strictEqual(res.statusCode, 403);
});

test('requireAdmin allows platform_admin', () => {
  const res = mockRes();
  const ok = requireAdmin({ user: { role: 'platform_admin' } }, res);
  assert.strictEqual(ok, true);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
