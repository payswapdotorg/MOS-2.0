/** PROD-003 — the StrategyCompiler gate-order and assembly battery. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCompiler, makeCompilerDoubles, makeCompileRequest, makePlan, compileSamplePlan } from './fixtures.js';
import { strategyIdFor } from '../strategy-compiler/compile.js';

test('compile happy path assembles the strategy with exact source-plan citation', async () => {
  const { strategy } = await compileSamplePlan();
  assert.equal(strategy.strategyId, strategyIdFor('plan-summer-launch', 3));
  assert.equal(strategy.kind, 'compiled-strategy');
  assert.equal(strategy.tenantId, 'acme-co');
  assert.deepEqual(strategy.sourcePlan, { kind: 'marketing-plan', planId: 'plan-summer-launch', version: 3 });
  assert.equal(strategy.lifecycle, 'compiled');
  assert.equal(strategy.organizationValidation.accepted, true);
  assert.ok(strategy.comparators.length >= 1, 'always-compare baseline comparator is declared');
  assert.ok(strategy.expectedValueOfDelay !== undefined, 'delay policy yields §18 EVD');
  assert.deepEqual(strategy.intelligenceProvenance.map((r) => `${r.recordId}@v${r.recordVersion}`), ['rec-1@v2', 'rec-2@v1']);
  assert.equal(strategy.automationRunSpec.perActionCosts['platform-video'], 60);
  assert.equal(strategy.automationRunSpec.perActionCosts['platform-newsletter'], 25);
  assert.deepEqual(strategy.automationRunSpec.platformChannels['platform-newsletter'], ['digest', 'promo']);
  assert.equal(strategy.automationRunSpec.metricWindows['video-views']?.opensAt, '2026-01-20T00:00:00.000Z');
  assert.equal(strategy.automationRunSpec.haltOnDeadlinePassed, true);
});

test('rights gate fires BEFORE any plan resolution', async () => {
  const doubles = makeCompilerDoubles();
  doubles.rights.verdict = { kind: 'deny', reason: 'policy: summer launch embargoed', attribution: 'rights-authority#rule-7', authority: 'rights-authority' };
  const compiler = makeCompiler(doubles);
  const result = await compiler.compile(makeCompileRequest());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.rejection.name, 'COMPILE_RIGHTS_DENIED');
    assert.equal(result.rejection.attribution, 'rights-authority#rule-7');
  }
  assert.deepEqual(doubles.rights.calls, ['checkCompileRight:acme-co']);
});

test('tenant-id grammar is checked before the rights gate', async () => {
  const doubles = makeCompilerDoubles();
  const compiler = makeCompiler(doubles);
  const result = await compiler.compile(makeCompileRequest({ tenantId: 'Acme-Co' }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.rejection.name, 'TENANT_ID_INVALID');
  assert.deepEqual(doubles.rights.calls, [], 'no rights call for an invalid tenant grammar');
});

test('plan-not-found surfaces the unresolved ref exactly', async () => {
  const doubles = makeCompilerDoubles();
  const compiler = makeCompiler(doubles);
  const result = await compiler.compile(makeCompileRequest({ planRef: { kind: 'marketing-plan', planId: 'plan-missing', version: 9 } }));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.rejection.name, 'PLAN_REF_UNRESOLVED');
    assert.ok(result.rejection.message.includes('plan-missing'));
  }
});

test('plan tenant mismatch is a typed rejection, not an exception', async () => {
  const doubles = makeCompilerDoubles();
  doubles.plans.plan = { kind: 'plan-tenant-mismatch', planTenantId: 'other-co', requestedTenantId: 'acme-co' };
  const result = await makeCompiler(doubles).compile(makeCompileRequest());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.rejection.name, 'PLAN_TENANT_MISMATCH');
});

test('intelligence citation unresolved fails the compile with the record id', async () => {
  const doubles = makeCompilerDoubles();
  doubles.intelligence.resolution = { kind: 'unresolved', recordId: 'rec-2', issue: 'record archived' };
  const result = await makeCompiler(doubles).compile(makeCompileRequest());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.rejection.name, 'INTELLIGENCE_CITATION_UNRESOLVED');
    assert.ok(result.rejection.message.includes('rec-2'));
  }
});

test('platform choice on a non-CONFIRMED record is refused (health-respect)', async () => {
  const doubles = makeCompilerDoubles();
  doubles.intelligence.resolution = {
    kind: 'resolved',
    records: [
      { kind: 'product-intelligence-record', recordId: 'rec-1', recordVersion: 2, summary: 'stale', healthStatus: 'stale' },
      { kind: 'product-intelligence-record', recordId: 'rec-2', recordVersion: 1, summary: 'ok', healthStatus: 'provider-CONFIRMED' },
    ],
  };
  const result = await makeCompiler(doubles).compile(makeCompileRequest());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.rejection.name, 'PLATFORM_HEALTH_NOT_CONFIRMED');
    assert.ok(result.rejection.message.includes('platform-video'));
    assert.ok(result.rejection.message.includes('stale'));
  }
});

test('experiment binding unresolved carries the authority description', async () => {
  const doubles = makeCompilerDoubles();
  doubles.experiments.outcomes = { 'exp-41': { kind: 'binding-inactive', experimentId: 'exp-41', status: 'paused' } };
  const result = await makeCompiler(doubles).compile(makeCompileRequest());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.rejection.name, 'EXPERIMENT_REF_UNRESOLVED');
    assert.ok(result.rejection.message.includes('paused'));
  }
});

test('agents registry rejection is carried verbatim (named rejection discipline)', async () => {
  const doubles = makeCompilerDoubles();
  doubles.agents.receipt = { accepted: false, rejectionName: 'MISSING_DELEGATION_EDGE', detail: 'producer:platform-video lacks a review edge', authorityRecord: 'agents-registry#val-9' };
  const result = await makeCompiler(doubles).compile(makeCompileRequest());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.rejection.name, 'ORGANIZATION_VALIDATION_REJECTED');
    assert.ok(result.rejection.message.includes('MISSING_DELEGATION_EDGE'));
  }
});

test('authority faults become typed rejections, never thrown', async () => {
  const doubles = makeCompilerDoubles();
  (doubles as { plans: unknown }).plans = {
    resolveMarketingPlan: (): Promise<never> => {
      throw new Error('socket hangup');
    },
  };
  const result = await makeCompiler(doubles).compile(makeCompileRequest());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.rejection.name, 'COMPILE_AUTHORITY_FAULT');
});

test('missing model assignments are refused, never fabricated', async () => {
  const doubles = makeCompilerDoubles();
  doubles.plans.plan = makePlan({ modelPreferences: undefined });
  const result = await makeCompiler(doubles).compile(makeCompileRequest());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.rejection.name, 'MODEL_ASSIGNMENT_MISSING');
});

test('caller defaults satisfy model assignment when the plan is silent', async () => {
  const doubles = makeCompilerDoubles();
  doubles.plans.plan = makePlan({ modelPreferences: undefined });
  const result = await makeCompiler(doubles).compile(makeCompileRequest(), {
    modelDefaults: { controller: 'glm-4.7', critic: 'glm-4.7', analyst: 'glm-4.7', producer: 'glm-4.7' },
  });
  assert.equal(result.ok, true);
});
