/**
 * Unit tests for dealerboard line call aggregation helpers.
 * Run: node server/tests/lineCallAggregation.test.js
 */

const assert = require('assert');
const {
  isReusableSipCallStatus,
  findActiveLineSipCall,
  resolveSharedSipCallId,
} = require('../services/dealerboard/lineCallAggregation');

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

test('isReusableSipCallStatus accepts active lifecycle states', () => {
  assert.strictEqual(isReusableSipCallStatus('connected'), true);
  assert.strictEqual(isReusableSipCallStatus('RINGING'), true);
  assert.strictEqual(isReusableSipCallStatus('ended'), false);
  assert.strictEqual(isReusableSipCallStatus('failed'), false);
});

test('findActiveLineSipCall prefers connected over ringing', () => {
  const sipGateway = {
    initialized: true,
    getUserAgent: () => ({
      getActiveCalls: () => [
        { callId: 'ring-1', status: 'ringing' },
        { callId: 'live-1', status: 'connected' },
      ],
    }),
  };

  const call = findActiveLineSipCall(sipGateway, 'line-1');
  assert.strictEqual(call.callId, 'live-1');
});

test('findActiveLineSipCall returns null when gateway unavailable', () => {
  assert.strictEqual(findActiveLineSipCall(null, 'line-1'), null);
  assert.strictEqual(findActiveLineSipCall({ initialized: false }, 'line-1'), null);
});

test('resolveSharedSipCallId reuses UA call over fallback', () => {
  const sipGateway = {
    initialized: true,
    getUserAgent: () => ({
      getActiveCalls: () => [{ callId: 'shared-1', status: 'connected' }],
    }),
  };

  const result = resolveSharedSipCallId(sipGateway, 'line-1', 'stale-id');
  assert.strictEqual(result.sipCallId, 'shared-1');
  assert.strictEqual(result.joinedExistingCall, true);
});

test('resolveSharedSipCallId uses fallback when no active UA call', () => {
  const sipGateway = {
    initialized: true,
    getUserAgent: () => ({ getActiveCalls: () => [] }),
  };

  const result = resolveSharedSipCallId(sipGateway, 'line-1', 'db-call-1');
  assert.strictEqual(result.sipCallId, 'db-call-1');
  assert.strictEqual(result.joinedExistingCall, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
