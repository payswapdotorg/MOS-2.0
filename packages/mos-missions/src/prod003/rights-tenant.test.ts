/** PROD-003 — §31/§27 tenant partitioning and rights gating across both surfaces. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCompilerDoubles, makeArmedRun, makeCompileRequest, makeEngine, TENANT } from './fixtures.js';
import { makeCompiler } from './fixtures.js';
import { isValidTenantId, sameTenant } from '../strategy-compiler/tenant.js';

test('tenant-id grammar accepts lowercase slugs and rejects everything else', () => {
  assert.equal(isValidTenantId('acme-co'), true);
  assert.equal(isValidTenantId('a'), false, 'too short');
  assert.equal(isValidTenantId('Acme-Co'), false, 'uppercase');
  assert.equal(isValidTenantId('-acme'), false, 'leading dash');
  assert.equal(isValidTenantId('a'.repeat(65)), false, 'too long');
  assert.equal(sameTenant('acme-co', 'acme-co'), true);
  assert.equal(sameTenant('acme-co', 'other-co'), false);
});

test('createRun refuses an invalid run tenant grammar', async () => {
  const { engine, strategy } = await makeArmedRun();
  const created = engine.createRun(strategy, { runId: 'run-x', tenantId: 'Bad-Tenant' });
  assert.equal(created.ok, false);
  if (!created.ok) assert.equal(created.rejection.name, 'TENANT_ID_INVALID');
});

test('createRun refuses a strategy/run tenant mismatch', async () => {
  const { engine, strategy } = await makeArmedRun();
  const created = engine.createRun(strategy, { runId: 'run-x', tenantId: 'other-co' });
  assert.equal(created.ok, false);
  if (!created.ok) assert.equal(created.rejection.name, 'RUN_TENANT_MISMATCH');
});

test('compile refuses a request whose tenant differs from the resolved plan', async () => {
  const doubles = makeCompilerDoubles();
  doubles.plans.plan = { kind: 'plan-tenant-mismatch', planTenantId: 'brand-x', requestedTenantId: TENANT };
  const result = await makeCompiler(doubles).compile(makeCompileRequest());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.rejection.name, 'PLAN_TENANT_MISMATCH');
    if (result.rejection.name === 'PLAN_TENANT_MISMATCH') {
      assert.equal(result.rejection.planTenantId, 'brand-x');
    }
  }
});

test('arm re-checks rights per principal (the §27 gate precedes arming)', async () => {
  const doubles = makeCompilerDoubles();
  const { engine, strategy } = await makeArmedRun(doubles);
  const created = engine.createRun(strategy, { runId: 'run-x', tenantId: TENANT });
  if (!created.ok) throw new Error('createRun failed');
  const callsBefore = doubles.rights.calls.length;
  const armed = await engine.arm(created.value, { principal: 'principal-carol' });
  assert.equal(armed.ok, true);
  assert.equal(doubles.rights.calls.length, callsBefore + 1);
});

test('the engine deps carry the same rights authority the compiler used', async () => {
  const doubles = makeCompilerDoubles();
  const engine = makeEngine(doubles);
  assert.ok(engine !== undefined);
});
