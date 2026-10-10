/**
 * PROD-001 compat battery (AC9): zero-drift pins over the REAL-authority
 * twins. Run: node --test compat/*.test.ts (from the package root).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  AuthorityTransportError,
  DEFAULT_PUBLISH_BACKOFF,
  DistributionRecordStore,
  InMemoryDistributionAuthority,
  InMemoryHealthAuthority,
  InMemoryIntegrationsDirectory,
  InMemoryJobsAuthority,
  InMemoryObservabilitySink,
  InMemoryPolicyGate,
  InMemoryRightsGate,
  ManualTimeSource,
  ProductionDistributionService,
  classifyAuthorityFailure,
} from '../dist/production/index.js';
import type {
  ArtifactVersionRef,
  DistributionRequest,
  HealthRestrictionObservation,
  JobState,
  ProviderTarget,
  RightsGateInput,
  TenantId,
} from '../dist/production/index.js';

import {
  DISTRIBUTION_AUTHORITY_SURFACE,
  GATE_DECISION_VOCAB,
  HEALTH_AUTHORITY_SURFACE,
  INTEGRATIONS_DIRECTORY_SURFACE,
  JOB_STATE_VOCAB,
  JOBS_QUEUE_SURFACE,
  JOBS_TWIN_ONLY_SURFACE,
  MAX_PORT_METHODS,
  OBSERVABILITY_RECORDER_SURFACE,
  POLICY_GATE_SURFACE,
  RIGHTS_GATE_SURFACE,
  TYPED_FAILURE_RETRYABILITY,
} from './authority-surfaces.ts';

const TENANT: TenantId = 'tenant-compat';

function methodNamesOf(instance: object): string[] {
  const proto: object = Object.getPrototypeOf(instance);
  const names: string[] = [];
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === 'constructor') continue;
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (desc !== undefined && typeof desc.value === 'function') names.push(name);
  }
  return names.sort();
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function compatStack(opts: {
  publishScript?: (input: never, call: number) => never;
} = {}): {
  service: ProductionDistributionService;
  authority: InMemoryDistributionAuthority;
  jobs: InMemoryJobsAuthority;
  time: ManualTimeSource;
} {
  const time = new ManualTimeSource(1_000_000);
  const authority = new InMemoryDistributionAuthority({ time, publishScript: opts.publishScript as never });
  const jobs = new InMemoryJobsAuthority({ time });
  const service = new ProductionDistributionService({
    rightsGate: new InMemoryRightsGate(),
    policyGate: new InMemoryPolicyGate(),
    authority,
    jobs,
    health: new InMemoryHealthAuthority(),
    integrations: new InMemoryIntegrationsDirectory([{
      providerId: 'prov-x', capability: 'social-publish', instanceId: 'inst-1',
      instanceVersion: '2.0.0', channelRef: 'chan-1', accountRef: 'acct-1',
    }]),
    observability: new InMemoryObservabilitySink(),
    store: new DistributionRecordStore(),
    time,
  });
  jobs.registerHandler('mos-distribution.production.publish', service.createPublishJobHandler());
  return { service, authority, jobs, time };
}

function compatRequest(overrides: Partial<DistributionRequest> = {}): DistributionRequest {
  const target: ProviderTarget = {
    capability: { providerId: 'prov-x', capability: 'social-publish', instanceId: 'inst-1', instanceVersion: '2.0.0', channelRef: 'chan-1', accountRef: 'acct-1' },
    credential: { credentialId: 'cred-ref-1' },
  };
  const artifact: ArtifactVersionRef = { kind: 'package', id: 'pkg-alpha', version: '1.2.3' };
  return {
    tenant: TENANT,
    artifactRefs: [artifact],
    targets: [target],
    schedule: { kind: 'immediate' },
    clientJobKey: 'compat-k-1',
    rightsContext: { rightsGrantRef: 'rg-1' },
    policyContext: { policyRef: 'pol-1' },
    observabilityTrail: { recordRefs: [] },
    ...overrides,
  };
}

describe('PROD-001 compat: authority surface zero-drift pins', () => {
  it('#K1 distribution authority twin surface matches the pinned SocialAdapterContract', () => {
    const authority = new InMemoryDistributionAuthority();
    assert.deepEqual(methodNamesOf(authority), sorted(DISTRIBUTION_AUTHORITY_SURFACE));
  });

  it('#K2 jobs twin exposes exactly the pinned JobQueuePort surface + disclosed twin-only methods', () => {
    const jobs = new InMemoryJobsAuthority();
    assert.deepEqual(methodNamesOf(jobs), sorted([...JOBS_QUEUE_SURFACE, ...JOBS_TWIN_ONLY_SURFACE]));
  });

  it('#K3 rights gate twin surface matches the pin', () => {
    assert.deepEqual(methodNamesOf(new InMemoryRightsGate()), sorted(RIGHTS_GATE_SURFACE));
  });

  it('#K4 policy gate twin surface matches the pin', () => {
    assert.deepEqual(methodNamesOf(new InMemoryPolicyGate()), sorted(POLICY_GATE_SURFACE));
  });

  it('#K5 health twin surface matches the pin', () => {
    assert.deepEqual(methodNamesOf(new InMemoryHealthAuthority()), sorted(HEALTH_AUTHORITY_SURFACE));
  });

  it('#K6 integrations directory twin surface matches the pin', () => {
    assert.deepEqual(methodNamesOf(new InMemoryIntegrationsDirectory()), sorted(INTEGRATIONS_DIRECTORY_SURFACE));
  });

  it('#K7 observability sink twin surface matches the pin', () => {
    assert.deepEqual(methodNamesOf(new InMemoryObservabilitySink()), sorted(OBSERVABILITY_RECORDER_SURFACE));
  });

  it('#K8 every port surface stays within MAX_PORT_METHODS', () => {
    for (const surface of [
      DISTRIBUTION_AUTHORITY_SURFACE, JOBS_QUEUE_SURFACE, RIGHTS_GATE_SURFACE,
      POLICY_GATE_SURFACE, HEALTH_AUTHORITY_SURFACE, INTEGRATIONS_DIRECTORY_SURFACE,
      OBSERVABILITY_RECORDER_SURFACE,
    ]) {
      assert.ok(surface.length <= MAX_PORT_METHODS, `port surface too large: ${surface.join(',')}`);
    }
  });

  it('#K9 service public method count stays within MAX_PORT_METHODS', () => {
    const { service } = compatStack();
    const methods = methodNamesOf(service);
    assert.ok(methods.length <= MAX_PORT_METHODS, `service has ${methods.length} methods: ${methods.join(',')}`);
  });

  it('#K10 gate decision vocabulary is exactly ALLOW | DENY', async () => {
    const input: RightsGateInput = {
      tenant: TENANT, artifactRefs: [], targets: [], rightsContext: { rightsGrantRef: 'rg' },
    };
    const allow = await new InMemoryRightsGate({ decision: 'ALLOW' }).evaluateRights(input);
    const deny = await new InMemoryRightsGate({ decision: 'DENY', reason: 'r' }).evaluateRights(input);
    const decisions = new Set<string>([allow.decision, deny.decision]);
    assert.deepEqual(sorted([...decisions]), sorted(GATE_DECISION_VOCAB));
  });

  it('#K11 job state vocabulary is exactly the six declared states (type + runtime)', async () => {
    // Type-level pin: this literal compiles only against the exact union.
    const typeLevel: readonly JobState[] = ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out'];
    assert.deepEqual(sorted(typeLevel), sorted(JOB_STATE_VOCAB));

    // Runtime reachability through the twin state machine.
    const seen = new Set<string>(['queued']);
    const { service, jobs, time } = compatStack();
    const okResult = await service.submitDistributionRequest(compatRequest());
    const realHandler = service.createPublishJobHandler();
    jobs.registerHandler('mos-distribution.production.publish', async (job) => {
      const handle = await jobs.getJob({ tenant: job.declaration.tenant, jobId: job.jobId });
      if (handle !== null) seen.add(handle.state);
      return realHandler(job);
    });
    await jobs.runDue();
    const after = await jobs.getJob({ tenant: TENANT, jobId: okResult.job?.jobId ?? '' });
    if (after !== null) seen.add(after.state);

    const failStack = compatStack({ publishScript: (): never => { throw new AuthorityTransportError('provider_rejected', 'x'); } });
    const failResult = await failStack.service.submitDistributionRequest(compatRequest({ clientJobKey: 'compat-k-fail' }));
    await failStack.jobs.runDue();
    const failed = await failStack.jobs.getJob({ tenant: TENANT, jobId: failResult.job?.jobId ?? '' });
    if (failed !== null) seen.add(failed.state);

    const timeoutStack = compatStack({ publishScript: (): never => { throw new AuthorityTransportError('timeout', 'x'); } });
    const timeoutResult = await timeoutStack.service.submitDistributionRequest(
      compatRequest({ clientJobKey: 'compat-k-timeout', backoffPolicy: { kind: 'exponential', baseMs: 1, maxAttempts: 1 } }),
    );
    await timeoutStack.jobs.runDue();
    timeoutStack.time.advance(10);
    const timed = await timeoutStack.jobs.getJob({ tenant: TENANT, jobId: timeoutResult.job?.jobId ?? '' });
    if (timed !== null) seen.add(timed.state);

    const cancelStack = compatStack();
    const cancelResult = await cancelStack.service.submitDistributionRequest(compatRequest({ clientJobKey: 'compat-k-cancel' }));
    const cancelled = await cancelStack.service.cancel({ tenant: TENANT, distributionId: cancelResult.distributionId });
    if (cancelled !== null) seen.add(cancelled.state);

    void time;
    assert.deepEqual(sorted([...seen]), sorted(JOB_STATE_VOCAB));
  });

  it('#K12 typed failure retryability matches the declared map', () => {
    const cases: readonly { error: unknown; kind: string }[] = [
      { error: new AuthorityTransportError('transport_error', 'x'), kind: 'transport_error' },
      { error: new AuthorityTransportError('provider_rejected', 'x'), kind: 'provider_rejected' },
      { error: new AuthorityTransportError('timeout', 'x'), kind: 'timeout' },
      { error: new AuthorityTransportError('teapot', 'x'), kind: 'unknown_failure' },
      { error: new Error('plain'), kind: 'unknown_failure' },
      { error: { failureKind: 'weird' }, kind: 'unknown_failure' },
    ];
    for (const c of cases) {
      const failure = classifyAuthorityFailure(c.error);
      assert.equal(failure.retryable, TYPED_FAILURE_RETRYABILITY[failure.kind]);
    }
  });

  it('#K13 DEFAULT_PUBLISH_BACKOFF is sane and frozen', () => {
    assert.ok(DEFAULT_PUBLISH_BACKOFF.baseMs > 0);
    assert.ok(DEFAULT_PUBLISH_BACKOFF.maxAttempts >= 1 && DEFAULT_PUBLISH_BACKOFF.maxAttempts <= 10);
    assert.throws(() => {
      (DEFAULT_PUBLISH_BACKOFF as unknown as { baseMs: number }).baseMs = 1;
    }, TypeError);
  });

  it('#K14 authority publish result carries exactly the pinned locator fields', async () => {
    const { service, authority, jobs } = compatStack();
    const result = await service.submitDistributionRequest(compatRequest());
    await jobs.runDue();
    assert.equal(authority.publishLog.length, 1);
    const events = service.listEvents({ tenant: TENANT, distributionId: result.distributionId });
    const refs = events.find((e) => e.kind === 'publish-succeeded')?.observationRefs;
    assert.ok(refs !== undefined && refs.length === 1);
    assert.deepEqual(
      Object.keys(refs[0]).sort(),
      ['authorityModule', 'observationId', 'providerId', 'recordedAt'],
    );
  });

  it('#K15 authority observations remain payload-bearing at the authority (parity)', async () => {
    const { service, authority, jobs } = compatStack();
    const result = await service.submitDistributionRequest(compatRequest());
    await jobs.runDue();
    const refs = await service.readObservationRefs({ tenant: TENANT, distributionId: result.distributionId });
    const obs = await authority.readObservations({ tenant: TENANT, observationIds: [refs.at(0)?.observationId ?? ''] });
    const first = obs.at(0);
    assert.ok(first !== undefined);
    assert.deepEqual(
      Object.keys(first).sort(),
      ['observationId', 'platformPostRef', 'platformSaid', 'providerId', 'recordedAt', 'sourceAttribution'],
    );
    assert.ok(first.sourceAttribution.length > 0);
  });

  it('#K16 authority restriction states stay within the declared vocabulary', async () => {
    const authority = new InMemoryDistributionAuthority({
      restrictions: [
        { restrictionId: 'pr-1', providerId: 'prov-x', channelRef: 'chan-1', state: 'active', description: 'd' },
        { restrictionId: 'pr-2', providerId: 'prov-x', state: 'inactive', description: 'd' },
      ],
    });
    const restrictions = await authority.listRestrictions({ tenant: TENANT, providerIds: ['prov-x'] });
    for (const r of restrictions) {
      assert.ok(r.state === 'active' || r.state === 'inactive');
    }
  });

  it('#K17 publish inputs through the port carry CredentialRef handles only', async () => {
    const { service, authority, jobs } = compatStack();
    await service.submitDistributionRequest(compatRequest());
    await jobs.runDue();
    const json = JSON.stringify(authority.publishLog);
    assert.ok(json.includes('"credentialId"'));
    for (const banned of ['"secret"', '"token"', '"password"', '"apiKey"', '"media"', '"bytes"']) {
      assert.ok(!json.includes(banned), `forbidden key leaked into transport input: ${banned}`);
    }
  });

  it('#K18 health statuses pass through verbatim (UNKNOWN preserved at the boundary)', async () => {
    const time = new ManualTimeSource(1_000_000);
    const health = new InMemoryHealthAuthority([
      { restrictionId: 'r-1', providerId: 'prov-x', status: 'PROBATION', observedAt: '2025-01-01T00:00:00.000Z' } satisfies HealthRestrictionObservation,
    ]);
    const service = new ProductionDistributionService({
      rightsGate: new InMemoryRightsGate(),
      policyGate: new InMemoryPolicyGate(),
      authority: new InMemoryDistributionAuthority({ time }),
      jobs: new InMemoryJobsAuthority({ time }),
      health,
      integrations: new InMemoryIntegrationsDirectory([{
        providerId: 'prov-x', capability: 'social-publish', instanceId: 'inst-1',
        instanceVersion: '2.0.0', channelRef: 'chan-1', accountRef: 'acct-1',
      }]),
      observability: new InMemoryObservabilitySink(),
      store: new DistributionRecordStore(),
      time,
    });
    const result = await service.submitDistributionRequest(compatRequest());
    const ctx = result.plan.healthContextConsulted;
    assert.ok(ctx !== undefined);
    assert.equal(ctx.restrictions.at(0)?.status, 'PROBATION');
    assert.equal(result.plan.exclusions.length, 0);
  });
});
