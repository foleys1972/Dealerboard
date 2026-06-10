/**
 * Unit tests for SIP line two-way audio bridge helpers.
 * Run: node server/tests/sipLineAudioBridge.test.js
 */

const assert = require('assert');
const {
  parseRtpPacket,
  buildRtpPacket,
  isWpfMicProducer,
} = require('../services/sip/sipLineAudioBridge');

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

test('parseRtpPacket extracts payload', () => {
  const payload = Buffer.from([1, 2, 3, 4]);
  const packet = buildRtpPacket(payload, 111, 7, 960, 0x12345678);
  const parsed = parseRtpPacket(packet);
  assert.strictEqual(parsed.payloadType, 111);
  assert.deepStrictEqual(parsed.payload, payload);
});

test('isWpfMicProducer accepts WPF plain-transport mic', () => {
  assert.strictEqual(isWpfMicProducer({
    id: 'p1',
    kind: 'audio',
    appData: { source: 'plain-transport', client: 'wpf' },
  }), true);
});

test('isWpfMicProducer rejects SIP leg and relay producers', () => {
  assert.strictEqual(isWpfMicProducer({
    id: 'p2',
    kind: 'audio',
    appData: { source: 'sip-leg' },
  }), false);
  assert.strictEqual(isWpfMicProducer({
    id: 'p3',
    kind: 'audio',
    appData: { source: 'sip-relay' },
  }), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
