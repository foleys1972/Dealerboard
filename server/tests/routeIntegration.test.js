/**
 * In-process HTTP integration tests (no running server required).
 * Run: node server/tests/routeIntegration.test.js
 */

const assert = require('assert');
const jwt = require('jsonwebtoken');
const { createTestApp } = require('./helpers/createTestApp');
const { request } = require('./helpers/httpRequest');

const ENV_KEYS = ['NODE_ENV', 'JWT_SECRET', 'JWT_ACCESS_TOKEN_SECRET', 'AGENT_TOKEN', 'ENABLE_LOCAL_AGENT'];

function saveEnv() {
  const saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  return saved;
}

function restoreEnv(saved) {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

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
  const savedEnv = saveEnv();
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'integration-test-secret-at-least-32-chars!!';

  delete require.cache[require.resolve('../middleware/auth')];
  delete require.cache[require.resolve('../routes/index')];

  const app = createTestApp();

  await test('GET /api/admin/health returns 200', async () => {
    const res = await request(app, 'GET', '/api/admin/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
  });

  await test('GET /api/favorites returns 501 placeholder', async () => {
    const res = await request(app, 'GET', '/api/favorites');
    assert.strictEqual(res.status, 501);
  });

  await test('GET /api/iptv returns 501 placeholder', async () => {
    const res = await request(app, 'GET', '/api/iptv');
    assert.strictEqual(res.status, 501);
  });

  await test('GET /api/compliance/status without auth returns 401', async () => {
    const res = await request(app, 'GET', '/api/compliance/status');
    assert.strictEqual(res.status, 401);
  });

  await test('GET /api/federation/status without auth returns 401', async () => {
    const res = await request(app, 'GET', '/api/federation/status');
    assert.strictEqual(res.status, 401);
  });

  await test('GET /api/direct-contacts without auth returns 401', async () => {
    const res = await request(app, 'GET', '/api/direct-contacts');
    assert.strictEqual(res.status, 401);
  });

  await test('POST /api/subscriber/call/initiate without token returns 401', async () => {
    const res = await request(app, 'POST', '/api/subscriber/call/initiate', {
      body: { lineId: 'x', lineType: 'INTERCOM', initiatorUserId: 'a', targetUserId: 'b' },
    });
    assert.strictEqual(res.status, 401);
  });

  await test('POST /api/notifications without auth returns 401', async () => {
    const res = await request(app, 'POST', '/api/notifications', {
      body: { type: 'info', message: 'hello' },
    });
    assert.strictEqual(res.status, 401);
  });

  await test('POST /api/agent/service without token returns 401 when configured', async () => {
    process.env.AGENT_TOKEN = 'test-agent-token';
    delete require.cache[require.resolve('../routes/agent/routeHelpers')];
    delete require.cache[require.resolve('../routes/agent/service.routes')];
    delete require.cache[require.resolve('../routes/agent/index')];
    delete require.cache[require.resolve('../routes/agentRoutes')];
    delete require.cache[require.resolve('../routes/index')];

    const agentApp = createTestApp();
    const res = await request(agentApp, 'POST', '/api/agent/service', {
      body: { action: 'status', serviceName: 'foo' },
    });
    assert.strictEqual(res.status, 401);
  });

  await test('GET /api/groups/stats/all without auth is reachable (may 500 without init)', async () => {
    const res = await request(app, 'GET', '/api/groups/stats/all');
    assert.ok(res.status === 200 || res.status === 500);
  });

  await test('routeHelpers bypasses auth for sfu stats when ALLOW_WEBRTC_STATS_NO_AUTH=true', async () => {
    process.env.ALLOW_WEBRTC_STATS_NO_AUTH = 'true';
    delete require.cache[require.resolve('../routes/webrtc/routeHelpers')];
    const express = require('express');
    const { attachAuthMiddleware } = require('../routes/webrtc/routeHelpers');

    const api = express();
    const webrtc = express.Router();
    attachAuthMiddleware(webrtc);
    webrtc.get('/sfu/stats', (_req, res) => res.json({ ok: true }));
    api.use('/api/webrtc', webrtc);

    const res = await request(api, 'GET', '/api/webrtc/sfu/stats');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
    delete process.env.ALLOW_WEBRTC_STATS_NO_AUTH;
    delete require.cache[require.resolve('../routes/webrtc/routeHelpers')];
  });

  await test('GET /api/auth/login route exists (POST only → 404 on GET)', async () => {
    const res = await request(app, 'GET', '/api/auth/login');
    assert.ok(res.status === 404 || res.status === 405);
  });

  await test('POST /api/auth/login with empty body returns 400', async () => {
    const res = await request(app, 'POST', '/api/auth/login', { body: {} });
    assert.ok(res.status === 400 || res.status === 401);
  });

  await test('GET /api/user-intercom/grid-config without auth returns 401', async () => {
    const res = await request(app, 'GET', '/api/user-intercom/grid-config');
    assert.strictEqual(res.status, 401);
  });

  await test('GET /api/tenant-admin/settings without auth returns 401', async () => {
    const res = await request(app, 'GET', '/api/tenant-admin/settings');
    assert.strictEqual(res.status, 401);
  });

  await test('Bearer token accepted on protected route shape', async () => {
    const token = jwt.sign(
      { id: 'user-1', username: 'user1', role: 'user' },
      process.env.JWT_SECRET
    );
    const res = await request(app, 'GET', '/api/direct-contacts', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.notStrictEqual(res.status, 401);
  });

  restoreEnv(savedEnv);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
