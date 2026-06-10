/**
 * Dealerboard auto-seed layout-planner unit tests (no database required).
 * Run: node server/tests/dealerboardAutoSeed.test.js
 */

const assert = require('assert');
const {
  planSeedAssignments,
  GROUP_BUTTON_RANGE,
  CONTACT_BUTTON_RANGE,
} = require('../services/dealerboard/autoSeedService');

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

test('seeds groups into the group range and contacts into the contact range', () => {
  const plan = planSeedAssignments({
    usedButtons: new Set(),
    groups: [{ id: 'g1' }, { id: 'g2' }],
    contacts: [{ contactUserId: 'u1' }],
  });

  const g1 = plan.find((p) => p.groupId === 'g1');
  const g2 = plan.find((p) => p.groupId === 'g2');
  const c1 = plan.find((p) => p.contactUserId === 'u1');

  assert.strictEqual(g1.buttonNumber, GROUP_BUTTON_RANGE.start);
  assert.strictEqual(g1.assignmentType, 'groupCall');
  assert.strictEqual(g2.buttonNumber, GROUP_BUTTON_RANGE.start + 1);
  assert.strictEqual(c1.buttonNumber, CONTACT_BUTTON_RANGE.start);
  assert.strictEqual(c1.assignmentType, 'directContact');
});

test('skips already-used buttons within a section', () => {
  const plan = planSeedAssignments({
    usedButtons: new Set([GROUP_BUTTON_RANGE.start, GROUP_BUTTON_RANGE.start + 1]),
    groups: [{ id: 'g1' }],
    contacts: [],
  });
  assert.strictEqual(plan.length, 1);
  assert.strictEqual(plan[0].buttonNumber, GROUP_BUTTON_RANGE.start + 2);
});

test('stops when a section is full and does not overflow into the next', () => {
  const groupCapacity = GROUP_BUTTON_RANGE.end - GROUP_BUTTON_RANGE.start + 1;
  const groups = Array.from({ length: groupCapacity + 5 }, (_, i) => ({ id: `g${i}` }));
  const plan = planSeedAssignments({ usedButtons: new Set(), groups, contacts: [] });

  assert.strictEqual(plan.length, groupCapacity);
  assert.ok(plan.every((p) => p.buttonNumber >= GROUP_BUTTON_RANGE.start && p.buttonNumber <= GROUP_BUTTON_RANGE.end));
});

test('ignores groups without id and contacts without contactUserId (FK safety)', () => {
  const plan = planSeedAssignments({
    usedButtons: new Set(),
    groups: [{ id: null }, { name: 'no id' }, { id: 'g1' }],
    contacts: [{ contactUserId: null }, { uri: 'sip:x@y' }, { contactUserId: 'u1' }],
  });
  assert.strictEqual(plan.filter((p) => p.assignmentType === 'groupCall').length, 1);
  assert.strictEqual(plan.filter((p) => p.assignmentType === 'directContact').length, 1);
});

test('empty inputs produce an empty plan', () => {
  assert.deepStrictEqual(planSeedAssignments({ usedButtons: new Set(), groups: [], contacts: [] }), []);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
