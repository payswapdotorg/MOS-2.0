import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptJobsPort, extractCitedPrediction, MemoryJobQueue } from './index.js';
import type { CitedPrediction, Failure, Result } from './index.js';

function expectFail<T>(result: Result<T, Failure>, code: string): Failure {
  if (result.ok) assert.fail(`expected failure '${code}' but the operation succeeded`);
  assert.equal(result.error.code, code);
  return result.error;
}

const CANONICAL = {
  labCandidateId: 'lab-1',
  labModuleVersion: '0.4.0',
  predictedAt: '2025-12-30T00:00:00Z',
  points: [
    { metricKey: 'social.engagement', point: 0.62, lower: 0.5, upper: 0.75 },
    { metricKey: 'health.non-healthy', stratum: 'provider-CONFIRMED', point: 0.1 },
    { metricKey: 'health.non-healthy', stratum: 'SUSPECTED', point: 0.05 },
  ],
};

test('a canonical Lab candidate extracts with every field carried', () => {
  const result = extractCitedPrediction(CANONICAL);
  if (!result.ok) assert.fail(`expected ok, got ${result.error.code}`);
  const cited: CitedPrediction = result.value;
  assert.equal(cited.labCandidateId, 'lab-1');
  assert.equal(cited.labModuleVersion, '0.4.0');
  assert.equal(cited.predictedAt, '2025-12-30T00:00:00Z');
  assert.equal(cited.points.length, 3);
  assert.equal(cited.points[0]?.metricKey, 'social.engagement');
  assert.equal(cited.points[0]?.point, 0.62);
});

test('alternate upstream spellings are probed, never guessed', () => {
  const result = extractCitedPrediction({
    candidateId: 'lab-9',
    modelVersion: '0.5.0',
    createdAt: '2026-01-01T00:00:00Z',
    forecast: [{ key: 'social.engagement', predicted: 0.7, lower: 0.6, upper: 0.8 }],
  });
  if (!result.ok) assert.fail(`expected ok, got ${result.error.code}`);
  assert.equal(result.value.labCandidateId, 'lab-9');
  assert.equal(result.value.labModuleVersion, '0.5.0');
  assert.equal(result.value.predictedAt, '2026-01-01T00:00:00Z');
  assert.equal(result.value.points[0]?.metricKey, 'social.engagement');
  assert.equal(result.value.points[0]?.point, 0.7);
  assert.equal(result.value.points[0]?.lower, 0.6);
  assert.equal(result.value.points[0]?.upper, 0.8);
});

test('a candidate without an identifier fails with the probed key list', () => {
  const error = expectFail(extractCitedPrediction({ points: CANONICAL.points }), 'E_PLAN_INVALID');
  const probed = error.details.probed as readonly string[] | undefined;
  assert.ok(Array.isArray(probed) && probed.includes('labCandidateId'));
});

test('predicted points that are not an array fail precisely', () => {
  expectFail(extractCitedPrediction({ labCandidateId: 'lab-1', labModuleVersion: '0.4.0', predictedAt: '2025-12-30T00:00:00Z', forecast: 'nope' }), 'E_PLAN_INVALID');
});

test('a predicted point without a finite value fails with its metric key', () => {
  const error = expectFail(
    extractCitedPrediction({
      labCandidateId: 'lab-1',
      labModuleVersion: '0.4.0',
      predictedAt: '2025-12-30T00:00:00Z',
      points: [{ metricKey: 'social.engagement', value: 'not-a-number' }],
    }),
    'E_PLAN_INVALID',
  );
  assert.equal(error.details.metricKey, 'social.engagement');
});

test('a candidate with an empty points array fails (the loop needs predictions)', () => {
  expectFail(
    extractCitedPrediction({ labCandidateId: 'lab-1', labModuleVersion: '0.4.0', predictedAt: '2025-12-30T00:00:00Z', points: [] }),
    'E_PLAN_INVALID',
  );
});

test('interval bounds are kept when present and absent when not', () => {
  const result = extractCitedPrediction(CANONICAL);
  if (!result.ok) assert.fail(`expected ok, got ${result.error.code}`);
  assert.equal(result.value.points[0]?.lower, 0.5);
  assert.equal(result.value.points[0]?.upper, 0.75);
  const stratumPoint = result.value.points[1];
  assert.ok(stratumPoint !== undefined);
  assert.equal('lower' in stratumPoint, false);
  assert.equal('upper' in stratumPoint, false);
});

