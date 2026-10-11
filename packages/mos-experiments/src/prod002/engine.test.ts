import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryExperimentStore,
  MemoryJobQueue,
  MemoryLearningSink,
  MemoryRightsGate,
  MemoryTrailSink,
  StaticAuthorityVersions,
  createExperimentEngine,
  err,
  failure,
  validateTenantId,
} from './index.js';
import type {
  AuthorityVersionResolver,
  AuthorityVersions,
  Clock,
  ExperimentEngine,
  Failure,
  IdGenerator,
  LearningRecord,
  Result,
  TenantId,
  TrailEvent,
} from './index.js';

const tenantOk = validateTenantId('acme');
if (!tenantOk.ok) assert.fail('fixture tenant must validate');
const tenant: TenantId = tenantOk.value;

class ManualClock implements Clock {
  current: string;
  constructor(current: string) {
    this.current = current;
  }
  now(): string {
    return this.current;
  }
}

function sequentialIds(): IdGenerator {
  let counter = 0;
  return { nextId: (prefix: string): string => `${prefix}-${(counter += 1)}` };
}

const VERSIONS: AuthorityVersions = {
  missionsModuleVersion: '1.0.0',
  productionModuleVersion: '1.5.0',
  distributionBindingId: 'binding-1',
  distributionBindingVersion: '2.0.0',
};

interface Deps {
  readonly engine: ExperimentEngine;
  readonly store: MemoryExperimentStore;
  readonly trail: MemoryTrailSink;
  readonly rights: MemoryRightsGate;
  readonly jobs: MemoryJobQueue;
  readonly learning: MemoryLearningSink;
  readonly clock: ManualClock;
}

function makeEngine(overrides: {
  rights?: MemoryRightsGate;
  versions?: AuthorityVersionResolver;
  trail?: MemoryTrailSink;
  store?: MemoryExperimentStore;
  jobs?: MemoryJobQueue;
  learning?: MemoryLearningSink;
} = {}): Deps {
  const store = overrides.store ?? new MemoryExperimentStore();
  const trail = overrides.trail ?? new MemoryTrailSink();
  const rights = overrides.rights ?? new MemoryRightsGate([]);
  const jobs = overrides.jobs ?? new MemoryJobQueue();
  const learning = overrides.learning ?? new MemoryLearningSink();
  const clock = new ManualClock('2026-01-01T00:00:00Z');
  const engine = createExperimentEngine({
    store,
    trail,
    rights,
    jobs,
    learningSink: learning,
    authorityVersions: overrides.versions ?? new StaticAuthorityVersions(VERSIONS),
    clock,
    ids: sequentialIds(),
  });
  return { engine, store, trail, rights, jobs, learning, clock };
}

interface PlanOptions {
  readonly prediction?: boolean;
}

function plan(options: PlanOptions = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    hypothesis: 'engagement lift under variant B',
    missionRef: { missionId: 'mission-1' },
    productionRequestRef: { requestId: 'req-1' },
    distributionRef: { bindingId: 'binding-1' },
    metrics: [
      { metricKey: 'social.engagement', formulaRef: 'proportion.wilson@1', confidenceLevel: 0.95, family: 'social', metricKeyFilter: 'social.engagement' },
      { metricKey: 'health.non-healthy', formulaRef: 'health.non-healthy-incidence.wilson@1', confidenceLevel: 0.95, family: 'platform-health', restrictions: 'both-stratified' },
    ],
    collectionWindow: { startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-02T00:00:00Z', maxObservations: 10 },
  };
  if (options.prediction !== false) {
    base['labCandidate'] = {
      labCandidateId: 'lab-1',
      labModuleVersion: '0.4.0',
      predictedAt: '2025-12-30T00:00:00Z',
      points: [
        { metricKey: 'social.engagement', point: 0.62, lower: 0.5, upper: 0.75 },
        { metricKey: 'health.non-healthy', stratum: 'provider-CONFIRMED', point: 0.1 },
        { metricKey: 'health.non-healthy', stratum: 'SUSPECTED', point: 0.05 },
      ],
    };
  }
  return base;
}

