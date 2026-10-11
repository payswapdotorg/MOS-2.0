import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildObservationSet, computeEvidence, toPlatformSaidObservation, validateTenantId } from './index.js';
import type { Failure, IdGenerator, MetricSpec, ObservationExpectation, PlatformSaidObservation, Result, TenantId } from './index.js';

const tenantOk = validateTenantId('acme');
if (!tenantOk.ok) assert.fail('fixture tenant must validate');
const tenant: TenantId = tenantOk.value;
const ids: IdGenerator = { nextId: () => 'x' };

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

function seal(observations: readonly PlatformSaidObservation[]) {
  const sealed = buildObservationSet(expectation(), observations, ids);
  if (!sealed.ok) assert.fail(`fixture seal failed: ${sealed.error.code}`);
  const evidence = computeEvidence({ observationSet: sealed.value, specs: FIXTURE_SPECS, evidenceId: 'evidence-x', computedAt: '2026-01-03T00:00:00Z' });
  if (!evidence.ok) assert.fail(`fixture evidence failed: ${evidence.error.code}`);
  return { set: sealed.value, evidence: evidence.value };
}

const FIXTURE_SPECS: readonly MetricSpec[] = [
  { metricKey: 'social.engagement', formulaRef: 'proportion.wilson@1', confidenceLevel: 0.95, family: 'social', metricKeyFilter: 'social.engagement' },
];

function expectFailure<T>(result: Result<T, Failure>, code: string): Failure {
  if (result.ok) assert.fail(`expected failure '${code}' but the operation succeeded`);
  assert.equal(result.error.code, code);
  return result.error;
}

function fixtureObservations(): PlatformSaidObservation[] {
  return [
    observation({ observationId: 's1', payload: { family: 'social', metricKey: 'social.engagement', trials: 10, successes: 8 } }),
    observation({ observationId: 's2', payload: { family: 'social', metricKey: 'social.engagement', trials: 15, successes: 9 } }),
    observation({ observationId: 'm1', payload: { family: 'measure', metricKey: 'latency.ms', values: [1, 2, 3] } }),
    observation({ observationId: 'm2', payload: { family: 'measure', metricKey: 'latency.ms', values: [4, 5] } }),
    observation({ observationId: 'h1', payload: { family: 'platform-health', provider: 'prov-a', status: 'degraded', restriction: 'provider-CONFIRMED' } }),
    observation({ observationId: 'h2', payload: { family: 'platform-health', provider: 'prov-a', status: 'healthy', restriction: 'SUSPECTED' } }),
  ];
}