test('stratification is carried for recognized classes and dropped otherwise', () => {
  const result = extractCitedPrediction({
    labCandidateId: 'lab-1',
    labModuleVersion: '0.4.0',
    predictedAt: '2025-12-30T00:00:00Z',
    points: [
      { metricKey: 'health.non-healthy', stratum: 'provider-CONFIRMED', point: 0.1 },
      { metricKey: 'health.other', stratum: 'weird', point: 0.2 },
    ],
  });
  if (!result.ok) assert.fail(`expected ok, got ${result.error.code}`);
  assert.equal(result.value.points[0]?.stratum, 'provider-CONFIRMED');
  assert.equal(result.value.points[1]?.stratum, undefined);
});

test('a non-record candidate is refused', () => {
  expectFail(extractCitedPrediction(42), 'E_PLAN_INVALID');
  expectFail(extractCitedPrediction(null), 'E_PLAN_INVALID');
});

test('adaptJobsPort routes a real MemoryJobQueue through the port contract', () => {
  const queue = new MemoryJobQueue();
  const adapted = adaptJobsPort(queue);
  if (!adapted.ok) assert.fail(`expected ok, got ${adapted.error.code}`);
  const enqueued = adapted.value.enqueue({ kind: 'experiments/prod002/run', payload: { experimentId: 'exp-1', tenantId: 'acme' } });
  if (!enqueued.ok) assert.fail(`expected ok, got ${enqueued.error.code}`);
  assert.equal(enqueued.value.jobId, 'job-1');
  assert.equal(queue.jobs[0]?.kind, 'experiments/prod002/run');
  const completed = adapted.value.complete('job-1', { status: 'completed' });
  if (!completed.ok) assert.fail(`expected ok, got ${completed.error.code}`);
  assert.equal(queue.jobs[0]?.status, 'completed');
});

test('a jobs candidate missing a method fails with a probe report', () => {
  const candidate = {
    enqueue: () => undefined,
    fail: () => undefined,
  };
  const error = expectFail(adaptJobsPort(candidate), 'E_JOBS_PORT_INCOMPATIBLE');
  const probe = error.details.probe as readonly string[] | undefined;
  assert.ok(Array.isArray(probe) && probe.some((entry) => entry.includes('complete:missing')));
});

test('an async jobs authority is refused — durability is never faked', () => {
  const candidate = {
    enqueue: () => Promise.resolve({ jobId: 'j-async' }),
    complete: () => undefined,
    fail: () => undefined,
  };
  const adapted = adaptJobsPort(candidate);
  if (!adapted.ok) assert.fail(`expected ok, got ${adapted.error.code}`);
  expectFail(adapted.value.enqueue({ kind: 'k', payload: { experimentId: 'e', tenantId: 't' } }), 'E_JOBS_PORT_INCOMPATIBLE');
});

test('authority-shaped failures pass through with their own code', () => {
  const queue = new MemoryJobQueue();
  const adapted = adaptJobsPort(queue);
  if (!adapted.ok) assert.fail(`expected ok, got ${adapted.error.code}`);
  const error = expectFail(adapted.value.enqueue({ kind: 'experiments/prod002/run', payload: {} }), 'E_JOB_PAYLOAD_MISMATCH');
  assert.ok(error.message.includes('experimentId'));
});

test('an unrecognized authority return shape is a typed failure', () => {
  const candidate = {
    enqueue: () => undefined,
    complete: () => undefined,
    fail: () => undefined,
  };
  const adapted = adaptJobsPort(candidate);
  if (!adapted.ok) assert.fail(`expected ok, got ${adapted.error.code}`);
  expectFail(adapted.value.enqueue({ kind: 'k', payload: { experimentId: 'e', tenantId: 't' } }), 'E_JOB_ENQUEUE_FAILED');
});

test('a null jobs candidate is refused upfront', () => {
  expectFail(adaptJobsPort(null), 'E_JOBS_PORT_INCOMPATIBLE');
});