function obs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    observationId: 'obs-x',
    source: 'platform-said',
    saidAt: '2026-01-01T06:00:00Z',
    collectedAt: '2026-01-01T06:00:05Z',
    attribution: { distributionBindingId: 'binding-1', distributionBindingVersion: '2.0.0', saidBy: 'platform', channel: 'production-binding' },
    degradationFlag: false,
    outOfDistributionFlag: false,
    payload: { family: 'social', metricKey: 'social.engagement', trials: 10, successes: 8 },
    ...overrides,
  };
}

const STANDARD_OBS: readonly Record<string, unknown>[] = [
  obs({ observationId: 's1', payload: { family: 'social', metricKey: 'social.engagement', trials: 10, successes: 8 } }),
  obs({ observationId: 's2', payload: { family: 'social', metricKey: 'social.engagement', trials: 15, successes: 9 } }),
  obs({ observationId: 'h1', payload: { family: 'platform-health', provider: 'prov-a', status: 'degraded', restriction: 'provider-CONFIRMED' } }),
  obs({ observationId: 'h2', payload: { family: 'platform-health', provider: 'prov-a', status: 'healthy', restriction: 'SUSPECTED' } }),
];

function stage(
  h: Deps,
  access: { readonly actor: string; readonly tenantId: string },
  upto: 'proposed' | 'running' | 'collecting' | 'measured' | 'learned',
  planOverride?: Record<string, unknown>,
): string {
  const p = h.engine.propose(access, planOverride ?? plan());
  if (!p.ok) throw new Error(`stage propose failed: ${p.error.code}`);
  const id = p.value.experimentId;
  if (upto === 'proposed') return id;
  const s = h.engine.start(access, id);
  if (!s.ok) throw new Error(`stage start failed: ${s.error.code}`);
  if (upto === 'running') return id;
  const c = h.engine.beginCollection(access, id);
  if (!c.ok) throw new Error(`stage collect failed: ${c.error.code}`);
  if (upto === 'collecting') return id;
  for (const raw of STANDARD_OBS) {
    const ing = h.engine.ingestObservation(access, id, raw);
    if (!ing.ok) throw new Error(`stage ingest failed: ${ing.error.code}`);
  }
  h.clock.current = '2026-01-03T00:00:00Z';
  const m = h.engine.markMeasured(access, id);
  if (!m.ok) throw new Error(`stage measure failed: ${m.error.code}`);
  if (upto === 'measured') return id;
  const l = h.engine.publishLearning(access, id);
  if (!l.ok) throw new Error(`stage learn failed: ${l.error.code}`);
  return id;
}

function expectFail<T>(result: Result<T, Failure>, code: string): Failure {
  if (result.ok) assert.fail(`expected failure '${code}' but the operation succeeded`);
  assert.equal(result.error.code, code);
  return result.error;
}

const ACCESS = { actor: 'operator', tenantId: 'acme' } as const;

test('full lifecycle rides the durable path: proposed -> running -> collecting -> measured -> learned', () => {
  const h = makeEngine();
  const proposed = h.engine.propose(ACCESS, plan());
  if (!proposed.ok) assert.fail(`propose failed: ${proposed.error.code}`);
  assert.equal(proposed.value.phase, 'proposed');
  assert.equal(proposed.value.tenantId, tenant);
  const id = proposed.value.experimentId;

  const started = h.engine.start(ACCESS, id);
  if (!started.ok) assert.fail(`start failed: ${started.error.code}`);
  assert.equal(started.value.phase, 'running');
  assert.equal(started.value.jobId, 'job-1');
  assert.ok(started.value.chain !== null);

  const collecting = h.engine.beginCollection(ACCESS, id);
  if (!collecting.ok) assert.fail(`collect failed: ${collecting.error.code}`);
  assert.equal(collecting.value.phase, 'collecting');

  for (const raw of STANDARD_OBS) {
    const ing = h.engine.ingestObservation(ACCESS, id, raw);
    if (!ing.ok) assert.fail(`ingest failed: ${ing.error.code}`);
  }
  const midCollect = h.engine.get(ACCESS, id);
  if (!midCollect.ok) assert.fail('get failed');
  assert.equal(midCollect.value.observations.length, 4);

  h.clock.current = '2026-01-01T12:00:00Z';
  expectFail(h.engine.markMeasured(ACCESS, id), 'E_COLLECTION_WINDOW_OPEN');

  h.clock.current = '2026-01-03T00:00:00Z';
  const measured = h.engine.markMeasured(ACCESS, id);
  if (!measured.ok) assert.fail(`measure failed: ${measured.error.code}`);
  assert.equal(measured.value.phase, 'measured');
  assert.equal(measured.value.evidence?.outcomes.length, 3);
  assert.equal(measured.value.evidence?.totalObservations, 4);
  assert.match(measured.value.observationSet?.digest ?? '', /^[0-9a-f]{64}$/);

  const learned = h.engine.publishLearning(ACCESS, id);
  if (!learned.ok) assert.fail(`learn failed: ${learned.error.code}`);
  assert.equal(learned.value.phase, 'learned');
  assert.equal(learned.value.learning?.learningRecordId, h.learning.records[0]?.learningRecordId);
  assert.equal(h.jobs.jobs[0]?.status, 'completed');
  assert.equal(h.jobs.jobs[0]?.outcome?.['learningRecordId'], h.learning.records[0]?.learningRecordId);
  assert.equal(h.learning.records.length, 1);
});

