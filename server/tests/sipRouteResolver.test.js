/**
 * Unit tests for SIP route resolver helpers.
 * Run: node server/tests/sipRouteResolver.test.js
 */

const assert = require('assert');
const { trunkRowToEndpoint, resolveDdiLineReferUri } = require('../services/dealerboard/sipRouteResolver');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`  FAIL ${name}:`, error.message);
    failed += 1;
  }
}

async function run() {
  await test('trunkRowToEndpoint maps trunk row to SBC endpoint', () => {
    const endpoint = trunkRowToEndpoint({
      host: 'sbc1.example.com',
      port: 5061,
      username: 'user1',
      password: 'secret',
      domain: 'example.com',
      name: 'Primary',
      label: 'UK Primary',
    }, 'primary');

    assert.strictEqual(endpoint.role, 'primary');
    assert.strictEqual(endpoint.host, 'sbc1.example.com');
    assert.strictEqual(endpoint.port, 5061);
    assert.strictEqual(endpoint.username, 'user1');
    assert.strictEqual(endpoint.password, 'secret');
    assert.strictEqual(endpoint.domain, 'example.com');
    assert.strictEqual(endpoint.label, 'UK Primary');
  });

  await test('trunkRowToEndpoint defaults port and label', () => {
    const endpoint = trunkRowToEndpoint({ host: 'sbc2.example.com', name: 'Backup' }, 'secondary');
    assert.strictEqual(endpoint.port, 5060);
    assert.strictEqual(endpoint.label, 'Backup');
    assert.strictEqual(endpoint.role, 'secondary');
  });

  await test('resolveDdiLineReferUri prefers connection uri', async () => {
    const uri = await resolveDdiLineReferUri({
      line_number: '441234567890',
      connection_details: { uri: 'sip:target@corp.example.com' },
    });
    assert.strictEqual(uri, 'sip:target@corp.example.com');
  });

  await test('resolveDdiLineReferUri falls back to line number domain', async () => {
    const prev = process.env.SIP_DOMAIN;
    process.env.SIP_DOMAIN = 'test.local';
    try {
      const uri = await resolveDdiLineReferUri({
        line_number: '441234567890',
        connection_details: {},
        sbc_details: {},
      });
      assert.strictEqual(uri, 'sip:441234567890@test.local');
    } finally {
      if (prev === undefined) delete process.env.SIP_DOMAIN;
      else process.env.SIP_DOMAIN = prev;
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
