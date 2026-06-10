/**
 * Dealerboard validator unit tests (no database required).
 * Run: node server/tests/dealerboardValidators.test.js
 */

const assert = require('assert');
const {
  normalizeSbcDetails,
  validateSbcDetails,
  validatePrivateWirePayload,
  modeToSignallingType,
  isAdminRole,
} = require('../services/dealerboard/validators');

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

test('isAdminRole accepts admin roles', () => {
  assert.strictEqual(isAdminRole('platform_admin'), true);
  assert.strictEqual(isAdminRole('tenant_admin'), true);
  assert.strictEqual(isAdminRole('admin'), true);
  assert.strictEqual(isAdminRole('user'), false);
});

test('modeToSignallingType maps ARD/MRD/HOOT', () => {
  assert.strictEqual(modeToSignallingType('ARD'), 'AUTO_RINGDOWN');
  assert.strictEqual(modeToSignallingType('mrd'), 'MANUAL_RINGDOWN');
  assert.strictEqual(modeToSignallingType('HOOT'), 'NONE');
  assert.strictEqual(modeToSignallingType('unknown'), 'MANUAL_RINGDOWN');
});

test('normalizeSbcDetails accepts object payload', () => {
  const out = normalizeSbcDetails({ sbcDetails: { primary: { host: 'sbc.example.com', port: 5060 } } });
  assert.strictEqual(out.primary.host, 'sbc.example.com');
  assert.strictEqual(out.primary.port, 5060);
});

test('normalizeSbcDetails maps flat fields', () => {
  const out = normalizeSbcDetails({
    sbcHost: 'sip.example.com',
    sbcPort: '5061',
    sbcUsername: 'user',
  });
  assert.strictEqual(out.primary.host, 'sip.example.com');
  assert.strictEqual(out.primary.port, 5061);
  assert.strictEqual(out.primary.username, 'user');
});

test('normalizeSbcDetails rejects invalid port', () => {
  assert.throws(
    () => normalizeSbcDetails({ sbcHost: 'sbc.example.com', sbcPort: 'abc' }),
    /Invalid SBC port/
  );
});

test('validateSbcDetails rejects invalid primary host', () => {
  const result = validateSbcDetails({ primary: { host: '   ' } });
  assert.strictEqual(result.ok, false);
});

test('validatePrivateWirePayload requires sip: for external wires', () => {
  const result = validatePrivateWirePayload({
    uriAddress: 'not-a-sip-uri',
    mode: 'ARD',
    isInternalWire: false,
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /sip:/);
});

test('validatePrivateWirePayload allows internal INTERCOM mode without URI', () => {
  const result = validatePrivateWirePayload({
    uriAddress: '',
    mode: 'INTERCOM',
    isInternalWire: true,
  });
  assert.strictEqual(result.ok, true);
});

test('validatePrivateWirePayload requires external community fields for HOOT', () => {
  const result = validatePrivateWirePayload({
    mode: 'HOOT',
    isExternalCommunity: true,
  });
  assert.strictEqual(result.ok, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
