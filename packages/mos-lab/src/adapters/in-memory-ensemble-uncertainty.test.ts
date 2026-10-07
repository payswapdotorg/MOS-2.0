import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { EnsemblePort, SeedRobustnessSweep } from '../contracts/ensemble.js';
import {
  contentCandidate,
  ensembleId,
  ensembleStack,
  fullCoverage,
  memberA,
  memberB,
  scopeOf,
  scenarioOf,
} from '../testing/w4a-lab-fixtures.js';

const sweep = async (
  ensemble: EnsemblePort,
  seeds: readonly number[],
): Promise<SeedRobustnessSweep> => {
  const result = await ensemble.runSeedRobustnessSweep({
    scope: scopeOf('tenant-a'),
    ensembleId: ensembleId(),
    ensembleVersion: 1,
    scenario: scenarioOf(),
    candidate: contentCandidate,
    seed: seeds[0] as number,
    step: 0,
    seeds,
  });
  if ('error' in result) {
    assert.fail(`unexpected sweep error: ${result.error} — ${result.message}`);
  }
  return result;
};

// ---------------------------------------------------------------------------
// OOD/novelty signal vs declared member coverage (§22 — flagged, never silent)
// ---------------------------------------------------------------------------

test('an out-of-coverage input is FLAGGED per member, never silently extrapolated', async () => {
  // memberB declares cadence coverage [0, 3]; the candidate carries cadence 5.
  const { ensemble } = await ensembleStack();
  const prediction = await ensemble.evaluateEnsemble({
    scope: scopeOf('tenant-a'),
    ensembleId: ensembleId(),
    ensembleVersion: 1,
    scenario: scenarioOf(),
    candidate: contentCandidate,
    seed: 42,
    step: 0,
  });
  if ('error' in prediction) {
    assert.fail(`unexpected ensemble error: ${prediction.error}`);
  }

  assert.equal(prediction.ood.flagged, true);
  assert.equal(prediction.ood.status, 'out-of-declared-coverage');
  assert.equal(prediction.ood.perMember.length, 2);

  const [verdictA, verdictB] = prediction.ood.perMember;
  assert.ok(verdictA !== undefined && verdictB !== undefined);
  assert.equal(verdictA.memberId, 'member-a');
  assert.equal(verdictA.verdict, 'in-coverage');
  assert.equal(verdictA.maxDistance, 0);

  assert.equal(verdictB.memberId, 'member-b');
  assert.equal(verdictB.verdict, 'out-of-declared-coverage');
  // Distance = gap / max(boxWidth, 1) = min(|5−0|, |5−3|) / max(3, 1) = 2/3.
  assert.ok(Math.abs(verdictB.distances.cadencePerWeek - 2 / 3) < 1e-12);
  assert.ok(Math.abs(verdictB.maxDistance - 2 / 3) < 1e-12);
  assert.equal(verdictB.distances.novelty, 0);
  assert.equal(verdictB.distances.engagementEffort, 0);
});

test('an in-coverage input is unflagged; undeclared coverage is a DISCLOSED partial state', async () => {
  const covered = await ensembleStack({
    members: [memberA(), memberB({ coverage: fullCoverage() })],
  });
  const inCoverage = await covered.ensemble.evaluateEnsemble({
    scope: scopeOf('tenant-a'),
    ensembleId: ensembleId(),
    ensembleVersion: 1,
    scenario: scenarioOf(),
    candidate: contentCandidate,
    seed: 42,
    step: 0,
  });
  if ('error' in inCoverage) {
    assert.fail(`unexpected ensemble error: ${inCoverage.error}`);
  }
  assert.equal(inCoverage.ood.flagged, false);
  assert.equal(inCoverage.ood.status, 'in-coverage');

  const partiallyDeclared = await ensembleStack({
    members: [memberA(), memberB({ coverage: undefined })],
  });
  const undeclared = await partiallyDeclared.ensemble.evaluateEnsemble({
    scope: scopeOf('tenant-a'),
    ensembleId: ensembleId(),
    ensembleVersion: 1,
    scenario: scenarioOf(),
    candidate: contentCandidate,
    seed: 42,
    step: 0,
  });
  if ('error' in undeclared) {
    assert.fail(`unexpected ensemble error: ${undeclared.error}`);
  }
  assert.equal(undeclared.ood.flagged, false, 'undeclared is not an OOD flag');
  assert.equal(undeclared.ood.status, 'partially-undeclared');
  const verdictB = undeclared.ood.perMember.find((v) => v.memberId === 'member-b');
  assert.ok(verdictB !== undefined);
  assert.equal(verdictB.verdict, 'undeclared');
});

