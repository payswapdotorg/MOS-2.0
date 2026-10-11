/** PROD-003 — the §26 automation lifecycle state machine. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGAL_TRANSITIONS, TERMINAL_STATES, AUTOMATION_LIFECYCLE_ORDER, canTransition, assertTransition } from '../marketing-automation/lifecycle.js';

test('the legal transition table matches the durable-run design', () => {
  assert.deepEqual(LEGAL_TRANSITIONS['compiled'], ['armed']);
  assert.deepEqual(LEGAL_TRANSITIONS['armed'], ['running', 'halted']);
  assert.deepEqual(LEGAL_TRANSITIONS['running'], ['measured', 'halted']);
  assert.deepEqual(LEGAL_TRANSITIONS['measured'], ['closed', 'halted']);
  assert.deepEqual(LEGAL_TRANSITIONS['closed'], []);
  assert.deepEqual(LEGAL_TRANSITIONS['halted'], []);
  assert.deepEqual(TERMINAL_STATES, ['closed', 'halted']);
  assert.deepEqual(AUTOMATION_LIFECYCLE_ORDER, ['compiled', 'armed', 'running', 'measured', 'closed', 'halted']);
});

test('canTransition is total over the lifecycle', () => {
  assert.equal(canTransition('compiled', 'armed'), true);
  assert.equal(canTransition('compiled', 'running'), false);
  assert.equal(canTransition('armed', 'running'), true);
  assert.equal(canTransition('running', 'measured'), true);
  assert.equal(canTransition('measured', 'closed'), true);
  assert.equal(canTransition('closed', 'armed'), false);
  assert.equal(canTransition('halted', 'running'), false);
});

test('illegal transitions return named typed rejections', () => {
  const result = assertTransition('closed', 'armed');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.rejection.name, 'ILLEGAL_TRANSITION');
    assert.ok(result.rejection.message.includes('closed'));
    assert.ok(result.rejection.message.includes('armed'));
  }
});
