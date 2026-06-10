/**
 * Config validation unit tests (no database required).
 * Run: node server/tests/configValidation.test.js
 */

const assert = require('assert');

const ENV_KEYS = [
  'NODE_ENV',
  'JWT_SECRET',
  'ALLOW_BOOTSTRAP_USERS',
  'FEDERATION_ENABLED',
  'FEDERATION_SECRET',
  'ENABLE_LOCAL_AGENT',
  'AGENT_TOKEN',
];

function withEnv(env, fn) {
  const saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  delete require.cache[require.resolve('../utils/configValidation')];
  try {
    return fn(require('../utils/configValidation'));
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    delete require.cache[require.resolve('../utils/configValidation')];
  }
}

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

test('production rejects missing JWT_SECRET', () => {
  withEnv({ NODE_ENV: 'production' }, ({ validateServerConfig }) => {
    assert.throws(() => validateServerConfig(), /JWT_SECRET/);
  });
});

test('production rejects weak JWT_SECRET', () => {
  withEnv(
    { NODE_ENV: 'production', JWT_SECRET: 'your-secret-key' },
    ({ validateServerConfig }) => {
      assert.throws(() => validateServerConfig(), /JWT_SECRET/);
    }
  );
});

test('production accepts strong JWT_SECRET', () => {
  withEnv(
    { NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(32) },
    ({ validateServerConfig }) => {
      validateServerConfig();
    }
  );
});

test('development allows missing JWT', () => {
  withEnv({ NODE_ENV: 'development' }, ({ validateServerConfig }) => {
    validateServerConfig();
  });
});

test('allowBootstrapUsers false in production', () => {
  withEnv({ NODE_ENV: 'production' }, ({ allowBootstrapUsers }) => {
    assert.strictEqual(allowBootstrapUsers(), false);
  });
});

test('allowBootstrapUsers true in development by default', () => {
  withEnv({ NODE_ENV: 'development' }, ({ allowBootstrapUsers }) => {
    assert.strictEqual(allowBootstrapUsers(), true);
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
