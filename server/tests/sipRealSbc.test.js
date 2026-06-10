/**
 * Unit tests for SIP digest auth and SDP helpers.
 * Run: node server/tests/sipRealSbc.test.js
 */

const assert = require('assert');
const { parseWwwAuthenticate, buildAuthorizationHeader } = require('../services/sip/sipDigestAuth');
const { parseAudioMedia, buildAudioOffer, negotiateCodec } = require('../services/sip/sipSdp');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ok ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`  FAIL ${name}:`, error.message);
    failed += 1;
  }
}

test('parseWwwAuthenticate extracts digest params', () => {
  const msg = [
    'SIP/2.0 401 Unauthorized',
    'WWW-Authenticate: Digest realm="sbc.example.com", nonce="abc123", algorithm=MD5, qop="auth"',
    '',
  ].join('\r\n');
  const parsed = parseWwwAuthenticate(msg);
  assert.strictEqual(parsed.realm, 'sbc.example.com');
  assert.strictEqual(parsed.nonce, 'abc123');
  assert.strictEqual(parsed.qop, 'auth');
});

test('buildAuthorizationHeader produces digest response', () => {
  const header = buildAuthorizationHeader({
    username: 'line1',
    password: 'secret',
    method: 'REGISTER',
    uri: 'sip:sbc.example.com',
    challenge: { realm: 'sbc.example.com', nonce: 'abc', algorithm: 'MD5' },
    cnonce: 'fixedcnonce',
    nc: '00000001',
  });
  assert.ok(header.startsWith('Authorization: Digest '));
  assert.ok(header.includes('response="'));
  assert.ok(header.includes('username="line1"'));
});

test('parseAudioMedia reads connection and PCMU', () => {
  const sdp = buildAudioOffer({ ip: '203.0.113.10', port: 35000 });
  const remote = parseAudioMedia(sdp);
  assert.strictEqual(remote.ip, '203.0.113.10');
  assert.strictEqual(remote.port, 35000);
  assert.strictEqual(remote.primaryCodec, 'PCMU');
});

test('negotiateCodec prefers PCMU over PCMA', () => {
  const remote = parseAudioMedia(buildAudioOffer({ ip: '10.0.0.1', port: 40000 }));
  const negotiated = negotiateCodec(['PCMU', 'PCMA'], remote);
  assert.strictEqual(negotiated.codec, 'PCMU');
  assert.strictEqual(negotiated.payloadType, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
