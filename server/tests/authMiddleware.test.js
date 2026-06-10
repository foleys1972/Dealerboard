/**
 * Auth middleware unit tests (no database required).
 * Run: node server/tests/authMiddleware.test.js
 */

const assert = require('assert');
const jwt = require('jsonwebtoken');

const ENV_KEYS = ['NODE_ENV', 'JWT_SECRET', 'JWT_ACCESS_TOKEN_SECRET'];

function withAuth(env, fn) {
  const saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  delete require.cache[require.resolve('../middleware/auth')];
  delete require.cache[require.resolve('../utils/configValidation')];
  try {
    return fn(require('../middleware/auth'));
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    delete require.cache[require.resolve('../middleware/auth')];
    delete require.cache[require.resolve('../utils/configValidation')];
  }
}

const PRIMARY = 'test-primary-secret-at-least-32-chars!!';
const SECONDARY = 'test-secondary-secret-at-least-32-chars!';

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

test('verifyToken accepts token signed with JWT_SECRET', () => {
  withAuth({ NODE_ENV: 'development', JWT_SECRET: PRIMARY }, ({ verifyToken }) => {
    const token = jwt.sign({ id: 'u1', role: 'user' }, PRIMARY);
    assert.strictEqual(verifyToken(token).id, 'u1');
  });
});

test('verifyToken tries JWT_ACCESS_TOKEN_SECRET', () => {
  withAuth(
    {
      NODE_ENV: 'development',
      JWT_SECRET: PRIMARY,
      JWT_ACCESS_TOKEN_SECRET: SECONDARY,
    },
    ({ verifyToken }) => {
      const token = jwt.sign({ id: 'u2', role: 'user' }, SECONDARY);
      assert.strictEqual(verifyToken(token).id, 'u2');
    }
  );
});

test('verifyToken rejects unsigned garbage', () => {
  withAuth({ NODE_ENV: 'development', JWT_SECRET: PRIMARY }, ({ verifyToken }) => {
    assert.strictEqual(verifyToken('not.a.jwt'), null);
  });
});

test('verifyToken normalizes admin role to platform_admin', () => {
  withAuth({ NODE_ENV: 'development', JWT_SECRET: PRIMARY }, ({ verifyToken }) => {
    const token = jwt.sign({ id: 'admin', role: 'admin' }, PRIMARY);
    assert.strictEqual(verifyToken(token).role, 'platform_admin');
  });
});

test('verifyToken rejects wrong signature', () => {
  withAuth({ NODE_ENV: 'development', JWT_SECRET: PRIMARY }, ({ verifyToken }) => {
    const token = jwt.sign({ id: 'forged', role: 'platform_admin' }, 'wrong-secret-also-32-chars-long!!');
    assert.strictEqual(verifyToken(token), null);
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
