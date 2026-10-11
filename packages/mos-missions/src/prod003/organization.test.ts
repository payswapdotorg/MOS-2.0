/** PROD-003 — organization resolution: budgets, roles, termination, tools. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePlan } from './fixtures.js';
import { resolveModelAssignments, compileOrganization, DEFAULT_MAX_STEPS, ROLE_BUDGET_SHARES } from '../strategy-compiler/organization.js';
import { deriveExecutionPhases } from '../strategy-compiler/phases.js';

test('model assignments come from plan preferences, per-platform overrides win', () => {
  const plan = makePlan();
  const result = resolveModelAssignments(plan, {});
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.controller, 'glm-4.7');
    assert.equal(result.value.perPlatform['platform-video'], 'glm-4.7');
    assert.equal(result.value.perPlatform['platform-newsletter'], 'glm-4.7');
  }
});

test('compileOrganization assembles roles, exact-sum budgets, termination, tools', () => {
  const plan = makePlan();
  const models = resolveModelAssignments(plan, {});
  if (!models.ok) throw new Error('models failed');
  const phases = deriveExecutionPhases(plan, 1);
  const result = compileOrganization(plan, phases, models.value, {}, 'controller-star');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const candidate = result.value;
  const roleIds = new Set(candidate.roles.map((r) => r.roleId));
  assert.ok(roleIds.has('controller'));
  assert.ok(roleIds.has('critic'));
  assert.ok(roleIds.has('analyst'));
  assert.ok(roleIds.has('producer:platform-video'));
  assert.ok(roleIds.has('producer:platform-newsletter'));
  // §23 budgets: role budgets sum EXACTLY to the ceiling.
  const sum = Object.values(candidate.budgets.perRole).reduce((a, b) => a + b, 0);
  assert.equal(Math.round(sum * 100) / 100, plan.budget.totalCeiling);
  assert.equal(candidate.budgets.perRole['controller'], Math.round(1000 * ROLE_BUDGET_SHARES.controller * 100) / 100);
  // termination: max steps + typed halt conditions
  assert.equal(candidate.termination.maxSteps, DEFAULT_MAX_STEPS);
  const kinds = candidate.termination.haltConditions.map((h) => h.kind).sort();
  assert.deepEqual(kinds, ['budget-exhausted', 'deadline-passed', 'distribution-denied']);
  // tool grants: per-platform distribution binding + scheduler + measurement + evidence recorder
  const toolIds = candidate.toolAllocation.map((t) => t.toolId).sort();
  assert.deepEqual(toolIds, ['distribution-binding:platform-newsletter', 'distribution-binding:platform-video', 'durable-job-scheduler', 'experiment-evidence-recorder', 'measurement-collector']);
});

test('no-critics pipeline style drops the critic role and its budget share', () => {
  const plan = makePlan();
  const models = resolveModelAssignments(plan, {});
  if (!models.ok) throw new Error('models failed');
  const phases = deriveExecutionPhases(plan, 1);
  const result = compileOrganization(plan, phases, models.value, {}, 'no-critics-pipeline');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(!result.value.roles.some((r) => r.roleId === 'critic'));
  const sum = Object.values(result.value.budgets.perRole).reduce((a, b) => a + b, 0);
  assert.equal(Math.round(sum * 100) / 100, plan.budget.totalCeiling);
});

test('options.maxStepsDefault overrides the termination budget', () => {
  const plan = makePlan();
  const models = resolveModelAssignments(plan, {});
  if (!models.ok) throw new Error('models failed');
  const phases = deriveExecutionPhases(plan, 1);
  const result = compileOrganization(plan, phases, models.value, { maxStepsDefault: 3 }, 'controller-star');
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.termination.maxSteps, 3);
});