test('proportion metric carries formula ref, interval, and pooled sample size', () => {
  const { set, evidence } = seal(fixtureObservations());
  const outcome = evidence.outcomes.find((o) => o.metricKey === 'social.engagement');
  assert.ok(outcome !== undefined);
  assert.equal(outcome.formulaRef, 'proportion.wilson@1');
  assert.equal(outcome.sampleSize, 25);
  assert.equal(outcome.estimate.point, 17 / 25);
  assert.equal(outcome.estimate.method, 'wilson-score');
  assert.ok(outcome.estimate.lower < outcome.estimate.point && outcome.estimate.point < outcome.estimate.upper);
  assert.equal(evidence.totalObservations, 6);
  assert.equal(evidence.observationSetDigest, set.digest);
  assert.deepEqual(evidence.window, { startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-02T00:00:00Z' });
});

test('mean metric carries interval and sample size over measure observations', () => {
  const sealed = buildObservationSet(expectation(), fixtureObservations(), ids);
  if (!sealed.ok) assert.fail('fixture seal failed');
  const evidence = computeEvidence({
    observationSet: sealed.value,
    specs: [{ metricKey: 'latency.mean', formulaRef: 'mean.normal@1', confidenceLevel: 0.95, family: 'measure', metricKeyFilter: 'latency.ms' }],
    evidenceId: 'evidence-x',
    computedAt: '2026-01-03T00:00:00Z',
  });
  if (!evidence.ok) assert.fail(`expected ok, got ${evidence.error.code}`);
  const outcome = evidence.value.outcomes[0]!;
  assert.equal(outcome.sampleSize, 5);
  assert.equal(outcome.estimate.point, 3);
  assert.equal(outcome.estimate.method, 'normal-approximation');
  assert.ok(outcome.estimate.lower < 3 && outcome.estimate.upper > 3);
});

test('health incidence is stratified per HEALTH-001 restriction class — never pooled', () => {
  const sealed = buildObservationSet(expectation(), fixtureObservations(), ids);
  if (!sealed.ok) assert.fail('fixture seal failed');
  const evidence = computeEvidence({
    observationSet: sealed.value,
    specs: [{ metricKey: 'health.non-healthy', formulaRef: 'health.non-healthy-incidence.wilson@1', confidenceLevel: 0.95, family: 'platform-health', restrictions: 'both-stratified' }],
    evidenceId: 'evidence-x',
    computedAt: '2026-01-03T00:00:00Z',
  });
  if (!evidence.ok) assert.fail(`expected ok, got ${evidence.error.code}`);
  assert.equal(evidence.value.outcomes.length, 2);
  const strata = evidence.value.outcomes.map((o) => o.stratum).sort();
  assert.deepEqual(strata, ['SUSPECTED', 'provider-CONFIRMED']);
  const confirmed = evidence.value.outcomes.find((o) => o.stratum === 'provider-CONFIRMED');
  assert.ok(confirmed !== undefined);
  assert.equal(confirmed.sampleSize, 1);
  assert.equal(confirmed.estimate.point, 1);
});

test('pooled health incidence is refused with E_RESTRICTION_CONFLATION_FORBIDDEN', () => {
  const sealed = buildObservationSet(expectation(), fixtureObservations(), ids);
  if (!sealed.ok) assert.fail('fixture seal failed');
  const failure = expectFailure(
    computeEvidence({
      observationSet: sealed.value,
      specs: [{ metricKey: 'health.pooled', formulaRef: 'health.non-healthy-incidence.wilson@1', confidenceLevel: 0.95, family: 'platform-health', restrictions: 'pooled' }],
      evidenceId: 'evidence-x',
      computedAt: '2026-01-03T00:00:00Z',
    }),
    'E_RESTRICTION_CONFLATION_FORBIDDEN',
  );
  assert.equal(failure.details.requested, 'pooled');
});

test('single-stratum health spec yields exactly one outcome', () => {
  const sealed = buildObservationSet(expectation(), fixtureObservations(), ids);
  if (!sealed.ok) assert.fail('fixture seal failed');
  const evidence = computeEvidence({
    observationSet: sealed.value,
    specs: [{ metricKey: 'health.suspected', formulaRef: 'health.non-healthy-incidence.wilson@1', confidenceLevel: 0.95, family: 'platform-health', restrictions: 'SUSPECTED' }],
    evidenceId: 'evidence-x',
    computedAt: '2026-01-03T00:00:00Z',
  });
  if (!evidence.ok) assert.fail(`expected ok, got ${evidence.error.code}`);
  assert.equal(evidence.value.outcomes.length, 1);
  assert.equal(evidence.value.outcomes[0]!.stratum, 'SUSPECTED');
  assert.equal(evidence.value.outcomes[0]!.estimate.point, 0);
});

test('a stratified class with zero observations fails with E_INSUFFICIENT_SAMPLE', () => {
  const onlyConfirmed = fixtureObservations().filter((o) => o.observationId !== 'h2');
  const sealed = buildObservationSet(expectation(), onlyConfirmed, ids);
  if (!sealed.ok) assert.fail('fixture seal failed');
  const failure = expectFailure(
    computeEvidence({
      observationSet: sealed.value,
      specs: [{ metricKey: 'health.non-healthy', formulaRef: 'health.non-healthy-incidence.wilson@1', confidenceLevel: 0.95, family: 'platform-health', restrictions: 'both-stratified' }],
      evidenceId: 'evidence-x',
      computedAt: '2026-01-03T00:00:00Z',
    }),
    'E_INSUFFICIENT_SAMPLE',
  );
  assert.equal(failure.details.stratum, 'SUSPECTED');
});

test('unknown formula refs fail with E_UNKNOWN_FORMULA', () => {
  const sealed = buildObservationSet(expectation(), fixtureObservations(), ids);
  if (!sealed.ok) assert.fail('fixture seal failed');
  expectFailure(
    computeEvidence({
      observationSet: sealed.value,
      specs: [{ metricKey: 'made.up', formulaRef: 'made.up@1', confidenceLevel: 0.95, family: 'social' }],
      evidenceId: 'evidence-x',
      computedAt: '2026-01-03T00:00:00Z',
    }),
    'E_UNKNOWN_FORMULA',
  );
});

test('formula/spec family mismatch fails with E_METRIC_DATA_MISMATCH', () => {
  const sealed = buildObservationSet(expectation(), fixtureObservations(), ids);
  if (!sealed.ok) assert.fail('fixture seal failed');
  expectFailure(
    computeEvidence({
      observationSet: sealed.value,
      specs: [{ metricKey: 'mismatched', formulaRef: 'proportion.wilson@1', confidenceLevel: 0.95, family: 'measure', metricKeyFilter: 'latency.ms' }],
      evidenceId: 'evidence-x',
      computedAt: '2026-01-03T00:00:00Z',
    }),
    'E_METRIC_DATA_MISMATCH',
  );
});

test('a metric matching zero observations fails with E_INSUFFICIENT_SAMPLE', () => {
  const sealed = buildObservationSet(expectation(), fixtureObservations(), ids);
  if (!sealed.ok) assert.fail('fixture seal failed');
  expectFailure(
    computeEvidence({
      observationSet: sealed.value,
      specs: [{ metricKey: 'absent', formulaRef: 'proportion.wilson@1', confidenceLevel: 0.95, family: 'social', metricKeyFilter: 'social.absent' }],
      evidenceId: 'evidence-x',
      computedAt: '2026-01-03T00:00:00Z',
    }),
    'E_INSUFFICIENT_SAMPLE',
  );
});

test('empty outcome set fails with E_EVIDENCE_EMPTY', () => {
  const sealed = buildObservationSet(expectation(), fixtureObservations(), ids);
  if (!sealed.ok) assert.fail('fixture seal failed');
  expectFailure(
    computeEvidence({ observationSet: sealed.value, specs: [], evidenceId:
'evidence-x',
      computedAt: '2026-01-03T00:00:00Z',
    }),
    'E_EVIDENCE_EMPTY',
  );
});

test('degradation and OOD flags ride through from the underlying observations', () => {
  const flagged = fixtureObservations();
  flagged[0] = observation({
    observationId: 's1',
    payload: { family: 'social', metricKey: 'social.engagement', trials: 10, successes: 8 },
    degradationFlag: true,
  });
  flagged[4] = observation({
    observationId: 'h1',
    payload: { family: 'platform-health', provider: 'prov-a', status: 'degraded', restriction: 'provider-CONFIRMED' },
    outOfDistributionFlag: true,
  });
  const sealed = buildObservationSet(expectation(), flagged, ids);
  if (!sealed.ok) assert.fail('fixture seal failed');
  const evidence = computeEvidence({
    observationSet: sealed.value,
    specs: [
      { metricKey: 'social.engagement', formulaRef: 'proportion.wilson@1', confidenceLevel: 0.95, family: 'social', metricKeyFilter: 'social.engagement' },
      { metricKey: 'health.non-healthy', formulaRef: 'health.non-healthy-incidence.wilson@1', confidenceLevel: 0.95, family: 'platform-health', restrictions: 'both-stratified' },
    ],
    evidenceId: 'evidence-x',
    computedAt: '2026-01-03T00:00:00Z',
  });
  if (!evidence.ok) assert.fail(`expected ok, got ${evidence.error.code}`);
  const engagement = evidence.value.outcomes.find((o) => o.metricKey === 'social.engagement');
  assert.ok(engagement !== undefined);
  assert.equal(engagement.degradationFlag, true);
  assert.equal(engagement.outOfDistributionFlag, false);
  const confirmed = evidence.value.outcomes.find((o) => o.stratum === 'provider-CONFIRMED');
  assert.ok(confirmed !== undefined);
  assert.equal(confirmed.outOfDistributionFlag, true);
  assert.equal(confirmed.degradationFlag, false);
  const suspected = evidence.value.outcomes.find((o) => o.stratum === 'SUSPECTED');
  assert.ok(suspected !== undefined);
  assert.equal(suspected.degradationFlag, false);
  assert.equal(suspected.outOfDistributionFlag, false);
});

test('every computed outcome is channel-measured with a declared formula ref and interval', () => {
  const sealed = buildObservationSet(expectation(), fixtureObservations(), ids);
  if (!sealed.ok) assert.fail('fixture seal failed');
  const evidence = computeEvidence({
    observationSet: sealed.value,
    specs: [
      { metricKey: 'social.engagement', formulaRef: 'proportion.wilson@1', confidenceLevel: 0.95, family: 'social', metricKeyFilter: 'social.engagement' },
      { metricKey: 'latency.mean', formulaRef: 'mean.normal@1', confidenceLevel: 0.95, family: 'measure', metricKeyFilter: 'latency.ms' },
      { metricKey: 'health.non-healthy', formulaRef: 'health.non-healthy-incidence.wilson@1', confidenceLevel: 0.95, family: 'platform-health', restrictions: 'both-stratified' },
    ],
    evidenceId: 'evidence-x',
    computedAt: '2026-01-03T00:00:00Z',
  });
  if (!evidence.ok) assert.fail(`expected ok, got ${evidence.error.code}`);
  assert.equal(evidence.value.outcomes.length, 4);
  for (const outcome of evidence.value.outcomes) {
    assert.equal(outcome.channel, 'measured');
    assert.ok(outcome.formulaRef.length > 0);
    assert.ok(Number.isFinite(outcome.estimate.point));
    assert.ok(outcome.estimate.lower <= outcome.estimate.point);
    assert.ok(outcome.estimate.point <= outcome.estimate.upper);
    assert.ok(outcome.sampleSize >= 1);
    assert.equal(outcome.window.startsAt, '2026-01-01T00:00:00Z');
    assert.equal(outcome.window.endsAt, '2026-01-02T00:00:00Z');
  }
});
