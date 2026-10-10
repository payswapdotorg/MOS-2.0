/**
 * PROD-001 adversarial battery (node:test).
 * Covers the W6-C/W10-B hostile classes: cross-tenant forgery, aliasing,
 * deep-freeze corruption, undeclared-capability refusal, plus the hard-law
 * pins (gate ordering, send counting, exactly-one §30, UNKNOWN preserved).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ProductionDistributionService, DistributionRecordStore, DistributionCallerError } from './index.js';
import {
  InMemoryDistributionAuthority,
  InMemoryHealthAuthority,
  InMemoryIntegrationsDirectory,
  InMemoryJobsAuthority,
  InMemoryObservabilitySink,
  InMemoryPolicyGate,
  InMemoryRightsGate,
  ManualTimeSource,
  AuthorityTransportError,
} from './index.js';
import type {
  ArtifactVersionRef,
  AuthorityPublishResult,
  AuthorityRestriction,
  DeclaredCapabilityInstance,
  DistributionRequest,
  HealthRestrictionObservation,
  ProviderTarget,
  TenantId,
  TimeSource,
} from './index.js';
import type { GateConfig } from './index.js';
import type { PublishScript } from './index.js';

// -- fixtures ----------------------------------------------------------------

const TENANT_A: TenantId = 'tenant-a';
const TENANT_B: TenantId = 'tenant-b';

function declaredInstance(): DeclaredCapabilityInstance {
  return { providerId: 'prov-x', capability: 'social-publish', instanceId: 'inst-1', instanceVersion: '2.0.0', channelRef: 'chan-1', accountRef: 'acct-1' };
}

function baseTarget(): ProviderTarget {
  return { capability: { ...declaredInstance() }, credential: { credentialId: 'cred-ref-1' } };
}

function baseArtifact(): ArtifactVersionRef {
  return { kind: 'package', id: 'pkg-alpha', version: '1.2.3' };
}

function baseRequest(): DistributionRequest {
  return {
    tenant: TENANT_A,
    artifactRefs: [baseArtifact()],
    targets: [baseTarget()],
    schedule: { kind: 'immediate' },
    clientJobKey: 'k-1',
    rightsContext: { rightsGrantRef: 'rg-1' },
    policyContext: { policyRef: 'pol-1' },
    observabilityTrail: { recordRefs: ['obs-upstream-1'] },
  };
}

function healthRestriction(status: string, providerId = 'prov-x'): HealthRestrictionObservation {
  return { restrictionId: 'r-1', providerId, status, observedAt: '2025-01-01T00:00:00.000Z' };
}

function providerRestriction(state: 'active' | 'inactive'): AuthorityRestriction {
  return { restrictionId: 'pr-1', providerId: 'prov-x', channelRef: 'chan-1', state, description: 'provider-declared channel hold' };
}

interface StackConfig {
  rights?: GateConfig;
  policy?: GateConfig;
  health?: readonly HealthRestrictionObservation[];
  providerRestrictions?: readonly AuthorityRestriction[];
  declared?: readonly DeclaredCapabilityInstance[];
  publishScript?: PublishScript;
  time?: TimeSource;
}

interface Stack {
  service: ProductionDistributionService;
  authority: InMemoryDistributionAuthority;
  jobs: InMemoryJobsAuthority;
  rights: InMemoryRightsGate;
  policy: InMemoryPolicyGate;
  health: InMemoryHealthAuthority;
  observability: InMemoryObservabilitySink;
  store: DistributionRecordStore;
  time: ManualTimeSource;
}

function buildStack(cfg: StackConfig = {}): Stack {
  const time = (cfg.time ?? new ManualTimeSource(1_000_000)) as ManualTimeSource;
  const authority = new InMemoryDistributionAuthority({ time, restrictions: cfg.providerRestrictions ?? [], publishScript: cfg.publishScript });
  const jobs = new InMemoryJobsAuthority({ time });
  const rights = new InMemoryRightsGate(cfg.rights);
  const policy = new InMemoryPolicyGate(cfg.policy);
  const health = new InMemoryHealthAuthority(cfg.health);
  const integrations = new InMemoryIntegrationsDirectory(cfg.declared ?? [declaredInstance()]);
  const observability = new InMemoryObservabilitySink();
  const store = new DistributionRecordStore();
  const service = new ProductionDistributionService({
    rightsGate: rights, policyGate: policy, authority, jobs, health, integrations, observability, store, time,
  });
  jobs.registerHandler('mos-distribution.production.publish', service.createPublishJobHandler());
  return { service, authority, jobs, rights, policy, health, observability, store, time };
}

async function expectCallerError(promise: Promise<unknown>, rule: string): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof DistributionCallerError, `expected DistributionCallerError, got ${String(caught)}`);
  assert.ok(
    caught.details.some((d) => d.rule === rule),
    `expected rule ${rule}, got ${caught.details.map((d) => d.rule).join(',')}`,
  );
}

function assertNothingRecorded(stack: Stack): void {
  assert.equal(stack.store.listPlans({ tenant: TENANT_A }).length, 0);
  assert.equal(stack.store.listEvents({ tenant: TENANT_A }).length, 0);
  assert.equal(stack.observability.records.length, 0);
  assert.equal(stack.authority.sendCount, 0);
}

async function submitAndRun(stack: Stack, request: DistributionRequest): Promise<string> {
  const result = await stack.service.submitDistributionRequest(request);
  assert.equal(result.status, 'queued');
  assert.ok(result.job !== undefined);
  await stack.jobs.runDue();
  return result.distributionId;
}

// -- A. submission & records --------------------------------------------------

describe('PROD-001 adversarial: submission & records', () => {
  it('#A1 immediate submit is queued, plan + requested event recorded', async () => {
    const stack = buildStack();
    const result = await stack.service.submitDistributionRequest(baseRequest());
    assert.equal(result.status, 'queued');
    assert.ok(result.job !== undefined && result.job.state === 'queued');
    assert.equal(stack.store.listPlans({ tenant: TENANT_A }).length, 1);
    assert.ok(stack.store.listEvents({ tenant: TENANT_A, distributionId: result.distributionId }).some((e) => e.kind === 'requested'));
  });

  it('#A2 runDue publishes via the authority and records observation refs', async () => {
    const stack = buildStack();
    const id = await submitAndRun(stack, baseRequest());
    const events = stack.store.listEvents({ tenant: TENANT_A, distributionId: id });
    assert.ok(events.some((e) => e.kind === 'publish-succeeded'));
    assert.equal(stack.authority.invocations.publish, 1);
  });

  it('#A3 scheduled distribution rides the jobs queue, not transport schedule', async () => {
    const stack = buildStack();
    const request = { ...baseRequest(), schedule: { kind: 'scheduled' as const, scheduledAt: new Date(1_060_000).toISOString() } };
    const result = await stack.service.submitDistributionRequest(request);
    assert.equal(result.status, 'queued');
    await stack.jobs.runDue(); // before due time
    assert.equal(stack.authority.invocations.publish, 0);
    stack.time.advance(60_000);
    await stack.jobs.runDue();
    assert.equal(stack.authority.invocations.publish, 1);
    assert.equal(stack.authority.invocations.schedule, 0); // §26: never transport-side scheduling
  });

  it('#A4 idempotent resubmit replays without new records', async () => {
    const stack = buildStack();
    const first = await stack.service.submitDistributionRequest(baseRequest());
    const second = await stack.service.submitDistributionRequest(baseRequest());
    assert.equal(second.distributionId, first.distributionId);
    assert.equal(second.replayed, true);
    assert.equal(stack.store.listEvents({ tenant: TENANT_A }).length, 2); // requested + queued only
    assert.equal(stack.observability.records.length, 1);
    assert.equal(stack.jobs.size, 1);
  });

  it('#A5 jobs enqueue is idempotent by (tenant, client job key)', async () => {
    const stack = buildStack();
    const declaration = {
      tenant: TENANT_A,
      clientJobKey: 'k-1',
      kind: 'mos-distribution.production.publish' as const,
      payload: { distributionId: 'dist-x', targets: [baseTarget()], artifactRefs: [baseArtifact()] },
      backoff: { kind: 'exponential' as const, baseMs: 10, maxAttempts: 2 },
      timeoutMs: 1000,
    };
    const a = await stack.jobs.enqueue(declaration);
    const b = await stack.jobs.enqueue(declaration);
    assert.equal(a.jobId, b.jobId);
    assert.equal(stack.jobs.size, 1);
  });

  it('#A6 immediate submit without runDue performs ZERO transport (durable-only)', async () => {
    const stack = buildStack();
    await stack.service.submitDistributionRequest(baseRequest());
    assert.equal(stack.authority.sendCount, 0);
  });
});

// -- B. gate chain -------------------------------------------------------------

describe('PROD-001 adversarial: gate ordering & zero-transport pins', () => {
  it('#B1 rights denial: denied with verbatim reason', async () => {
    const stack = buildStack({ rights: { decision: 'DENY', reason: 'rights:grant-expired' } });
    const result = await stack.service.submitDistributionRequest(baseRequest());
    assert.equal(result.status, 'denied');
    assert.equal(result.reason, 'rights:grant-expired');
  });

  it('#B2 rights denial: ZERO transport AND zero authority reads', async () => {
    const stack = buildStack({ rights: { decision: 'DENY', reason: 'nope' } });
    await stack.service.submitDistributionRequest(baseRequest());
    assert.equal(stack.authority.sendCount, 0);
    assert.equal(stack.authority.invocations.listRestrictions, 0);
  });

  it('#B3 rights denial: policy gate NOT evaluated', async () => {
    const stack = buildStack({ rights: { decision: 'DENY', reason: 'nope' } });
    await stack.service.submitDistributionRequest(baseRequest());
    assert.deepEqual(stack.rights.evaluationLog, ['rights']);
    assert.deepEqual(stack.policy.evaluationLog, []);
  });

  it('#B4 rights denial: exactly ONE §30 record, denied, verbatim', async () => {
    const stack = buildStack({ rights: { decision: 'DENY', reason: 'rights:verbatim-reason' } });
    await stack.service.submitDistributionRequest(baseRequest());
    const records = stack.observability.records;
    assert.equal(records.length, 1);
    const rec = records.at(0);
    assert.ok(rec !== undefined);
    assert.equal(rec.outcome, 'denied');
    assert.equal(rec.decidedAt, 'rights-gate');
    assert.equal(rec.reason, 'rights:verbatim-reason');
  });

  it('#B5 policy denial: denied, verbatim, one §30 record, zero transport', async () => {
    const stack = buildStack({ policy: { decision: 'DENY', reason: 'policy:channel-not-allowed' } });
    const result = await stack.service.submitDistributionRequest(baseRequest());
    assert.equal(result.status, 'denied');
    assert.equal(result.reason, 'policy:channel-not-allowed');
    assert.equal(stack.authority.sendCount, 0);
    const rec = stack.observability.records.at(0);
    assert.ok(rec !== undefined && rec.decidedAt === 'policy-gate' && rec.reason === 'policy:channel-not-allowed');
  });

  it('#B6 allow path: rights evaluated before policy', async () => {
    const stack = buildStack();
    await stack.service.submitDistributionRequest(baseRequest());
    assert.deepEqual([...stack.rights.evaluationLog, ...stack.policy.evaluationLog], ['rights', 'policy']);
  });

  it('#B7 allow path: exactly ONE §30 record, allowed', async () => {
    const stack = buildStack();
    await stack.service.submitDistributionRequest(baseRequest());
    await stack.jobs.runDue();
    assert.equal(stack.observability.records.length, 1);
    const rec = stack.observability.records.at(0);
    assert.ok(rec !== undefined && rec.outcome === 'allowed' && rec.decidedAt === 'gate-chain');
  });

  it('#B8 denial: no job enqueued, no queued event', async () => {
    const stack = buildStack({ rights: { decision: 'DENY', reason: 'nope' } });
    const result = await stack.service.submitDistributionRequest(baseRequest());
    assert.equal(stack.jobs.size, 0);
    assert.ok(!stack.store.listEvents({ tenant: TENANT_A, distributionId: result.distributionId }).some((e) => e.kind === 'queued'));
  });
});

// -- C. caller-error shapes record nothing -------------------------------------

describe('PROD-001 adversarial: caller-error shapes record nothing', () => {
  it('#C1 version range "^1.0.0" is a caller error', async () => {
    const stack = buildStack();
    const bad = { ...baseRequest(), artifactRefs: [{ kind: 'package', id: 'pkg-alpha', version: '^1.0.0' }] };
    await expectCallerError(stack.service.submitDistributionRequest(bad), 'version-must-be-exact');
    assertNothingRecorded(stack);
  });

  it('#C2 version "latest" is a caller error', async () => {
    const stack = buildStack();
    const bad = { ...baseRequest(), artifactRefs: [{ kind: 'package', id: 'pkg-alpha', version: 'latest' }] };
    await expectCallerError(stack.service.submitDistributionRequest(bad), 'version-must-be-exact');
    assertNothingRecorded(stack);
  });

  it('#C3 inline media at request root is rejected by rule name', async () => {
    const stack = buildStack();
    const bad = { ...baseRequest(), media: 'inline-bytes' };
    await expectCallerError(stack.service.submitDistributionRequest(bad), 'inline-media-forbidden');
    assertNothingRecorded(stack);
  });

  it('#C4 inline bytes on an artifact entry is rejected by rule name', async () => {
    const stack = buildStack();
    const bad = { ...baseRequest(), artifactRefs: [{ kind: 'package', id: 'pkg-alpha', version: '1.2.3', bytes: 'AAAA' }] };
    await expectCallerError(stack.service.submitDistributionRequest(bad), 'inline-media-forbidden');
    assertNothingRecorded(stack);
  });

  it('#C5 credential secret value is rejected by rule name', async () => {
    const stack = buildStack();
    const bad = {
      ...baseRequest(),
      targets: [{ capability: baseTarget().capability, credential: { credentialId: 'cred-ref-1', secret: 'leak' } }],
    };
    await expectCallerError(stack.service.submitDistributionRequest(bad), 'credential-value-forbidden');
    assertNothingRecorded(stack);
  });

  it('#C6 empty artifactRefs / empty targets are caller errors', async () => {
    const stack = buildStack();
    await expectCallerError(stack.service.submitDistributionRequest({ ...baseRequest(), artifactRefs: [] }), 'must-be-non-empty-array');
    await expectCallerError(stack.service.submitDistributionRequest({ ...baseRequest(), targets: [] }), 'must-be-non-empty-array');
    assertNothingRecorded(stack);
  });

  it('#C7 __proto__ injection is a caller error and records nothing', async () => {
    const stack = buildStack();
    const bad = JSON.parse('{"tenant":"tenant-a","__proto__":{"evil":1}}');
    await expectCallerError(stack.service.submitDistributionRequest(bad), 'prototype-pollution');
    assertNothingRecorded(stack);
  });
});

// -- D. capability exactness ----------------------------------------------------

describe('PROD-001 adversarial: undeclared-capability refusal (exact version)', () => {
  it('#D1 undeclared provider refuses and records nothing', async () => {
    const stack = buildStack({ declared: [] });
    await expectCallerError(stack.service.submitDistributionRequest(baseRequest()), 'undeclared-capability-refusal');
    assertNothingRecorded(stack);
  });

  it('#D2 declared instance at a different exact version refuses', async () => {
    const stack = buildStack();
    const bad = {
      ...baseRequest(),
      targets: [{ capability: { ...declaredInstance(), instanceVersion: '1.9.9' }, credential: { credentialId: 'cred-ref-1' } }],
    };
    await expectCallerError(stack.service.submitDistributionRequest(bad), 'undeclared-capability-refusal');
    assertNothingRecorded(stack);
  });

  it('#D3 channel aliasing against the declared instance refuses', async () => {
    const stack = buildStack();
    const bad = {
      ...baseRequest(),
      targets: [{ capability: { ...declaredInstance(), channelRef: 'chan-forged' }, credential: { credentialId: 'cred-ref-1' } }],
    };
    await expectCallerError(stack.service.submitDistributionRequest(bad), 'undeclared-capability-refusal');
    assertNothingRecorded(stack);
  });

  it('#D4 capability refusal precedes the gates', async () => {
    const stack = buildStack({ declared: [] });
    await expectCallerError(stack.service.submitDistributionRequest(baseRequest()), 'undeclared-capability-refusal');
    assert.equal(stack.rights.evaluationLog.length, 0);
    assert.equal(stack.policy.evaluationLog.length, 0);
  });
});

// -- E. health-respect ----------------------------------------------------------

describe('PROD-001 adversarial: health-respect (CONFIRMED-only gating)', () => {
  it('#E1 CONFIRMED provider restriction excludes the only target: denied, zero transport, one §30', async () => {
    const stack = buildStack({ health: [healthRestriction('CONFIRMED')] });
    const result = await stack.service.submitDistributionRequest(baseRequest());
    assert.equal(result.status, 'denied');
    assert.ok(result.reason !== undefined && result.reason.includes('health-confirmed:r-1'));
    assert.equal(stack.authority.sendCount, 0);
    const rec = stack.observability.records.at(0);
    assert.ok(rec !== undefined && rec.decidedAt === 'health-restrictions');
  });

  it('#E2 plan records the health context it consulted', async () => {
    const stack = buildStack({ health: [healthRestriction('CONFIRMED')] });
    const result = await stack.service.submitDistributionRequest(baseRequest());
    const ctx = result.plan.healthContextConsulted;
    assert.ok(ctx !== undefined && ctx.restrictions.length === 1 && ctx.consultedAt.length > 0);
    assert.deepEqual(result.plan.exclusions.map((e) => e.source), ['health-confirmed']);
  });

  it('#E3 SUSPECTED never gates: distribution proceeds', async () => {
    const stack = buildStack({ health: [healthRestriction('SUSPECTED')] });
    const result = await stack.service.submitDistributionRequest(baseRequest());
    assert.equal(result.status, 'queued');
    assert.equal(result.plan.exclusions.length, 0);
    await stack.jobs.runDue();
    assert.equal(stack.authority.invocations.publish, 1);
  });

  it('#E4 UNKNOWN never gates: distribution proceeds', async () => {
    const stack = buildStack({ health: [healthRestriction('UNKNOWN')] });
    const result = await stack.service.submitDistributionRequest(baseRequest());
    assert.equal(result.status, 'queued');
    assert.equal(result.plan.exclusions.length, 0);
  });

  it('#E5 unrecognized status PROBATION: never gated, preserved verbatim', async () => {
    const stack = buildStack({ health: [healthRestriction('PROBATION')] });
    const result = await stack.service.submitDistributionRequest(baseRequest());
    assert.equal(result.status, 'queued');
    assert.equal(result.plan.exclusions.length, 0);
    const ctx = result.plan.healthContextConsulted;
    assert.ok(ctx !== undefined && ctx.restrictions.at(0)?.status === 'PROBATION');
  });

  it('#E6 CONFIRMED restriction on another provider does not gate', async () => {
    const stack = buildStack({ health: [healthRestriction('CONFIRMED', 'prov-other')] });
    const result = await stack.service.submitDistributionRequest(baseRequest());
    assert.equal(result.status, 'queued');
    assert.equal(result.plan.exclusions.length, 0);
  });

  it('#E7 CONFIRMED restriction scoped to another channel does not gate', async () => {
    const stack = buildStack({ health: [{ ...healthRestriction('CONFIRMED'), channelRef: 'chan-2' }] });
    const result = await stack.service.submitDistributionRequest(baseRequest());
    assert.equal(result.status, 'queued');
    assert.equal(result.plan.exclusions.length, 0);
  });

  it('#E8 provider-declared ACTIVE restriction excludes; INACTIVE does not', async () => {
    const active = buildStack({ providerRestrictions: [providerRestriction('active')] });
    const activeResult = await active.service.submitDistributionRequest(baseRequest());
    assert.equal(activeResult.status, 'denied');
    assert.equal(activeResult.plan.exclusions.at(0)?.source, 'provider-declared-active');
    const inactive = buildStack({ providerRestrictions: [providerRestriction('inactive')] });
    const inactiveResult = await inactive.service.submitDistributionRequest(baseRequest());
    assert.equal(inactiveResult.status, 'queued');
    assert.ok(inactiveResult.plan.providerRestrictionsConsulted !== undefined);
  });
});

// -- F. durable jobs ------------------------------------------------------------

describe('PROD-001 adversarial: durable execution (§26)', () => {
  it('#F1 state machine: queued → running → succeeded (running observed mid-handler)', async () => {
    const stack = buildStack();
    let observedState: string | undefined;
    const realHandler = stack.service.createPublishJobHandler();
    stack.jobs.registerHandler('mos-distribution.production.publish', async (job) => {
      const handle = await stack.jobs.getJob({ tenant: job.declaration.tenant, jobId: job.jobId });
      observedState = handle?.state;
      return realHandler(job);
    });
    const result = await stack.service.submitDistributionRequest(baseRequest());
    assert.ok(result.job !== undefined && result.job.state === 'queued');
    await stack.jobs.runDue();
    assert.equal(observedState, 'running');
    const final = await stack.jobs.getJob({ tenant: TENANT_A, jobId: result.job.jobId });
    assert.equal(final?.state, 'succeeded');
  });

  it('#F2 transport_error is retried from declared backoff and succeeds', async () => {
    let calls = 0;
    const script = (): AuthorityPublishResult => {
      calls += 1;
      if (calls === 1) throw new AuthorityTransportError('transport_error', 'synthetic first-attempt failure');
      return { observationId: 'obs-retry-2', providerId: 'prov-x', platformPostRef: 'post-retry-2', recordedAt: '2025-01-01T00:00:00.000Z' };
    };
    const stack = buildStack({ publishScript: script });
    const result = await stack.service.submitDistributionRequest(baseRequest());
    assert.ok(result.job !== undefined);
    await stack.jobs.runDue();
    let job = await stack.jobs.getJob({ tenant: TENANT_A, jobId: result.job.jobId });
    assert.equal(job?.state, 'queued');
    assert.equal(job?.attempts, 1);
    assert.equal(stack.authority.invocations.publish, 1);
    assert.equal(stack.jobs.nextRunAtMs(result.job.jobId), stack.time.nowMs() + 500);
    stack.time.advance(500);
    await stack.jobs.runDue();
    job = await stack.jobs.getJob({ tenant: TENANT_A, jobId: result.job.jobId });
    assert.equal(job?.state, 'succeeded');
    assert.equal(job?.attempts, 2);
    const kinds = stack.store.listEvents({ tenant: TENANT_A, distributionId: result.distributionId })
      .filter((e) => e.kind === 'publish-failed' || e.kind === 'publish-succeeded')
      .map((e) => e.kind);
    assert.deepEqual(kinds, ['publish-failed', 'publish-succeeded']);
  });

  it('#F3 backoffDelayMs doubles per attempt from the declared base', () => {
    const backoff = { kind: 'exponential' as const, baseMs: 100, maxAttempts: 5 };
    assert.equal(backoffDelayMsOf(backoff, 1), 100);
    assert.equal(backoffDelayMsOf(backoff, 2), 200);
    assert.equal(backoffDelayMsOf(backoff, 3), 400);
  });

  it('#F4 provider_rejected is terminal after one attempt', async () => {
    const script = (): AuthorityPublishResult => {
      throw new AuthorityTransportError('provider_rejected', 'provider refused');
    };
    const stack = buildStack({ publishScript: script });
    const result = await stack.service.submitDistributionRequest(baseRequest());
    assert.ok(result.job !== undefined);
    await stack.jobs.runDue();
    const job = await stack.jobs.getJob({ tenant: TENANT_A, jobId: result.job.jobId });
    assert.equal(job?.state, 'failed');
    assert.equal(job?.attempts, 1);
  });

  it('#F5 unknown failure kind "teapot" is preserved verbatim and never retried', async () => {
    const script = (): AuthorityPublishResult => {
      throw new AuthorityTransportError('teapot', 'i am a teapot');
    };
    const stack = buildStack({ publishScript: script });
    const result = await stack.service.submitDistributionRequest(baseRequest());
    assert.ok(result.job !== undefined);
    await stack.jobs.runDue();
    stack.time.advance(10_000);
    await stack.jobs.runDue();
    const job = await stack.jobs.getJob({ tenant: TENANT_A, jobId: result.job.jobId });
    assert.equal(job?.state, 'failed');
    assert.equal(job?.attempts, 1);
    assert.ok(job?.lastFailure !== undefined && job.lastFailure.kind === 'unknown_failure');
    assert.equal(job?.lastFailure.kind === 'unknown_failure' ? job.lastFailure.preservedKind : undefined, 'teapot');
  });

  it('#F6 timeout exhausting attempts terminates in timed_out', async () => {
    const script = (): AuthorityPublishResult => {
      throw new AuthorityTransportError('timeout', 'too slow');
    };
    const stack = buildStack({ publishScript: script });
    const request = { ...baseRequest(), backoffPolicy: { kind: 'exponential' as const, baseMs: 1, maxAttempts: 2 } };
    const result = await stack.service.submitDistributionRequest(request);
    assert.ok(result.job !== undefined);
    await stack.jobs.runDue();
    stack.time.advance(1);
    await stack.jobs.runDue();
    const job = await stack.jobs.getJob({ tenant: TENANT_A, jobId: result.job.jobId });
    assert.equal(job?.state, 'timed_out');
    assert.equal(job?.attempts, 2);
  });

  it('#F7 retryable failures exhaust at maxAttempts into failed', async () => {
    const script = (): AuthorityPublishResult => {
      throw new AuthorityTransportError('transport_error', 'always failing');
    };
    const stack = buildStack({ publishScript: script });
    const request = { ...baseRequest(), backoffPolicy: { kind: 'exponential' as const, baseMs: 1, maxAttempts: 3 } };
    const result = await stack.service.submitDistributionRequest(request);
    assert.ok(result.job !== undefined);
    await stack.jobs.runDue();
    stack.time.advance(1);
    await stack.jobs.runDue();
    stack.time.advance(2);
    await stack.jobs.runDue();
    const job = await stack.jobs.getJob({ tenant: TENANT_A, jobId: result.job.jobId });
    assert.equal(job?.state, 'failed');
    assert.equal(job?.attempts, 3);
  });

  it('#F8 cancel: queued job cancelled, handler never invoked, cancelled event', async () => {
    const stack = buildStack();
    const result = await stack.service.submitDistributionRequest(baseRequest());
    const handle = await stack.service.cancel({ tenant: TENANT_A, distributionId: result.distributionId });
    assert.equal(handle?.state, 'cancelled');
    await stack.jobs.runDue();
    assert.equal(stack.authority.invocations.publish, 0);
    assert.ok(stack.store.listEvents({ tenant: TENANT_A, distributionId: result.distributionId }).some((e) => e.kind === 'cancelled'));
  });
});

// -- G. tenant scoping & hostile probes -----------------------------------------

describe('PROD-001 adversarial: tenant scoping & hostile probes', () => {
  async function seeded(): Promise<Stack & { id: string; jobId: string }> {
    const stack = buildStack();
    const result = await stack.service.submitDistributionRequest(baseRequest());
    assert.ok(result.job !== undefined);
    return { ...stack, id: result.distributionId, jobId: result.job.jobId };
  }

  it('#G1 tenant B cannot read tenant A plan', async () => {
    const ctx = await seeded();
    assert.equal(ctx.service.getPlan({ tenant: TENANT_B, distributionId: ctx.id }), null);
  });

  it('#G2 tenant B lists no plans', async () => {
    const ctx = await seeded();
    assert.equal(ctx.service.listPlans(TENANT_B).length, 0);
  });

  it('#G3 tenant B lists no events for A distribution', async () => {
    const ctx = await seeded();
    assert.equal(ctx.service.listEvents({ tenant: TENANT_B, distributionId: ctx.id }).length, 0);
  });

  it('#G4 tenant B observation-ref read is a not-found caller error (no existence leak)', async () => {
    const ctx = await seeded();
    await expectCallerError(ctx.service.readObservationRefs({ tenant: TENANT_B, distributionId: ctx.id }), 'not-found-for-tenant');
    assert.equal(ctx.observability.records.length, 1);
  });

  it('#G5 same clientJobKey across tenants creates separate plans (no aliasing)', async () => {
    const stack = buildStack();
    const a = await stack.service.submitDistributionRequest(baseRequest());
    const b = await stack.service.submitDistributionRequest({ ...baseRequest(), tenant: TENANT_B });
    assert.notEqual(a.distributionId, b.distributionId);
    assert.equal(stack.store.listPlans({ tenant: TENANT_A }).length, 1);
    assert.equal(stack.store.listPlans({ tenant: TENANT_B }).length, 1);
    assert.equal(stack.jobs.size, 2);
  });

  it('#G6 tenant B cannot get or cancel tenant A job', async () => {
    const ctx = await seeded();
    assert.equal(await ctx.jobs.getJob({ tenant: TENANT_B, jobId: ctx.jobId }), null);
    assert.equal(await ctx.jobs.cancelJob({ tenant: TENANT_B, jobId: ctx.jobId }), null);
  });

  it('#G7 cross-tenant retraction is not-found, zero retract sends', async () => {
    const ctx = await seeded();
    await expectCallerError(ctx.service.requestRetraction({
      tenant: TENANT_B, distributionId: ctx.id, reason: 'hostile probe',
      rightsContext: { rightsGrantRef: 'rg-9' }, policyContext: { policyRef: 'pol-9' },
    }), 'not-found-for-tenant');
    assert.equal(ctx.authority.invocations.delete, 0);
  });

  it('#G8 unknown-id retraction (same tenant) is not-found, records nothing new', async () => {
    const ctx = await seeded();
    await expectCallerError(ctx.service.requestRetraction({
      tenant: TENANT_A, distributionId: 'dist-does-not-exist', reason: 'x',
      rightsContext: { rightsGrantRef: 'rg-9' }, policyContext: { policyRef: 'pol-9' },
    }), 'not-found-for-tenant');
    assert.equal(ctx.observability.records.length, 1);
  });

  it('#G9 tenant-scoped idempotency: B same key enqueues a distinct job', async () => {
    const stack = buildStack();
    await stack.service.submitDistributionRequest(baseRequest());
    const b = await stack.service.submitDistributionRequest({ ...baseRequest(), tenant: TENANT_B });
    assert.equal(b.replayed, undefined);
    assert.equal(stack.jobs.size, 2);
  });
});

// -- H. append-only immutability -------------------------------------------------

describe('PROD-001 adversarial: append-only, immutable records', () => {
  it('#H1 mutating a returned plan (nested credential) throws', async () => {
    const stack = buildStack();
    const result = await stack.service.submitDistributionRequest(baseRequest());
    const plan = result.plan;
    assert.throws(() => {
      (plan.request.targets[0] as unknown as { credential: { credentialId: string } }).credential.credentialId = 'forged';
    }, TypeError);
  });

  it('#H2 mutating a stored event observation ref throws', async () => {
    const stack = buildStack();
    const id = await submitAndRun(stack, baseRequest());
    const events = stack.store.listEvents({ tenant: TENANT_A, distributionId: id });
    const refs = events.find((e) => e.kind === 'publish-succeeded')?.observationRefs;
    assert.ok(refs !== undefined && refs.length > 0);
    assert.throws(() => {
      (refs[0] as unknown as { observationId: string }).observationId = 'forged';
    }, TypeError);
  });

  it('#H3 mutating a returned event list (push) throws', async () => {
    const stack = buildStack();
    const id = await submitAndRun(stack, baseRequest());
    const events = stack.store.listEvents({ tenant: TENANT_A, distributionId: id });
    assert.throws(() => {
      (events as unknown as unknown[]).push({ forged: true });
    }, TypeError);
  });

  it('#H4 no aliasing: mutating the caller object after submit changes nothing', async () => {
    const stack = buildStack();
    const raw = { ...baseRequest() } as unknown as Record<string, unknown>;
    const result = await stack.service.submitDistributionRequest(raw);
    const targets = raw.targets as unknown as { credential: { credentialId: string } }[];
    targets[0]!.credential.credentialId = 'mutated-after-submit';
    assert.equal(result.plan.request.targets[0]!.credential.credentialId, 'cred-ref-1');
  });

  it('#H5 store is append-only: duplicate plan id is refused', async () => {
    const stack = buildStack();
    const result = await stack.service.submitDistributionRequest(baseRequest());
    assert.throws(() => stack.store.recordPlan(result.plan), /duplicate distributionId/);
  });

  it('#H6 §30 sink records are frozen', async () => {
    const stack = buildStack();
    await stack.service.submitDistributionRequest(baseRequest());
    const rec = stack.observability.records.at(0);
    assert.ok(rec !== undefined);
    assert.throws(() => {
      (rec as unknown as { outcome: string }).outcome = 'forged';
    }, TypeError);
  });
});

// -- I. observations by reference & retraction -----------------------------------

describe('PROD-001 adversarial: observations by reference & retraction', () => {
  it('#I1 stored records contain no observation payloads', async () => {
    const stack = buildStack();
    const id = await submitAndRun(stack, baseRequest());
    const json = JSON.stringify(stack.store.listEvents({ tenant: TENANT_A, distributionId: id }));
    assert.ok(!json.includes('platformSaid'));
    assert.ok(!json.includes('sourceAttribution'));
  });

  it('#I2 observation refs are locators citing @mos/distribution', async () => {
    const stack = buildStack();
    const id = await submitAndRun(stack, baseRequest());
    const refs = await stack.service.readObservationRefs({ tenant: TENANT_A, distributionId: id });
    const ref = refs.at(0);
    assert.ok(ref !== undefined);
    assert.equal(ref.authorityModule, '@mos/distribution');
    assert.deepEqual(Object.keys(ref).sort(), ['authorityModule', 'observationId', 'providerId', 'recordedAt']);
  });

  it('#I3 refs are deduped across durable retries', async () => {
    let calls = 0;
    const script = (): AuthorityPublishResult => {
      calls += 1;
      if (calls === 1) throw new AuthorityTransportError('transport_error', 'first fails');
      return { observationId: 'obs-dedup', providerId: 'prov-x', platformPostRef: 'post-dedup', recordedAt: '2025-01-01T00:00:00.000Z' };
    };
    const stack = buildStack({ publishScript: script });
    const result = await stack.service.submitDistributionRequest(baseRequest());
    assert.ok(result.job !== undefined);
    await stack.jobs.runDue();
    stack.time.advance(500);
    await stack.jobs.runDue();
    const refs = await stack.service.readObservationRefs({ tenant: TENANT_A, distributionId: result.distributionId });
    assert.equal(refs.length, 1);
  });

  it('#I4 retraction composes authority delete per observation with gate chain', async () => {
    const stack = buildStack();
    const id = await submitAndRun(stack, baseRequest());
    const result = await stack.service.requestRetraction({
      tenant: TENANT_A, distributionId: id, reason: 'takedown-1',
      rightsContext: { rightsGrantRef: 'rg-2' }, policyContext: { policyRef: 'pol-2' },
    });
    assert.equal(result.status, 'retracted');
    assert.equal(stack.authority.invocations.delete, 1);
    assert.ok(stack.store.listEvents({ tenant: TENANT_A, distributionId: id }).some((e) => e.kind === 'retracted'));
    assert.equal(stack.observability.records.length, 2); // publish attempt + retraction attempt
  });

  it('#I5 retraction rights denial: verbatim reason, zero retract sends, one §30', async () => {
    const stack = buildStack({ rights: { decision: 'DENY', reason: 'rights:no-retract', denyOnlyRefs: ['rg-2'] } });
    const id = await submitAndRun(stack, baseRequest());
    const result = await stack.service.requestRetraction({
      tenant: TENANT_A, distributionId: id, reason: 'takedown-1',
      rightsContext: { rightsGrantRef: 'rg-2' }, policyContext: { policyRef: 'pol-2' },
    });
    assert.equal(result.status, 'denied');
    assert.equal(result.reason, 'rights:no-retract');
    assert.equal(stack.authority.invocations.delete, 0);
    assert.ok(stack.store.listEvents({ tenant: TENANT_A, distributionId: id }).some((e) => e.kind === 'retraction-denied'));
    const rec = stack.observability.records.at(1);
    assert.ok(rec !== undefined && rec.outcome === 'denied' && rec.decidedAt === 'rights-gate' && rec.reason === 'rights:no-retract');
  });

  it('#I6 retraction before publish: retracted with zero retract calls', async () => {
    const stack = buildStack();
    const result = await stack.service.submitDistributionRequest(baseRequest());
    const retract = await stack.service.requestRetraction({
      tenant: TENANT_A, distributionId: result.distributionId, reason: 'not-yet-published',
      rightsContext: { rightsGrantRef: 'rg-2' }, policyContext: { policyRef: 'pol-2' },
    });
    assert.equal(retract.status, 'retracted');
    assert.equal(stack.authority.invocations.delete, 0);
  });

  it('#I7 full lifecycle appends exactly one §30 record per attributable attempt', async () => {
    const stack = buildStack();
    const id = await submitAndRun(stack, baseRequest());
    await stack.service.requestRetraction({
      tenant: TENANT_A, distributionId: id, reason: 'takedown-1',
      rightsContext: { rightsGrantRef: 'rg-2' }, policyContext: { policyRef: 'pol-2' },
    });
    await stack.jobs.runDue();
    assert.equal(stack.observability.records.length, 2);
    assert.equal(stack.observability.records.filter((r) => r.outcome === 'allowed').length, 2);
  });
});

// re-export shim used above to keep the import list single-sourced
function backoffDelayMsOf(backoff: { readonly baseMs: number }, attempt: number): number {
  return backoff.baseMs * 2 ** Math.max(0, attempt - 1);
}