test('the §24 chain cites exact authority versions end-to-end into the learning record', () => {
  const h = makeEngine();
  const id = stage(h, ACCESS, 'learned');
  const record = h.engine.get(ACCESS, id);
  if (!record.ok) assert.fail('get failed');
  const chain = record.value.chain;
  assert.ok(chain !== null);
  assert.deepEqual(chain.citations, {
    missionRef: { missionId: 'mission-1', moduleVersion: '1.0.0' },
    productionRequestRef: { requestId: 'req-1', moduleVersion: '1.5.0' },
    distributionRef: { bindingId: 'binding-1', bindingVersion: '2.0.0' },
  });
  const published: LearningRecord = h.learning.records[0]!;
  assert.deepEqual(published.chain, chain);
  assert.equal(published.experimentId, id);
  assert.equal(published.tenantId, tenant);
});

test('the §30 trail records the full sequence with authority attributions', () => {
  const h = makeEngine();
  stage(h, ACCESS, 'learned');
  const kinds: TrailEvent['kind'][] = h.trail.events.map((event) => event.kind);
  assert.deepEqual(kinds, [
    'experiment:proposed',
    'job:enqueued',
    'experiment:started',
    'collection:opened',
    'observation:ingested',
    'observation:ingested',
    'observation:ingested',
    'observation:ingested',
    'evidence:measured',
    'learning:published',
    'job:completed',
  ]);
  const jobEnqueued = h.trail.events.find((event) => event.kind === 'job:enqueued');
  assert.equal(jobEnqueued?.attribution?.authority, '@mos/jobs');
  assert.equal(jobEnqueued?.attribution?.said, 'job-enqueued:job-1');
  const ingested = h.trail.events.find((event) => event.kind === 'observation:ingested');
  assert.equal(ingested?.attribution?.authority, '@mos/distribution');
  assert.equal(ingested?.attribution?.said, 'platform:production-binding');
  const learnedEvent = h.trail.events.find((event) => event.kind === 'learning:published');
  assert.equal(learnedEvent?.attribution?.authority, '@mos/experiments');
  assert.ok(learnedEvent?.attribution?.said.startsWith('learning-published:'));
  const jobCompleted = h.trail.events.find((event) => event.kind === 'job:completed');
  assert.equal(jobCompleted?.attribution?.said, 'job-completed:job-1');
});

test('start rejects an unresolvable citation with E_CITATION_UNRESOLVED and stays proposed', () => {
  const h = makeEngine();
  const mismatchedPlan = { ...plan(), distributionRef: { bindingId: 'binding-9' } };
  const proposed = h.engine.propose(ACCESS, mismatchedPlan);
  if (!proposed.ok) assert.fail(`propose failed: ${proposed.error.code}`);
  const id = proposed.value.experimentId;
  const failure = expectFail(h.engine.start(ACCESS, id), 'E_CITATION_UNRESOLVED');
  assert.equal(failure.details.citedBindingId, 'binding-9');
  assert.equal(failure.details.liveBindingId, 'binding-1');
  const record = h.engine.get(ACCESS, id);
  if (!record.ok) assert.fail('get failed');
  assert.equal(record.value.phase, 'proposed');
  assert.equal(record.value.chain, null);
  assert.equal(record.value.jobId, null);
});

