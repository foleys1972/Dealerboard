/**
 * Unit tests for logical SIP line state (SBC/SIP only — no electrical circuits).
 * Run: node server/tests/sipLineStateService.test.js
 */

const assert = require('assert');
const {
  setLineEventEmitter,
  openOrJoinSipLine,
  getLineState,
  notifySbcPathChange,
  migrateSipCallLeg,
  leaveSipLine,
  resolveLineIdFromSipCallId,
} = require('../services/dealerboard/sipLineStateService');

let passed = 0;
let failed = 0;
const events = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result
        .then(() => {
          console.log(`  ok ${name}`);
          passed += 1;
        })
        .catch((error) => {
          console.error(`  FAIL ${name}:`, error.message);
          failed += 1;
        });
    }
    console.log(`  ok ${name}`);
    passed += 1;
    return Promise.resolve();
  } catch (error) {
    console.error(`  FAIL ${name}:`, error.message);
    failed += 1;
    return Promise.resolve();
  }
}

setLineEventEmitter((eventName, payload) => {
  events.push({ eventName, payload });
});

async function run() {
  await test('openOrJoinSipLine creates stable lineSessionKey for lineId', () => {
    const state = openOrJoinSipLine({
      lineId: 'line-a',
      userId: 'user-1',
      dbSessionId: 'sess-1',
      mediaGroupId: 'dealerboard-line:line-a',
      uriAddress: 'sip:broker@example.com',
      aor: 'sip:broker@example.com',
      sipCallId: 'call-old',
    });

    assert.ok(state.lineSessionKey.startsWith('sip-line:line-a:'));
    assert.strictEqual(state.lineId, 'line-a');
    assert.strictEqual(state.sipCallId, 'call-old');
    assert.strictEqual(getLineState('line-a').lineSessionKey, state.lineSessionKey);
  });

  await test('migrateSipCallLeg preserves lineId and lineSessionKey', async () => {
    const before = getLineState('line-a');
    assert.ok(before);

    let dbUpdated = false;
    let rebridged = false;

    await migrateSipCallLeg('line-a', 'call-old', 'call-new', {
      updateDbSessions: async (lineId, oldId, newId) => {
        assert.strictEqual(lineId, 'line-a');
        assert.strictEqual(oldId, 'call-old');
        assert.strictEqual(newId, 'call-new');
        dbUpdated = true;
      },
      rebridgeMedia: async (lineId, newId, mediaGroupId) => {
        assert.strictEqual(lineId, 'line-a');
        assert.strictEqual(newId, 'call-new');
        assert.strictEqual(mediaGroupId, 'dealerboard-line:line-a');
        rebridged = true;
      },
    });

    const after = getLineState('line-a');
    assert.strictEqual(after.lineSessionKey, before.lineSessionKey);
    assert.strictEqual(after.sipCallId, 'call-new');
    assert.strictEqual(resolveLineIdFromSipCallId('call-new'), 'line-a');
    assert.strictEqual(resolveLineIdFromSipCallId('call-old'), null);
    assert.strictEqual(dbUpdated, true);
    assert.strictEqual(rebridged, true);
  });

  await test('notifySbcPathChange keeps same logical line', () => {
    notifySbcPathChange('line-a', {
      sbcRole: 'secondary',
      sbcHost: 'sbc-backup.example.com',
      reason: 'sbc_failover',
    });

    const state = getLineState('line-a');
    assert.strictEqual(state.sbcRole, 'secondary');
    assert.strictEqual(state.sbcHost, 'sbc-backup.example.com');
    assert.strictEqual(state.sipCallId, 'call-new');
  });

  await test('leaveSipLine clears state when last user leaves', () => {
    leaveSipLine('line-a', 'user-1');
    assert.strictEqual(getLineState('line-a'), null);

    const released = events.find((e) => e.payload?.reason === 'line_released');
    assert.ok(released);
    assert.strictEqual(released.payload.lineId, 'line-a');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