// ---------------------------------------------------------------------------
// Multi-seed robustness sweep (§22 seed robustness)
// ---------------------------------------------------------------------------

test('the multi-seed robustness sweep records per-metric per-seed aggregates with spread', async () => {
  const { ensemble } = await ensembleStack();
  const seeds = [42, 43, 44];
  const record = await sweep(ensemble, seeds);

  assert.equal(record.counterfactual, true, 'LOCK RULE 29: the sweep is simulation-derived');
  assert.equal(record.disclosure, 'synthetic-response-function');
  assert.deepEqual(record.seeds, seeds);
  assert.ok(record.perMetric.length > 0, 'every aggregate metric is swept');

  const reach = record.perMetric.find((m) => m.metric === 'qualified-reach');
  assert.ok(reach !== undefined);
  assert.equal(reach.expectedBySeed.length, 3);
  assert.ok(reach.spread > 0, 'seeded noise produces a positive seed spread');
  assert.ok(Math.abs(reach.spread - (reach.max - reach.min)) < 1e-12);
  assert.ok(
    Math.abs(reach.relativeSpread - reach.spread / Math.abs(
      reach.expectedBySeed.reduce((sum, value) => sum + value, 0) / 3,
    )) < 1e-9,
    'relativeSpread = spread / |mean| (documented formula)',
  );
  assert.ok(['low', 'moderate', 'high'].includes(record.summary.level));

  // Determinism: the identical sweep reproduces bit for bit.
  const again = await sweep(ensemble, seeds);
  assert.deepEqual(again, record);
});

test('a sweep with fewer than two seeds fails closed (no single-seed robustness claims)', async () => {
  const { ensemble } = await ensembleStack();
  const single = await ensemble.runSeedRobustnessSweep({
    scope: scopeOf('tenant-a'),
    ensembleId: ensembleId(),
    ensembleVersion: 1,
    scenario: scenarioOf(),
    candidate: contentCandidate,
    seed: 42,
    step: 0,
    seeds: [42],
  });
  assert.ok('error' in single);
  assert.equal(single.error, 'invalid-input');
  assert.match(single.message, /at least two finite seeds/);
});

// ---------------------------------------------------------------------------
// §22 completeness on every ensemble prediction
// ---------------------------------------------------------------------------

test('every ensemble prediction carries the full computable §22 set + the LAB-018 calibration placeholder', async () => {
  const { ensemble } = await ensembleStack();
  const prediction = await ensemble.evaluateEnsemble({
    scope: scopeOf('tenant-a'),
    ensembleId: ensembleId(),
    ensembleVersion: 1,
    scenario: scenarioOf(),
    candidate: contentCandidate,
    seed: 42,
    step: 0,
  });
  if ('error' in prediction) {
    assert.fail(`unexpected ensemble error: ${prediction.error}`);
  }

  // expected value + interval per metric…
  assert.ok(prediction.metrics.length >= 3);
  for (const metric of prediction.metrics) {
    assert.ok(metric.interval.lower <= metric.expectedValue);
    assert.ok(metric.expectedValue <= metric.interval.upper);
  }
  // …model disagreement…
  assert.ok(prediction.disagreement.perMetric.length >= prediction.metrics.length);
  // …OOD/novelty signal…
  assert.equal(typeof prediction.ood.flagged, 'boolean');
  // …seed robustness is a separate first-class record (swept above)…
  // …and calibration is a PROVENANCE-DECLARED placeholder, never a number.
  assert.equal(prediction.calibration.status, 'not-calibrated');
  assert.match(prediction.calibration.provenance, /LAB-018/);
  assert.equal(
    Object.keys(prediction.calibration).length,
    2,
    'the placeholder carries no numeric fields',
  );

  // LOCK RULE 29 (runtime label pin): counterfactual + synthetic disclosure.
  assert.equal(prediction.counterfactual, true);
  assert.equal(prediction.disclosure, 'synthetic-response-function');
  assert.ok(['low', 'moderate', 'high'].includes(prediction.uncertainty.level));
  assert.ok(['low', 'moderate', 'high'].includes(prediction.disagreement.summary.level));
});