test('an authority resolver outage surfaces as E_AUTHORITY_VERSION_UNAVAILABLE', () => {
  const failingResolver: AuthorityVersionResolver = {
    resolve: () => err(failure('E_STORE_FAILED', 'resolver outage')),
  };
  const h = makeEngine({ versions: failingResolver });
  const id = stage(h, ACCESS, 'proposed');
  const error = expectFail(h.engine.start(ACCESS, id), 'E_AUTHORITY_VERSION_UNAVAILABLE');
  const resolverFailure = error.details.resolverFailure as { code?: string } | undefined;
  assert.equal(resolverFailure?.code, 'E_STORE_FAILED');
});

test('incomplete authority versions are refused with the missing list', () => {
  const h = makeEngine({ versions: new StaticAuthorityVersions({ ...VERSIONS, missionsModuleVersion: '' }) });
  const id = stage(h, ACCESS, 'proposed');
  const error = expectFail(h.engine.start(ACCESS, id), 'E_AUTHORITY_VERSION_UNAVAILABLE');
  assert.deepEqual(error.details.missing, ['missionsModuleVersion']);
});

test('invalid transitions are typed failures (the state machine holds)', () => {
  const hRun = makeEngine();
  const idRun = stage(hRun, ACCESS, 'running');
  expectFail(hRun.engine.ingestObservation(ACCESS, idRun, obs()), 'E_WRONG_STATE');
  expectFail(hRun.engine.markMeasured(ACCESS, idRun), 'E_INVALID_TRANSITION');
  expectFail(hRun.engine.publishLearning(ACCESS, idRun), 'E_INVALID_TRANSITION');

  const hCol = makeEngine();
  const idCol = stage(hCol, ACCESS, 'collecting');
  hCol.clock.current = '2026-01-03T00:00:00Z';
  expectFail(hCol.engine.start(ACCESS, idCol), 'E_INVALID_TRANSITION');
  expectFail(hCol.engine.beginCollection(ACCESS, idCol), 'E_INVALID_TRANSITION');
  expectFail(hCol.engine.publishLearning(ACCESS, idCol), 'E_INVALID_TRANSITION');

  const hDone = makeEngine();
  const idDone = stage(hDone, ACCESS, 'learned');
  expectFail(hDone.engine.abort(ACCESS, idDone, 'late'), 'E_INVALID_TRANSITION');
  expectFail(hDone.engine.markMeasured(ACCESS, idDone), 'E_INVALID_TRANSITION');
  expectFail(hDone.engine.beginCollection(ACCESS, idDone), 'E_INVALID_TRANSITION');
});

test('off-discipline observations are rejected and trailed (duplicate, simulated, off-chain, out-of-window)', () => {
  const h = makeEngine();
  const id = stage(h, ACCESS, 'collecting');
  const first = h.engine.ingestObservation(ACCESS, id, STANDARD_OBS[0]);
  if (!first.ok) assert.fail(`ingest failed: ${first.error.code}`);
  expectFail(h.engine.ingestObservation(ACCESS, id, STANDARD_OBS[0]), 'E_DUPLICATE_OBSERVATION');
  expectFail(h.engine.ingestObservation(ACCESS, id, obs({ observationId: 'sim-1', source: 'simulated' })), 'E_NON_PLATFORM_SAID_SOURCE');
  expectFail(
    h.engine.ingestObservation(
      ACCESS,
      id,
      obs({ observationId: 'off-1', attribution: { distributionBindingId: 'binding-2', distributionBindingVersion: '2.0.0', saidBy: 'platform', channel: 'production-binding' } }),
    ),
    'E_ATTRIBUTION_BINDING_MISMATCH',
  );
  expectFail(
    h.engine.ingestObservation(ACCESS, id, obs({ observationId: 'late-1', saidAt: '2026-01-05T00:00:00Z', collectedAt: '2026-01-05T00:00:05Z' })),
    'E_OBSERVATION_OUTSIDE_WINDOW',
  );
  const record = h.engine.get(ACCESS, id);
  if (!record.ok) assert.fail('get failed');
  assert.equal(record.value.observations.length, 1);
  const rejected = h.trail.events.filter((event) => event.kind === 'observation:rejected');
  assert.equal(rejected.length, 4);
  assert.ok(rejected.every((event) => event.subject === `experiment:${id}`));
});

