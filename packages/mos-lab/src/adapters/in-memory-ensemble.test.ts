import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  EnsemblePrediction,
  EnsemblePort,
} from '../contracts/ensemble.js';
import type { SimulatorStepInput } from '../contracts/simulator.js';
import {
  FIXED_NOW,
  contentCandidate,
  ensembleId,
  ensembleStack,
  fullCoverage,
  memberA,
  memberB,
  scopeOf,
  scenarioOf,
  weightedPolicy,
} from '../testing/w4a-lab-fixtures.js';

type EvaluationResult = Awaited<ReturnType<EnsemblePort['evaluateEnsemble']>>;

const asPrediction = (result: EvaluationResult): EnsemblePrediction => {
  if ('error' in result) {
    assert.fail(`unexpected ensemble error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asError = (result: EvaluationResult): { error: string; message: string } => {
  assert.ok('error' in result, `expected a typed failure, got: ${String(result)}`);
  return result;
};

/** Raw evaluation result union (assertions applied by the callers). */
const evaluateRaw = async (
  ensemble: EnsemblePort,
  overrides: Partial<SimulatorStepInput & { readonly ensembleVersion: number }> = {},
): Promise<EvaluationResult> =>
  ensemble.evaluateEnsemble({
    scope: scopeOf('tenant-a'),
    ensembleId: ensembleId(),
    ensembleVersion: 1,
    scenario: scenarioOf(),
    candidate: contentCandidate,
    seed: 42,
    step: 0,
    ...overrides,
  });

const evaluate = async (
  ensemble: EnsemblePort,
  overrides: Partial<SimulatorStepInput & { readonly ensembleVersion: number }> = {},
): Promise<EnsemblePrediction> => asPrediction(await evaluateRaw(ensemble, overrides));

// ---------------------------------------------------------------------------
// Aggregation math (documented formula, pinned)
// ---------------------------------------------------------------------------

test('ensemble aggregates members: expected value = weighted mean, interval forced to cover the member spread', async () => {
  const { ensemble, engine } = await ensembleStack();

  // The members' STANDALONE predictions (same scope/scenario/candidate/seed/step).
  const memberInputs = [
    { worldModelId: 'world-a' as never, worldModelVersion: 1 },
    { worldModelId: 'world-b' as never, worldModelVersion: 1 },
  ];
  const standalone = [];
  for (const member of memberInputs) {
    const result = await engine.simulateStep({
      scope: scopeOf('tenant-a'),
      ...member,
      scenario: scenarioOf(),
      candidate: contentCandidate,
      seed: 42,
      step: 0,
    } as SimulatorStepInput);
    if ('error' in result) {
      assert.fail(`unexpected simulator error: ${result.error}`);
    }
    standalone.push(result);
  }

  const prediction = await evaluate(ensemble);
  assert.equal(prediction.memberPredictions.length, 2, 'both members ran');
  assert.equal(prediction.counterfactual, true, 'LOCK RULE 29: ensemble output is counterfactual');

  const reach = prediction.metrics.find((m) => m.metric === 'qualified-reach');
  assert.ok(reach !== undefined, 'the qualified-reach metric is aggregated');
  const reachA = standalone[0]?.metrics.find((m) => m.metric === 'qualified-reach')?.expectedValue;
  const reachB = standalone[1]?.metrics.find((m) => m.metric === 'qualified-reach')?.expectedValue;
  assert.ok(reachA !== undefined && reachB !== undefined);

  // Uniform policy: expected = unweighted mean of the member expected values.
  assert.ok(
    Math.abs(reach.expectedValue - (reachA + reachB) / 2) < 1e-9,
    `expected value is the uniform mean (${reach.expectedValue} vs ${(reachA + reachB) / 2})`,
  );
  // Interval covers the member spread: spread/2 dominates the ±12% envelopes here.
  const spread = reachB - reachA;
  assert.ok(
    Math.abs(reach.interval.lower - (reach.expectedValue - spread / 2)) < 1e-6,
    'lower bound = expected − spread/2 (weighting cannot hide disagreement)',
  );
  assert.ok(
    Math.abs(reach.interval.upper - (reach.expectedValue + spread / 2)) < 1e-6,
    'upper bound = expected + spread/2',
  );

  // The two fixture worlds differ ONLY in baseAudience (12k vs 24k) and share
  // the (seed, step) noise stream → member expected values differ by exactly
  // the audience factor 2.
  assert.ok(Math.abs(reachB - 2 * reachA) < 1e-6, 'member B reach = 2 × member A reach');

  // DISAGREEMENT is reported per metric and ALWAYS visible (§22).
  const reachDisagreement = prediction.disagreement.perMetric.find(
    (d) => d.metric === 'qualified-reach',
  );
  assert.ok(reachDisagreement !== undefined);
  assert.ok(Math.abs(reachDisagreement.spread - spread) < 1e-6, 'spread = max − min of member expected values');
  assert.ok(Math.abs(reachDisagreement.halfSpread - spread / 2) < 1e-9);
  assert.deepEqual(reachDisagreement.memberExpected, [reachA, reachB]);
  assert.ok(prediction.disagreement.summary.level === 'high', 'a 2× member spread is high disagreement');
});

test('declared-member-weights policy: explicit versioned weighting, normalized to 1', async () => {
  const { ensemble } = await ensembleStack({
    policy: weightedPolicy(),
    members: [
      memberA({ weight: 3 }),
      memberB({ weight: 1, coverage: fullCoverage() }),
    ],
  });
  const prediction = await evaluate(ensemble);
  assert.equal(prediction.weightingPolicy.kind, 'declared-member-weights');
  assert.equal(prediction.weightingPolicy.version, 2, 'the policy is versioned');

  const [weightA, weightB] = prediction.memberPredictions.map((m) => m.effectiveWeight);
  assert.ok(weightA !== undefined && weightB !== undefined);
  assert.ok(Math.abs(weightA - 0.75) < 1e-12, 'weights are normalized (3/4)');
  assert.ok(Math.abs(weightB - 0.25) < 1e-12, 'weights are normalized (1/4)');
  assert.ok(Math.abs(weightA + weightB - 1) < 1e-12, 'effective weights sum to 1');

  const reach = prediction.metrics.find((m) => m.metric === 'qualified-reach');
  const [reachA, reachB] = prediction.memberPredictions.map((m) =>
    m.prediction.metrics.find((metric) => metric.metric === 'qualified-reach')?.expectedValue,
  );
  assert.ok(reach !== undefined && reachA !== undefined && reachB !== undefined);
  assert.ok(
    Math.abs(reach.expectedValue - (0.75 * reachA + 0.25 * reachB)) < 1e-6,
    'expected value is the WEIGHTED mean',
  );
  // The member spread stays fully visible even under the weighted policy (§22).
  const disagreement = prediction.disagreement.perMetric.find((d) => d.metric === 'qualified-reach');
  assert.ok(disagreement !== undefined);
  assert.ok(Math.abs(disagreement.spread - Math.abs(reachB - reachA)) < 1e-6);
});

// ---------------------------------------------------------------------------
// Version pinning + append-only composition through evaluation
// ---------------------------------------------------------------------------

test('evaluation is VERSION-PINNED: member addition appends a new version; prior version evaluates identically', async () => {
  const { ensemble, worldModels } = await ensembleStack();

  const before = await evaluate(ensemble);
  const beforeAgain = await evaluate(ensemble);
  assert.deepEqual(beforeAgain, before, 'same version + same inputs → bit-identical prediction');

  const worldC = await worldModels.registerWorldModel({
    scope: scopeOf('tenant-a'),
    worldModel: {
      id: 'world-c' as never,
      niche: 'sourdough-baking',
      platform: 'short-video',
      state: { baseAudience: 18_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
      notes: 'third member world',
    },
  });
  if ('error' in worldC) {
    assert.fail(`fixture world-c registration failed: ${worldC.error}`);
  }
  const v2 = await ensemble.addEnsembleMember({
    scope: scopeOf('tenant-a'),
    ensembleId: ensembleId(),
    member: {
      id: 'member-c',
      worldModelId: 'world-c' as never,
      worldModelVersion: 1,
      coverage: fullCoverage(),
    },
  });
  if ('error' in v2) {
    assert.fail(`unexpected addEnsembleMember error: ${v2.error}`);
  }
  assert.equal(v2.version, 2, 'member addition APPENDS version 2');

  const after = await evaluate(ensemble, { ensembleVersion: 2 });
  assert.equal(after.memberPredictions.length, 3);
  assert.equal(after.ensembleVersion, 2);

  const versionOne = await evaluate(ensemble, { ensembleVersion: 1 });
  assert.deepEqual(versionOne, before, 'v1 still evaluates bit-identically (append-only)');
  assert.equal(versionOne.memberPredictions.length, 2);
});

test('frozen ensembles remain evaluable (freezing blocks composition, not evaluation)', async () => {
  const { ensemble } = await ensembleStack();
  const frozen = await ensemble.freezeEnsemble(scopeOf('tenant-a'), ensembleId());
  if ('error' in frozen) {
    assert.fail(`unexpected freeze error: ${frozen.error}`);
  }
  const prediction = await evaluate(ensemble, { ensembleVersion: frozen.version });
  assert.equal(prediction.memberPredictions.length, 2);
  assert.equal(prediction.ensembleVersion, frozen.version);
});

// ---------------------------------------------------------------------------
// Failure codes (fail closed, named)
// ---------------------------------------------------------------------------

test('evaluation fails closed: unknown ensemble, missing version, scenario mismatch, member failure', async () => {
  const { ensemble } = await ensembleStack();

  const unknown = asError(
    await ensemble.evaluateEnsemble({
      scope: scopeOf('tenant-b'),
      ensembleId: ensembleId(),
      ensembleVersion: 1,
      scenario: scenarioOf(),
      candidate: contentCandidate,
      seed: 42,
      step: 0,
    }),
  );
  assert.equal(unknown.error, 'unknown-ensemble');

  const missingVersion = asError(
    await ensemble.evaluateEnsemble({
      scope: scopeOf('tenant-a'),
      ensembleId: ensembleId(),
      ensembleVersion: 7,
      scenario: scenarioOf(),
      candidate: contentCandidate,
      seed: 42,
      step: 0,
    }),
  );
  assert.equal(missingVersion.error, 'ensemble-version-not-found');

  const mismatch = asError(
    await ensemble.evaluateEnsemble({
      scope: scopeOf('tenant-a'),
      ensembleId: ensembleId(),
      ensembleVersion: 1,
      scenario: scenarioOf({ niche: 'espresso-club' }),
      candidate: contentCandidate,
      seed: 42,
      step: 0,
    }),
  );
  assert.equal(mismatch.error, 'scenario-ensemble-mismatch');

  // A member whose world model was never registered → member-evaluation-failed.
  const broken = await ensembleStack({
    members: [
      memberA(),
      memberB({ worldModelId: 'world-never-registered' as never }),
    ],
  });
  const memberFailure = asError(
    await broken.ensemble.evaluateEnsemble({
      scope: scopeOf('tenant-a'),
      ensembleId: ensembleId(),
      ensembleVersion: 1,
      scenario: scenarioOf(),
      candidate: contentCandidate,
      seed: 42,
      step: 0,
    }),
  );
  assert.equal(memberFailure.error, 'member-evaluation-failed');
  assert.match(memberFailure.message, /member-b.*world-never-registered/);

  for (const bad of [
    { seed: Number.NaN },
    { step: -1 },
    { candidate: { ...contentCandidate, cadencePerWeek: -5 } },
  ]) {
    const invalid = asError(await evaluateRaw(ensemble, bad as Partial<SimulatorStepInput>));
    assert.equal(invalid.error, 'invalid-input');
  }
});

test('the composed ensemble surface is 8 methods (≤ 12 policy budget)', async () => {
  const { ensemble } = await ensembleStack();
  const surface = Object.keys(ensemble as unknown as Record<string, unknown>);
  assert.deepEqual([...surface].sort(), [
    'addEnsembleMember',
    'evaluateEnsemble',
    'freezeEnsemble',
    'getEnsemble',
    'listEnsembleVersions',
    'registerEnsemble',
    'resolveLatestEnsemble',
    'runSeedRobustnessSweep',
  ]);
  assert.ok(surface.length <= 12, 'architecture policy: maxPublicMethods');
  for (const method of surface) {
    assert.ok(
      !/update|delete|remove|rewrite|mutate|edit|patch/i.test(method),
      `mutating method name forbidden on the ensemble surface: ${method}`,
    );
  }
});

// The composed factory accepts an injectable clock (deterministic stamps).
test('composed ensemble honors the injected clock (deterministic predictedAt)', async () => {
  const stampA = await ensembleStack();
  const stampB = await ensembleStack();
  const a = await evaluate(stampA.ensemble);
  const b = await evaluate(stampB.ensemble);
  assert.equal(a.predictedAt, FIXED_NOW());
  assert.equal(b.predictedAt, FIXED_NOW());
  assert.deepEqual(a, b, 'fresh stacks with the same clock produce identical predictions');
});
