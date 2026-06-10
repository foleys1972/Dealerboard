/**
 * Load-aware subscriber selection unit tests (no database required).
 * Run: node server/tests/subscriberSelection.test.js
 */

const assert = require('assert');
const { pickSubscriber, DEFAULT_OVERFLOW_THRESHOLD } = require('../services/auth/subscriberSelection');

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

const url = (u) => ({ serverUrl: u });
const withLoad = (u, ratio) => ({ serverUrl: u, load: { loadRatio: ratio } });

test('returns null when no subscribers', () => {
  assert.strictEqual(pickSubscriber({ primary: null, secondary: null }), null);
  assert.strictEqual(pickSubscriber({}), null);
});

test('uses primary when only primary exists', () => {
  assert.deepStrictEqual(pickSubscriber({ primary: url('https://a'), secondary: null }),
    { serverUrl: 'https://a', reason: 'only-primary' });
});

test('uses secondary when only secondary exists', () => {
  assert.deepStrictEqual(pickSubscriber({ primary: null, secondary: url('https://b') }),
    { serverUrl: 'https://b', reason: 'only-secondary' });
});

test('keeps primary when it has headroom (below threshold)', () => {
  const r = pickSubscriber({ primary: withLoad('https://a', 0.5), secondary: withLoad('https://b', 0.1) });
  assert.strictEqual(r.serverUrl, 'https://a');
  assert.strictEqual(r.reason, 'primary-has-headroom');
});

test('overflows to secondary when primary is busy and secondary is less loaded', () => {
  const r = pickSubscriber({ primary: withLoad('https://a', 0.95), secondary: withLoad('https://b', 0.3) });
  assert.strictEqual(r.serverUrl, 'https://b');
  assert.strictEqual(r.reason, 'overflow-to-secondary');
});

test('stays on primary when both are busy and secondary is not better', () => {
  const r = pickSubscriber({ primary: withLoad('https://a', 0.9), secondary: withLoad('https://b', 0.95) });
  assert.strictEqual(r.serverUrl, 'https://a');
  assert.strictEqual(r.reason, 'both-busy-keep-primary');
});

test('treats missing load as zero (primary has headroom)', () => {
  const r = pickSubscriber({ primary: url('https://a'), secondary: url('https://b') });
  assert.strictEqual(r.serverUrl, 'https://a');
  assert.strictEqual(r.reason, 'primary-has-headroom');
});

test('respects exactly-at-threshold as busy (overflows)', () => {
  const r = pickSubscriber({
    primary: withLoad('https://a', DEFAULT_OVERFLOW_THRESHOLD),
    secondary: withLoad('https://b', 0.2),
  });
  assert.strictEqual(r.serverUrl, 'https://b');
  assert.strictEqual(r.reason, 'overflow-to-secondary');
});

test('ignores candidate with no serverUrl', () => {
  const r = pickSubscriber({ primary: { load: { loadRatio: 0.1 } }, secondary: url('https://b') });
  assert.strictEqual(r.serverUrl, 'https://b');
  assert.strictEqual(r.reason, 'only-secondary');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