test('abort mid-flight fails the durable job and trails both events', () => {
  const h = makeEngine();
  const id = stage(h, ACCESS, 'collecting');
  const aborted = h.engine.abort(ACCESS, id, 'funding withdrawn');
  if (!aborted.ok) assert.fail(`abort failed: ${aborted.error.code}`);
  assert.equal(aborted.value.phase, 'aborted');
  assert.equal(aborted.value.abortReason, 'funding withdrawn');
  assert.equal(h.jobs.jobs[0]?.status, 'failed');
  assert.equal(h.jobs.jobs[0]?.failReason, 'funding withdrawn');
  assert.ok(h.trail.events.some((event) => event.kind === 'job:failed'));
  assert.ok(h.trail.events.some((event) => event.kind === 'experiment:aborted'));
  expectFail(h.engine.abort(ACCESS, id, 'again'), 'E_INVALID_TRANSITION');
  expectFail(h.engine.abort(ACCESS, id, '   '), 'E_ABORT_REASON_REQUIRED');
});

test('abort before start leaves no durable job events', () => {
  const h = makeEngine();
  const id = stage(h, ACCESS, 'proposed');
  const aborted = h.engine.abort(ACCESS, id, 'never started');
  if (!aborted.ok) assert.fail(`abort failed: ${aborted.error.code}`);
  assert.equal(aborted.value.phase, 'aborted');
  assert.equal(aborted.value.jobId, null);
  assert.ok(h.trail.events.every((event) => !event.kind.startsWith('job:')));
});

test('cross-tenant read is rights-gated with verbatim attribution, then permitted when allowed', () => {
  const h = makeEngine();
  const id = stage(h, ACCESS, 'proposed');
  const foreign = { actor: 'auditor', tenantId: 'other-co' } as const;
  const denied = expectFail(h.engine.get(foreign, id), 'E_RIGHTS_DENIED');
  const verbatim = denied.details.verbatim as string;
  assert.ok(verbatim.includes('@mos/rights said:'), `verbatim: ${verbatim}`);
  const deniedEvent = h.trail.events.find((event) => event.kind === 'rights:denied');
  assert.ok(deniedEvent !== undefined);
  assert.equal(deniedEvent.attribution?.authority, '@mos/rights');
  assert.equal(deniedEvent.attribution?.said, verbatim);

  const hAllowed = makeEngine({
    rights: new MemoryRightsGate([{ actors: ['auditor'], actions: ['read'], allow: true }]),
  });
  const idAllowed = stage(hAllowed, ACCESS, 'proposed');
  const read = hAllowed.engine.get(foreign, idAllowed);
  if (!read.ok) assert.fail(`expected ok, got ${read.error.code}`);
  assert.equal(read.value.tenantId, tenant);
});

test('list is tenant-scoped and cross-tenant listing is gated', () => {
  const h = makeEngine();
  stage(h, ACCESS, 'proposed');
  const own = h.engine.list(ACCESS);
  if (!own.ok) assert.fail('list failed');
  assert.equal(own.value.length, 1);
  assert.equal(own.value[0]?.tenantId, tenant);
  expectFail(h.engine.list(ACCESS, 'other-co'), 'E_RIGHTS_DENIED');

  const hAllowed = makeEngine({
    rights: new MemoryRightsGate([{ actors: ['operator'], actions: ['list'], targetTenants: ['other-co'], allow: true }]),
  });
  const otherAccess = { actor: 'operator', tenantId: 'other-co' } as const;
  stage(hAllowed, otherAccess, 'proposed');
  const cross = hAllowed.engine.list(ACCESS, 'other-co');
  if (!cross.ok) assert.fail(`expected ok, got ${cross.error.code}`);
  assert.equal(cross.value.length, 1);
  assert.equal(cross.value[0]?.tenantId, 'other-co');
});

test('a trail port failure aborts the operation with no record persisted', () => {
  const h = makeEngine({ trail: new MemoryTrailSink({ failNext: 1 }) });
  expectFail(h.engine.propose(ACCESS, plan()), 'E_TRAIL_FAILED');
  const listing = h.engine.list(ACCESS);
  if (!listing.ok) assert.fail('list failed');
  assert.equal(listing.value.length, 0);
});

