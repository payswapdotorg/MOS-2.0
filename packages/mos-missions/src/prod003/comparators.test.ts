/** PROD-003 — §23 declared comparators: the always-compare baseline. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePlan } from './fixtures.js';
import { resolveModelAssignments } from '../strategy-compiler/organization.js';
import { deriveExecutionPhases } from '../strategy-compiler/phases.js';
import { buildGeneralistBaseline, buildDeclaredComparators } from '../strategy-compiler/comparators.js';

test('the generalist baseline is a single-agent organization with no delegation', () => {
  const plan = makePlan();
  const models = resolveModelAssignments(plan, {});
  if (!models.ok) throw new Error('models failed');
  const phases = deriveExecutionPhases(plan, 1);
  const result = buildGeneralistBaseline(plan, phases, models.value, {});
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.roles.length, 1);
  assert.equal(result.value.delegationEdges.length, 0);
  assert.equal(result.value.topology, 'single-agent');
});

test('declared comparators always include the generalist baseline', () => {
  const plan = makePlan();
  const models = resolveModelAssignments(plan, {});
  if (!models.ok) throw new Error('models failed');
  const phases = deriveExecutionPhases(plan, 1);
  const result = buildDeclaredComparators(plan, phases, models.value, {});
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.length, 2, 'the generalist baseline plus the house no-critics comparison');
  assert.equal(result.value[0]?.kind, 'generalist-single-agent-baseline');
  assert.equal(result.value[1]?.kind, 'hand-designed');
});

test('hand-designed comparators are declared when provided', () => {
  const plan = makePlan();
  const models = resolveModelAssignments(plan, {});
  if (!models.ok) throw new Error('models failed');
  const phases = deriveExecutionPhases(plan, 1);
  const baseline = buildGeneralistBaseline(plan, phases, models.value, {});
  if (!baseline.ok) throw new Error('baseline failed');
  const result = buildDeclaredComparators(plan, phases, models.value, { handDesignedComparators: [baseline.value] });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.length, 3);
  assert.equal(result.value.filter((c) => c.kind === 'hand-designed').length, 2);
});
