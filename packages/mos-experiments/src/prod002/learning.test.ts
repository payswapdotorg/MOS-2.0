import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLearningRecord,
  buildObservationSet,
  computeEvidence,
  toPlatformSaidObservation,
  validateTenantId,
} from './index.js';
import type {
  CitedPrediction,
  Failure,
  IdGenerator,
  MeasuredEvidence,
  ObservationExpectation,
  PlatformSaidObservation,
  ResolvedChain,
  Result,
  TenantId,
} from './index.js';

const tenantOk = validateTenantId('acme');
if (!tenantOk.ok) assert.fail('fixture tenant must validate');
const tenant: TenantId = tenantOk.value;
const ids: IdGenerator = { nextId: () => 'learn-1' };

function expectation(): ObservationExpectation {
  return {
    experimentId: 'exp-1',
    tenantId: tenant,
    distributionBindingId: 'binding-1',
    distributionBindingVersion: '2.0.0',
    window: { startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-02T00:00:00Z', maxObservations: 20 },
  };
}

function observation(overrides: Record<string, unknown>): PlatformSaidObservation {
  const input = {
    observationId: 'obs-x',
    saidAt: '2026-01-01T06:00:00Z',
    collectedAt: '2026-01-01T06:00:05Z',
    attribution: { distributionBindingId: 'binding-1', distributionBindingVersion: '2.0.0', saidBy: 'platform', channel: 'production-binding' },
    degradationFlag: false,
    outOfDistributionFlag: false,
    ...overrides,
  };
  const stamped = toPlatformSaidObservation(input, tenant);
  if (!stamped.ok) assert.fail(`fixture stamp failed: ${stamped.error.code}`);
  return stamped.value;
}

interface FixtureOptions {
  readonly degradeS1?: boolean;
  readonly oodH1?: boolean;
  readonly s2Successes?: number;
}

function fixtureObservations(options: FixtureOptions = {}): PlatformSaidObservation[] {
  return [
    observation({
      observationId: 's1',
      degradationFlag: options.degradeS1 === true,
      payload: { family: 'social', metricKey: 'social.engagement', trials: 10, successes: 8 },
    }),
    observation({
      observationId: 's2',
      payload: { family: 'social', metricKey: 'social.engagement', trials: 15, successes: options.s2Successes ?? 9 },
    }),
    observation({ observationId: 'm1', payload: { family: 'measure', metricKey: 'latency.ms', values: [1, 2, 3] } }),
    observation({ observationId: 'm2', payload: { family: 'measure', metricKey: 'latency.ms', values: [4, 5] } }),
    observation({
      observationId: 'h1',
      outOfDistributionFlag: options.oodH1 === true,
      payload: { family: 'platform-health', provider: 'prov-a', status: 'degraded', restriction: 'provider-CONFIRMED' },
    }),
    observation({ observationId: 'h2', payload: { family: 'platform-health', provider: 'prov-a', status: 'healthy', restriction: 'SUSPECTED' } }),
  ];
}

function buildEvidence(options: FixtureOptions = {}): MeasuredEvidence {
  const sealed = buildObservationSet(expectation(), fixtureObservations(options), ids);
  if (!sealed.ok) assert.fail(`fixture seal failed: ${sealed.error.code}`);
  const evidence = computeEvidence({
    observationSet: sealed.value,
    specs: [
      { metricKey: 'social.engagement', formulaRef: 'proportion.wilson@1', confidenceLevel: 0.95, family: 'social', metricKeyFilter: 'social.engagement' },
      { metricKey: 'health.non-healthy', formulaRef: 'health.non-healthy-incidence.wilson@1', confidenceLevel: 0.95, family: 'platform-health', restrictions: 'both-stratified' },
    ],
    evidenceId: 'evidence-1',
    computedAt: '2026-01-03T00:00:00Z',
  });
  if (!evidence.ok) assert.fail(`fixture evidence failed: ${evidence.error.code}`);
  return evidence.value;
}

const CHAIN: ResolvedChain = {
  resolvedAt: '2026-01-01T00:00:00Z',
  missionsModuleVersion: '1.0.0',
  productionModuleVersion: '1.5.0',
  distributionBindingVersion: '2.0.0',
  citations: {
    missionRef: { missionId: 'mission-1', moduleVersion: '1.0.0' },
    productionRequestRef: { requestId: 'req-1', moduleVersion: '1.5.0' },
    distributionRef: { bindingId: 'binding-1', bindingVersion: '2.0.0' },
  },
};

const PREDICTION: CitedPrediction = {
  labCandidateId: 'lab-1',
  labModuleVersion: '0.4.0',
  predictedAt: '2025-12-30T00:00:00Z',
  points: [
    { metricKey: 'social.engagement', point: 0.62, lower: 0.5, upper: 0.75 },
    { metricKey: 'health.non-healthy', stratum: 'provider-CONFIRMED', point: 0.1 },
    { metricKey: 'health.non-healthy', stratum: 'SUSPECTED', point: 0.05 },
  ],
};

function build(evidence: MeasuredEvidence, prediction: CitedPrediction) {
  return buildLearningRecord({
    experimentId: 'exp-1',
    tenantId: tenant,
    citedPrediction: prediction,
    evidence,
    chain: CHAIN,
    publishedAt: '2026-01-04T00:00:00Z',
    ids,
  });
}

function expectFail<T>(result: Result<T, Failure>, code: string): Failure {
  if (result.ok) assert.fail(`expected failure '${code}' but the operation succeeded`);
  assert.equal(result.error.code, code);
  return result.error;
}

test('the learning record carries prediction errors with verbatim citation and chain passthrough', () => {
  const record = build(buildEvidence(), PREDICTION);
  if (!record.ok) assert.fail(`expected ok, got ${record.error.code}`);
  assert.equal(record.value.channel, 'measured');
  assert.equal(record.value.learningRecordId, 'learn-1');
  assert.equal(record.value.experimentId, 'exp-1');
  assert.equal(record.value.tenantId, tenant);
  assert.equal(record.value.predictionErrors.length, 3);
  assert.deepEqual(record.value.citedPrediction, PREDICTION);
  assert.deepEqual(record.value.chain, CHAIN);
  for (const outcome of record.value.outcomes) {
    assert.equal(outcome.channel, 'measured');
  }
  const engagement = record.value.predictionErrors.find((e) => e.metricKey === 'social.engagement');
  assert.ok(engagement !== undefined);
  assert.ok(Math.abs(engagement.errorPoint - 0.06) < 1e-9, `errorPoint ${engagement.errorPoint}`);
  assert.ok(Math.abs(engagement.absError - 0.06) < 1e-9);
  assert.deepEqual(engagement.predictedInterval, { lower: 0.5, upper: 0.75 });
  assert.equal(engagement.formulaRef, 'proportion.wilson@1');
  assert.equal(engagement.sampleSize, 25);
  assert.ok(engagement.measuredLower < engagement.measuredPoint && engagement.measuredPoint < engagement.measuredUpper);
  const confirmed = record.value.predictionErrors.find((e) => e.stratum === 'provider-CONFIRMED');
  assert.ok(confirmed !== undefined);
  assert.ok(Math.abs(confirmed.errorPoint - 0.9) < 1e-9);
  assert.equal(confirmed.predictedInterval, null);
  const suspected = record.value.predictionErrors.find((e) => e.stratum === 'SUSPECTED');
  assert.ok(suspected !== undefined);
  assert.ok(Math.abs(suspected.errorPoint - -0.05) < 1e-9);
  assert.ok(Math.abs(suspected.absError - 0.05) < 1e-9);
  assert.ok(Math.abs(suspected.measuredPoint - 0) < 1e-12);
});

test('PIN: the learning channel rejects a counterfactual-flagged outcome', () => {
  const evidence = buildEvidence();
  const counterfeit = {
    ...evidence,
    outcomes: [{ ...evidence.outcomes[0], channel: 'counterfactual' }],
  } as unknown as MeasuredEvidence;
  const failure = expectFail(build(counterfeit, PREDICTION), 'E_LEARNING_COUNTERFACTUAL_REJECTED');
  assert.equal(failure.details.channel, 'counterfactual');
  assert.equal(failure.details.metricKey, 'social.engagement');
});

test('PIN: the learning channel rejects a simulated-flagged outcome', () => {
  const evidence = buildEvidence();
  const counterfeit = {
    ...evidence,
    outcomes: [{ ...evidence.outcomes[0], channel: 'simulated' }],
  } as unknown as MeasuredEvidence;
  const failure = expectFail(build(counterfeit, PREDICTION), 'E_LEARNING_COUNTERFACTUAL_REJECTED');
  assert.equal(failure.details.channel, 'simulated');
});

test('a measured outcome without a matching prediction is a typed failure', () => {
  const missingSuspected: CitedPrediction = {
    ...PREDICTION,
    points: [PREDICTION.points[0]!, PREDICTION.points[1]!],
  };
  const failure = expectFail(build(buildEvidence(), missingSuspected), 'E_LEARNING_MISSING_PREDICTION');
  assert.equal(failure.details.stratum, 'SUSPECTED');
  assert.equal(failure.details.metricKey, 'health.non-healthy');
});

test('predictions do not satisfy outcomes of a different stratum', () => {
  const noStratum: CitedPrediction = {
    ...PREDICTION,
    points: [
      PREDICTION.points[0]!,
      { metricKey: 'health.non-healthy', point: 0.08 },
    ],
  };
  const failure = expectFail(build(buildEvidence(), noStratum), 'E_LEARNING_MISSING_PREDICTION');
  assert.equal(failure.details.stratum, 'provider-CONFIRMED');
  assert.equal(failure.details.metricKey, 'health.non-healthy');
});

test('degradation and OOD flags aggregate into the learning record', () => {
  const record = build(buildEvidence({ degradeS1: true, oodH1: true }), PREDICTION);
  if (!record.ok) assert.fail(`expected ok, got ${record.error.code}`);
  assert.equal(record.value.degradationFlag, true);
  assert.equal(record.value.outOfDistributionFlag, true);
  const clean = build(buildEvidence(), PREDICTION);
  if (!clean.ok) assert.fail(`expected ok, got ${clean.error.code}`);
  assert.equal(clean.value.degradationFlag, false);
  assert.equal(clean.value.outOfDistributionFlag, false);
});

test('the evidence digest is deterministic and sensitive to the measured values', () => {
  const first = build(buildEvidence(), PREDICTION);
  const again = build(buildEvidence(), PREDICTION);
  const shifted = build(buildEvidence({ s2Successes: 10 }), PREDICTION);
  if (!first.ok || !again.ok || !shifted.ok) assert.fail('expected ok');
  assert.match(first.value.evidenceDigest, /^[0-9a-f]{64}$/);
  assert.equal(first.value.evidenceDigest, again.value.evidenceDigest);
  assert.notEqual(first.value.evidenceDigest, shifted.value.evidenceDigest);
});
