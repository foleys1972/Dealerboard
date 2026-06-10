const {
  normalizeSbcDetails,
  validateSbcDetails,
  validatePrivateWirePayload,
  generateSudoLineReference,
  modeToSignallingType,
  isAdminRole,
} = require('../services/dealerboard/validators');

const {
  buildSbcProfileFromPayload,
  serializeSbcProfile,
  parseSbcProfile,
  validateSbcProfile,
} = require('../services/dealerboard/sbcProfile');

const assert = require('assert');

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

test('parseSbcProfile reads legacy flat host as primary', () => {
  const profile = parseSbcProfile({ host: 'sbc1.example.com', port: 5060 });
  assert.strictEqual(profile.primary.host, 'sbc1.example.com');
  assert.strictEqual(profile.hasSecondary, false);
});

test('parseSbcProfile reads primary and secondary', () => {
  const profile = parseSbcProfile({
    primary: { host: 'sbc1.example.com', port: 5060 },
    secondary: { host: 'sbc2.example.com', port: 5060 },
  });
  assert.strictEqual(profile.endpoints.length, 2);
  assert.strictEqual(profile.secondary.host, 'sbc2.example.com');
});

test('buildSbcProfileFromPayload maps secondary flat admin fields', () => {
  const profile = buildSbcProfileFromPayload({
    sbcHost: 'primary.example.com',
    sbcPort: '5060',
    sbcSecondaryHost: 'secondary.example.com',
    sbcSecondaryPort: '5061',
  });
  assert.strictEqual(profile.primary.host, 'primary.example.com');
  assert.strictEqual(profile.secondary.port, 5061);
});

test('validateSbcProfile rejects identical primary and secondary', () => {
  const result = validateSbcProfile({
    primary: { host: 'same.example.com', port: 5060 },
    secondary: { host: 'same.example.com', port: 5060 },
  });
  assert.strictEqual(result.ok, false);
});

test('normalizeSbcDetails stores structured profile', () => {
  const out = normalizeSbcDetails({
    sbcHost: 'p.example.com',
    sbcSecondaryHost: 's.example.com',
  });
  assert.strictEqual(out.primary.host, 'p.example.com');
  assert.strictEqual(out.secondary.host, 's.example.com');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
