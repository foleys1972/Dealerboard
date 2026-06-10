/**
 * Unit tests for dealerboard line button status (private, busy, ringing, disconnected).
 * Run: node server/tests/lineButtonStatus.test.js
 */

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  Promise.resolve()
    .then(() => fn())
    .then(() => {
      console.log(`  ok ${name}`);
      passed += 1;
    })
    .catch((error) => {
      console.error(`  FAIL ${name}:`, error.message);
      failed += 1;
    });
}

function classifyLineStates({
  lineId,
  targetUserId,
  sessionUsersByLine,
  sipCalls,
  sipRegistered,
}) {
  const privateLineIds = new Set();
  const busyLineIds = new Set();
  const ringingLineIds = new Set();
  const disconnectedLineIds = new Set();

  const userIds = sessionUsersByLine.get(lineId) || new Set();
  if (userIds.has(String(targetUserId))) privateLineIds.add(lineId);

  if (sipRegistered !== true) disconnectedLineIds.add(lineId);

  let lineConnected = false;
  let lineRinging = false;
  for (const call of sipCalls || []) {
    const st = String(call.status || '').toLowerCase();
    if (st === 'connected') lineConnected = true;
    if (st === 'ringing' || st === 'incoming') lineRinging = true;
  }
  if (lineRinging) ringingLineIds.add(lineId);
  if (lineConnected && !privateLineIds.has(lineId)) busyLineIds.add(lineId);
  if (userIds.size > 0 && !privateLineIds.has(lineId)) busyLineIds.add(lineId);

  return { privateLineIds, busyLineIds, ringingLineIds, disconnectedLineIds };
}

async function run() {
  await test('private excludes busy for same user', () => {
    const map = new Map([['line-1', new Set(['user-1'])]]);
    const result = classifyLineStates({
      lineId: 'line-1',
      targetUserId: 'user-1',
      sessionUsersByLine: map,
      sipCalls: [{ status: 'connected' }],
      sipRegistered: true,
    });
    assert.strictEqual(result.privateLineIds.has('line-1'), true);
    assert.strictEqual(result.busyLineIds.has('line-1'), false);
  });

  await test('connected line is busy for other users', () => {
    const map = new Map([['line-1', new Set(['user-2'])]]);
    const result = classifyLineStates({
      lineId: 'line-1',
      targetUserId: 'user-1',
      sessionUsersByLine: map,
      sipCalls: [{ status: 'connected' }],
      sipRegistered: true,
    });
    assert.strictEqual(result.privateLineIds.has('line-1'), false);
    assert.strictEqual(result.busyLineIds.has('line-1'), true);
  });

  await test('unregistered SIP line is disconnected when idle', () => {
    const map = new Map();
    const result = classifyLineStates({
      lineId: 'line-1',
      targetUserId: 'user-1',
      sessionUsersByLine: map,
      sipCalls: [],
      sipRegistered: false,
    });
    assert.strictEqual(result.disconnectedLineIds.has('line-1'), true);
    assert.strictEqual(result.busyLineIds.has('line-1'), false);
  });

  await test('incoming call marks ringing', () => {
    const map = new Map();
    const result = classifyLineStates({
      lineId: 'line-1',
      targetUserId: 'user-1',
      sessionUsersByLine: map,
      sipCalls: [{ status: 'incoming' }],
      sipRegistered: true,
    });
    assert.strictEqual(result.ringingLineIds.has('line-1'), true);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
