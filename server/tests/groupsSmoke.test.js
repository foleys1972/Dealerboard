/**
 * Groups module behavioral tests (no running server or database required).
 * Run: node server/tests/groupsSmoke.test.js
 */

const assert = require('assert');
const { createTestApp } = require('./helpers/createTestApp');
const { request } = require('./helpers/httpRequest');
const {
  normalizeCallModeForDb,
  isGroupCallMode,
  isBroadcastCallMode,
} = require('../utils/groupCallMode');

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
  await test('normalizeCallModeForDb passes through valid DB values', () => {
    assert.strictEqual(normalizeCallModeForDb('FIRST_ANSWER'), 'FIRST_ANSWER');
    assert.strictEqual(normalizeCallModeForDb('conference'), 'conference');
  });

  await test('normalizeCallModeForDb maps legacy/UI aliases', () => {
    assert.strictEqual(normalizeCallModeForDb('hunt'), 'FIRST_ANSWER');
    assert.strictEqual(normalizeCallModeForDb('first-responder-1to1'), 'FIRST_ANSWER');
    assert.strictEqual(normalizeCallModeForDb('group-call'), 'REMAIN_GROUP');
    assert.strictEqual(normalizeCallModeForDb('Broadcast'), 'broadcast');
  });

  await test('normalizeCallModeForDb defaults unknown/empty values to REMAIN_GROUP', () => {
    assert.strictEqual(normalizeCallModeForDb('nonsense'), 'REMAIN_GROUP');
    assert.strictEqual(normalizeCallModeForDb(undefined), 'REMAIN_GROUP');
    assert.strictEqual(normalizeCallModeForDb(''), 'REMAIN_GROUP');
  });

  await test('isGroupCallMode / isBroadcastCallMode classify correctly', () => {
    assert.strictEqual(isGroupCallMode('hunt'), true);
    assert.strictEqual(isGroupCallMode('broadcast'), false);
    assert.strictEqual(isBroadcastCallMode('broadcast'), true);
    assert.strictEqual(isBroadcastCallMode('conference'), false);
  });

  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'groups-smoke-test-secret-at-least-32-chars!!';
  delete require.cache[require.resolve('../middleware/auth')];
  delete require.cache[require.resolve('../routes/index')];
  const app = createTestApp();

  await test('POST /api/groups without a name is rejected (400) or fails cleanly (500 without DB)', async () => {
    const res = await request(app, 'POST', '/api/groups', { body: {} });
    assert.ok(
      [400, 500].includes(res.status),
      `expected 400 or 500, got ${res.status}`
    );
  });

  await test('GET /api/groups/:groupId/hoot/status responds with JSON, not a crash', async () => {
    const res = await request(app, 'GET', '/api/groups/nonexistent-group/hoot/status');
    assert.ok(res.status < 600);
    assert.ok(res.data && typeof res.data === 'object');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
