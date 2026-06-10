/**
 * Dealerboard mapper and config helper unit tests (no database required).
 * Run: node server/tests/dealerboardMappers.test.js
 */

const assert = require('assert');
const { mapPreferencesResponse } = require('../db/dealerboard/userPreferences');
const { mapDdiLineRow } = require('../db/dealerboard/ddiLines');
const { mapSpeedDialRow } = require('../db/dealerboard/speedDials');
const { mapGroupRow } = require('../db/dealerboard/dealerboardGroups');
const { shouldPropagateDealerboardAssignment } = require('../db/dealerboard/configGroups');

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

test('mapPreferencesResponse returns defaults when row is null', () => {
  const prefs = mapPreferencesResponse(null);
  assert.strictEqual(prefs.audibleRinging, true);
  assert.deepStrictEqual(prefs.buttonColors, {});
  assert.strictEqual(prefs.defaultDdiLineId, null);
});

test('mapDdiLineRow maps snake_case to camelCase', () => {
  const row = mapDdiLineRow({
    id: 'ddi-1',
    line_number: '+441234567890',
    line_name: 'Main DDI',
    aor: '123456',
    country_code: 'GB',
    sbc_details: { host: 'sbc' },
    connection_details: { callForward: { enabled: false } },
    subscriber_id: 'sub-1',
    ring_timeout: 30,
    sudo_line_reference: 'LINE-1',
    is_active: true,
    metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
  });
  assert.strictEqual(row.lineNumber, '+441234567890');
  assert.strictEqual(row.lineName, 'Main DDI');
  assert.strictEqual(row.sbcHost, 'sbc');
  assert.strictEqual(row.sbcDetails.primary.host, 'sbc');
});

test('mapSpeedDialRow preserves metadata', () => {
  const row = mapSpeedDialRow({
    id: 'sd-1',
    name: 'Desk',
    number: '1001',
    description: 'Front desk',
    metadata: { color: 'blue' },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
  assert.strictEqual(row.number, '1001');
  assert.deepStrictEqual(row.metadata, { color: 'blue' });
});

test('mapGroupRow parses member count', () => {
  const row = mapGroupRow({
    id: 'grp-1',
    name: 'Desk A',
    description: 'Primary desk',
    is_active: true,
    member_count: '3',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
  assert.strictEqual(row.memberCount, 3);
  assert.strictEqual(row.isActive, true);
});

test('shouldPropagateDealerboardAssignment ignores intercom section', () => {
  assert.strictEqual(
    shouldPropagateDealerboardAssignment({ section: 'broadcast', pageNumber: 1 }),
    false
  );
});

test('shouldPropagateDealerboardAssignment allows pages 1-10', () => {
  assert.strictEqual(
    shouldPropagateDealerboardAssignment({ pageNumber: 1, applyToGroup: true }),
    true
  );
  assert.strictEqual(
    shouldPropagateDealerboardAssignment({ pageNumber: 10, applyToGroup: true }),
    true
  );
  assert.strictEqual(
    shouldPropagateDealerboardAssignment({ pageNumber: 11, applyToGroup: true }),
    false
  );
});

test('shouldPropagateDealerboardAssignment respects applyToGroup=false', () => {
  assert.strictEqual(
    shouldPropagateDealerboardAssignment({ pageNumber: 2, applyToGroup: false }),
    false
  );
  assert.strictEqual(
    shouldPropagateDealerboardAssignment({ pageNumber: 2, applyToGroup: 'false' }),
    false
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
