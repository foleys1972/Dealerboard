/**
 * Unit tests for line transfer/conference helpers.
 * Run: node server/tests/lineTransferConference.test.js
 */

const assert = require('assert');
const { conferenceKey } = require('../services/dealerboard/lineMediaConferenceService');

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

test('conferenceKey is order-independent', () => {
  assert.strictEqual(conferenceKey('line-a', 'line-b'), conferenceKey('line-b', 'line-a'));
  assert.strictEqual(conferenceKey('line-a', 'line-b'), 'line-a:line-b');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
