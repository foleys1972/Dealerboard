/**
 * Auth module behavioral tests (no running server or database required).
 * Run: node server/tests/authSmoke.test.js
 */

const assert = require('assert');
const { createTestApp } = require('./helpers/createTestApp');
const { request } = require('./helpers/httpRequest');
const { buildSipUriForUser, getTenantRoom, collectOnlineKeys } = require('../services/auth/helpers');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok ${name}`);
    passed += 1;
  } catch (e) {
    console.error(`  FAIL ${name}:`, e.message);
    failed += 1;
  }
}

async function run() {
  const savedEnv = { ROOT_DOMAIN: process.env.ROOT_DOMAIN, DEFAULT_TENANT_SLUG: process.env.DEFAULT_TENANT_SLUG };

  await test('buildSipUriForUser uses given tenant slug', () => {
    process.env.ROOT_DOMAIN = 'example.com';
    const uri = buildSipUriForUser('user-1', 'acme');
    assert.strictEqual(uri, 'sip:user-1@acme.example.com');
  });

  await test('buildSipUriForUser falls back to default tenant slug', () => {
    process.env.ROOT_DOMAIN = 'example.com';
    process.env.DEFAULT_TENANT_SLUG = 'demo';
    const uri = buildSipUriForUser('user-2');
    assert.strictEqual(uri, 'sip:user-2@demo.example.com');
  });

  await test('getTenantRoom composes tenant and sub-tenant ids', () => {
    const room = getTenantRoom('tenant-a', 'sub-b');
    assert.strictEqual(room, 'tenant:tenant-a:sub:sub-b');
  });

  await test('getTenantRoom falls back to env defaults when ids omitted', () => {
    process.env.DEFAULT_TENANT_ID = 'tenant-default-test';
    process.env.DEFAULT_SUB_TENANT_ID = 'subtenant-default-test';
    const room = getTenantRoom();
    assert.strictEqual(room, 'tenant:tenant-default-test:sub:subtenant-default-test');
    delete process.env.DEFAULT_TENANT_ID;
    delete process.env.DEFAULT_SUB_TENANT_ID;
  });

  await test('collectOnlineKeys only includes authenticated sessions', () => {
    const sessions = new Map([
      ['sock-1', { isAuthenticated: true, userId: 'u1', username: 'alice' }],
      ['sock-2', { isAuthenticated: false, userId: 'u2', username: 'bob' }],
      ['sock-3', { isAuthenticated: true, userId: 'u3' }],
    ]);
    const keys = collectOnlineKeys({ userSessions: sessions });
    assert.ok(keys.has('u1'));
    assert.ok(keys.has('alice'));
    assert.ok(!keys.has('u2'));
    assert.ok(!keys.has('bob'));
    assert.ok(keys.has('u3'));
  });

  await test('collectOnlineKeys tolerates a missing/malformed socket handler', () => {
    const keys = collectOnlineKeys(undefined);
    assert.strictEqual(keys.size, 0);
  });

  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'auth-smoke-test-secret-at-least-32-chars!!';
  delete require.cache[require.resolve('../middleware/auth')];
  delete require.cache[require.resolve('../routes/index')];
  const app = createTestApp();

  await test('POST /api/auth/login with empty body returns 400', async () => {
    const res = await request(app, 'POST', '/api/auth/login', { body: {} });
    assert.strictEqual(res.status, 400);
  });

  await test('GET /api/auth/me without token returns 401', async () => {
    const res = await request(app, 'GET', '/api/auth/me');
    assert.strictEqual(res.status, 401);
  });

  if (savedEnv.ROOT_DOMAIN === undefined) delete process.env.ROOT_DOMAIN;
  else process.env.ROOT_DOMAIN = savedEnv.ROOT_DOMAIN;
  if (savedEnv.DEFAULT_TENANT_SLUG === undefined) delete process.env.DEFAULT_TENANT_SLUG;
  else process.env.DEFAULT_TENANT_SLUG = savedEnv.DEFAULT_TENANT_SLUG;

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