test('a store port failure surfaces as E_STORE_FAILED', () => {
  const h = makeEngine({ store: new MemoryExperimentStore({ failNext: 1 }) });
  expectFail(h.engine.propose(ACCESS, plan()), 'E_STORE_FAILED');
});

test('a jobs enqueue failure leaves the experiment proposed (retryable start)', () => {
  const h = makeEngine({ jobs: new MemoryJobQueue({ failNext: 1 }) });
  const id = stage(h, ACCESS, 'proposed');
  expectFail(h.engine.start(ACCESS, id), 'E_JOB_ENQUEUE_FAILED');
  const record = h.engine.get(ACCESS, id);
  if (!record.ok) assert.fail('get failed');
  assert.equal(record.value.phase, 'proposed');
  assert.equal(record.value.jobId, null);
});

test('a learning sink failure leaves the experiment measured (retryable publish)', () => {
  const h = makeEngine({ learning: new MemoryLearningSink({ failNext: 1 }) });
  const id = stage(h, ACCESS, 'measured');
  expectFail(h.engine.publishLearning(ACCESS, id), 'E_LEARNING_PUBLISH_FAILED');
  const record = h.engine.get(ACCESS, id);
  if (!record.ok) assert.fail('get failed');
  assert.equal(record.value.phase, 'measured');
  assert.equal(h.jobs.jobs[0]?.status, 'queued');
  assert.equal(h.learning.records.length, 0);
});

test('the published learning record is measured-channel with exact prediction errors', () => {
  const h = makeEngine();
  stage(h, ACCESS, 'learned');
  const published: LearningRecord = h.learning.records[0]!;
  assert.equal(published.channel, 'measured');
  assert.match(published.evidenceDigest, /^[0-9a-f]{64}$/);
  assert.equal(published.predictionErrors.length, 3);
  assert.equal(published.citedPrediction.labCandidateId, 'lab-1');
  for (const outcome of published.outcomes) {
    assert.equal(outcome.channel, 'measured');
  }
  const engagement = published.predictionErrors.find((e) => e.metricKey === 'social.engagement');
  assert.ok(engagement !== undefined);
  assert.ok(Math.abs(engagement.errorPoint - 0.06) < 1e-9, `errorPoint ${engagement.errorPoint}`);
  const confirmed = published.predictionErrors.find((e) => e.stratum === 'provider-CONFIRMED');
  assert.ok(confirmed !== undefined);
  assert.ok(Math.abs(confirmed.errorPoint - 0.9) < 1e-9);
  const suspected = published.predictionErrors.find((e) => e.stratum === 'SUSPECTED');
  assert.ok(suspected !== undefined);
  assert.ok(Math.abs(suspected.errorPoint - -0.05) < 1e-9);
});

test('publishLearning without a cited Lab prediction is a typed failure', () => {
  const h = makeEngine();
  const id = stage(h, ACCESS, 'measured', plan({ prediction: false }));
  expectFail(h.engine.publishLearning(ACCESS, id), 'E_LEARNING_MISSING_PREDICTION');
});

test('malformed access, plan, and unknown-experiment inputs are typed failures', () => {
  const h = makeEngine();
  expectFail(h.engine.get(ACCESS, 'missing'), 'E_EXPERIMENT_NOT_FOUND');
  expectFail(h.engine.get({ actor: 'operator', tenantId: 'ACME' }, 'missing'), 'E_INVALID_TENANT_ID');
  expectFail(h.engine.propose(ACCESS, 'not-a-plan'), 'E_PLAN_INVALID');
  expectFail(h.engine.propose(ACCESS, { ...plan(), hypothesis: '' }), 'E_PLAN_INVALID');
  expectFail(
    h.engine.propose(ACCESS, { ...plan(), collectionWindow: { startsAt: '2026-01-02T00:00:00Z', endsAt: '2026-01-02T00:00:00Z', maxObservations: 10 } }),
    'E_PLAN_INVALID',
  );
  expectFail(
    h.engine.propose(ACCESS, { ...plan(), metrics: [{ metricKey: 'm', formulaRef: '', confidenceLevel: 0.95, family: 'social' }] }),
    'E_PLAN_INVALID',
  );
  const noActor = h.engine.propose({ actor: '', tenantId: 'acme' }, plan());
  expectFail(noActor, 'E_INVALID_TENANT_ID');
});
