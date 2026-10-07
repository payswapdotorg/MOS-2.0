import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryOffPolicyEvaluator } from './in-memory-off-policy-evaluation.js';
import type {
  OffPolicyEvaluationInput,
  OffPolicyEvaluationPort,
  OffPolicyEvaluationScore,
  OffPolicyInsufficientHistory,
} from '../contracts/off-policy-evaluation.js';
import type { DelayedInformationQuery, TimeMachinePort } from '../contracts/time-machine.js';
import type { HistoricalObservation } from '../contracts/evidence.js';
import type { Timestamp } from '@mos/contracts';
import {
  OPE_AS_OF,
  OPE_BEYOND_LAG,
  OPE_LAGGED,
  contentCandidate,
  ensembleId,
  ensembleStack,
  reachRewardSpec,
  scopeOf,
  scenarioOf,
  timeMachineWith,
} from '../testing/w4a-lab-fixtures.js';

type EvaluationResult = Awaited<ReturnType<OffPolicyEvaluationPort['evaluateCandidate']>>;

const asScore = (result: EvaluationResult): OffPolicyEvaluationScore => {
  if ('error' in result) {
    assert.fail(`unexpected OPE error: ${result.error} — ${result.message}`);
  }
  if (result.verdict !== 'estimated') {
    assert.fail(`expected an estimated score, got: ${result.verdict}`);
  }
  return result;
};

const asInsufficient = (result: EvaluationResult): OffPolicyInsufficientHistory => {
  if (!('verdict' in result) || result.verdict !== 'insufficient-history') {
    assert.fail(`expected insufficient-history, got: ${String(result)}`);
  }
  return result;
};

const asError = (result: EvaluationResult): { error: string; message: string } => {
  assert.ok('error' in result, `expected a typed failure, got: ${String(result)}`);
  return result;
};

/** A replay spy: records every delayed-information query the evaluator makes. */
const spyingMachine = (
  machine: Pick<TimeMachinePort, 'replayDelayedInformation'>,
): {
  readonly machine: Pick<TimeMachinePort, 'replayDelayedInformation'>;
  readonly queries: DelayedInformationQuery[];
} => {
  const queries: DelayedInformationQuery[] = [];
  return {
    queries,
    machine: {
      replayDelayedInformation: async (scope, query) => {
        queries.push(query);
        return machine.replayDelayedInformation(scope, query);
      },
    },
  };
};

const mixedRewardSpec = () =>
  reachRewardSpec({
    extraTerms: [
      {
        metric: 'audience-growth',
        weight: 0.01,
        direction: 'maximize',
        definition: 'observed baseline-reach mean over the lagged basis (people)',
        metricSource: 'baseline-reach',
      },
    ],
  });

const opeInput = (
  overrides: Partial<OffPolicyEvaluationInput> = {},
): OffPolicyEvaluationInput => ({
  scope: scopeOf('tenant-a'),
  ensembleId: ensembleId(),
  ensembleVersion: 1,
  scenario: scenarioOf(),
  program: { candidate: contentCandidate, horizonSteps: 2 },
  rewardSpec: reachRewardSpec(),
  seeds: [42, 43],
  asOf: OPE_AS_OF,
  ...overrides,
});

const basisIds = (score: OffPolicyEvaluationScore): readonly string[] =>
  score.basis.observationIds.map((id) => String(id));

// ---------------------------------------------------------------------------
// Estimated scores: bounded estimate + disclosures (§22 + §24)
// ---------------------------------------------------------------------------

test('OPE over recorded history produces a bounded estimate with the full disclosure set', async () => {
  const { ensemble } = await ensembleStack();
  const machine = await timeMachineWith(OPE_LAGGED);
  const evaluator = createInMemoryOffPolicyEvaluator({ ensemble, timeMachine: machine });

  const score = asScore(await evaluator.evaluateCandidate(opeInput()));
  assert.equal(score.verdict, 'estimated');
  assert.equal(score.counterfactual, true, 'LOCK RULE 29: a simulated estimate, never historical');
  assert.equal(score.disclosure, 'off-policy-simulated-estimate');
  assert.equal(score.validity.simulatedEstimate, true, '§24 boundary statement is explicit');
  assert.match(score.validity.statement, /SIMULATED estimate, never experimental proof/);

  // Interval bounds the estimate (§22).
  assert.ok(score.interval.lower < score.estimatedReward);
  assert.ok(score.estimatedReward < score.interval.upper);
  // The interval is EXACTLY estimate ± (statistical + disagreement + seed) half-widths.
  const breakdown = score.uncertaintyBreakdown;
  const total =
    breakdown.statisticalHalfWidth +
    breakdown.ensembleDisagreementHalfWidth +
    breakdown.seedRobustnessHalfWidth;
  assert.ok(Math.abs(score.interval.lower - (score.estimatedReward - total)) < 1e-9);
  assert.ok(Math.abs(score.interval.upper - (score.estimatedReward + total)) < 1e-9);
  assert.equal(breakdown.formula, 'ope-hoeffding-additive-v1');
  assert.equal(breakdown.effectiveSampleSize, 3, 'three lagged observations in the basis');

  // A predicted-only reward spec has NO statistical term (nothing observed).
  assert.equal(breakdown.statisticalHalfWidth, 0);
  // The two fixture members disagree structurally (12k vs 24k audience).
  assert.ok(breakdown.ensembleDisagreementHalfWidth > 0);
  // The member B coverage declaration flags the cadence-5 candidate as OOD.
  assert.equal(score.oodCarried, true);

  // Per-term resolution provenance: the reach term draws from the PREDICTED metric.
  assert.equal(score.perTerm.length, 1);
  assert.equal(score.perTerm[0]?.source, 'predicted-metric');
  assert.equal(score.perTerm[0]?.metricSource, 'qualified-reach');

  // Determinism: the same evaluation reproduces bit for bit.
  const again = asScore(await evaluator.evaluateCandidate(opeInput()));
  assert.deepEqual(again, score);
});

test('mixed spec: the Hoeffding statistical bound is the DOCUMENTED per-term formula', async () => {
  const { ensemble } = await ensembleStack();
  const machine = await timeMachineWith(OPE_LAGGED);
  const evaluator = createInMemoryOffPolicyEvaluator({ ensemble, timeMachine: machine });

  const score = asScore(
    await evaluator.evaluateCandidate(
      opeInput({
        rewardSpec: mixedRewardSpec(),
        confidence: 0.05,
      }),
    ),
  );
  // n = 3 lagged observations of baseline-reach (1000 / 1400 / 1800):
  //   ε_stat = Σ_j w_j · (vMax − vMin) · sqrt(ln(2/δ) / (2n))
  //          = 0.01 · 800 · sqrt(ln(2/0.05) / 6)
  const expectedStatistical =
    0.01 * (1_800 - 1_000) * Math.sqrt(Math.log(2 / 0.05) / (2 * 3));
  assert.ok(
    Math.abs(score.uncertaintyBreakdown.statisticalHalfWidth - expectedStatistical) < 1e-9,
    `statistical half-width matches the documented formula (${score.uncertaintyBreakdown.statisticalHalfWidth} vs ${expectedStatistical})`,
  );
  assert.equal(score.uncertaintyBreakdown.confidence, 0.05);

  // Both value domains resolve: predicted metric + observed baseline.
  assert.deepEqual(
    score.perTerm.map((term) => term.source),
    ['predicted-metric', 'observed'],
  );
  assert.deepEqual(
    score.perTerm.map((term) => term.metricSource),
    ['qualified-reach', 'baseline-reach'],
  );
  // The observed-baseline mean is reported on the basis (real evidence, summarized).
  const baseline = score.basis.observedMetricMeans.find((m) => m.metric === 'baseline-reach');
  assert.ok(baseline !== undefined);
  assert.ok(Math.abs(baseline.mean - 1_400) < 1e-9);
});

// ---------------------------------------------------------------------------
// Lag discipline (lock rule 30 — the basis is ≤ T − L, never beyond)
// ---------------------------------------------------------------------------

test('LAG DISCIPLINE: observations inside (T−L, T] NEVER reach the estimate', async () => {
  const { ensemble } = await ensembleStack();
  const clean = await timeMachineWith(OPE_LAGGED);
  const poisoned = await timeMachineWith([...OPE_LAGGED, ...OPE_BEYOND_LAG]);

  const cleanEvaluator = createInMemoryOffPolicyEvaluator({ ensemble, timeMachine: clean });
  const poisonedEvaluator = createInMemoryOffPolicyEvaluator({
    ensemble,
    timeMachine: poisoned,
  });

  const cleanScore = asScore(await cleanEvaluator.evaluateCandidate(opeInput()));
  const poisonedScore = asScore(await poisonedEvaluator.evaluateCandidate(opeInput()));

  // The 999_999-valued beyond-lag rows are excluded from the basis…
  assert.deepEqual(basisIds(cleanScore), basisIds(poisonedScore));
  assert.equal(poisonedScore.basis.observationCount, 3);
  // …and the estimate is BIT-IDENTICAL — future information cannot move it.
  assert.deepEqual(poisonedScore, cleanScore);
});

test('LAG DISCIPLINE: the evaluator replays ONLY through delayed-information mode at the scenario lag', async () => {
  const { ensemble } = await ensembleStack();
  const machine = await timeMachineWith(OPE_LAGGED);
  const spy = spyingMachine(machine);
  const evaluator = createInMemoryOffPolicyEvaluator({ ensemble, timeMachine: spy.machine });

  asScore(await evaluator.evaluateCandidate(opeInput()));
  assert.equal(spy.queries.length, 1, 'exactly one delayed-information replay per evaluation');
  const query = spy.queries[0];
  assert.ok(query !== undefined);
  assert.equal(query.asOf, OPE_AS_OF, 'the replay cutoff is the evaluation T');
  assert.equal(
    query.lagMs,
    scenarioOf().informationLag,
    'the enforced lag is EXACTLY the scenario lag (never silently shrunk)',
  );
  assert.equal(query.niche, 'sourdough-baking');
  assert.equal(query.platform, 'short-video');
});

test('a Time Machine failure surfaces as history-unavailable (fail closed)', async () => {
  const { ensemble } = await ensembleStack();
  const broken: Pick<TimeMachinePort, 'replayDelayedInformation'> = {
    replayDelayedInformation: async () => ({
      error: 'invalid-input',
      message: 'machine failure simulation',
    }),
  };
  const evaluator = createInMemoryOffPolicyEvaluator({ ensemble, timeMachine: broken });
  const failure = asError(await evaluator.evaluateCandidate(opeInput()));
  assert.equal(failure.error, 'history-unavailable');
});

// ---------------------------------------------------------------------------
// Insufficient history: an explicit verdict, never a silent zero
// ---------------------------------------------------------------------------

test('EMPTY history yields the explicit insufficient-history verdict (never a silent zero)', async () => {
  const { ensemble } = await ensembleStack();
  const empty = await timeMachineWith([]);
  const evaluator = createInMemoryOffPolicyEvaluator({ ensemble, timeMachine: empty });

  const verdict = asInsufficient(await evaluator.evaluateCandidate(opeInput()));
  assert.equal(verdict.verdict, 'insufficient-history');
  assert.equal(verdict.observed, 0);
  assert.equal(verdict.requiredMinimum, 1);
  assert.equal(verdict.lagMs, scenarioOf().informationLag);
  assert.match(verdict.message, /never a silent zero/);
});

test('a sub-minimum visible basis is insufficient (declared threshold respected)', async () => {
  const { ensemble } = await ensembleStack();
  const machine = await timeMachineWith(OPE_LAGGED);
  const evaluator = createInMemoryOffPolicyEvaluator({ ensemble, timeMachine: machine });

  // T = 06-25 → T−L = 06-20: only the 06-20 observation is visible → n = 1 < 2.
  const verdict = asInsufficient(
    await evaluator.evaluateCandidate(
      opeInput({
        asOf: '2026-06-25T00:00:00.000Z' as Timestamp,
        minObservations: 2,
      }),
    ),
  );
  assert.equal(verdict.observed, 1);
  assert.equal(verdict.requiredMinimum, 2);
});

// ---------------------------------------------------------------------------
// Reward-spec discipline (§21 — versioned, explicit binding)
// ---------------------------------------------------------------------------

test('reward-spec VERSION mismatch fails closed with a typed error', async () => {
  const { ensemble } = await ensembleStack();
  const machine = await timeMachineWith(OPE_LAGGED);
  const evaluator = createInMemoryOffPolicyEvaluator({ ensemble, timeMachine: machine });

  const mismatch = asError(
    await evaluator.evaluateCandidate(
      opeInput({ rewardSpec: reachRewardSpec({ version: 2 }) }),
    ),
  );
  assert.equal(mismatch.error, 'reward-version-mismatch');
  assert.match(mismatch.message, /rewardSpec\.version 2.*scenario\.rewardVersion 1/);
});

test('a non-derivable term source fails closed; an ambiguous source fails closed', async () => {
  const { ensemble } = await ensembleStack();
  const machine = await timeMachineWith(OPE_LAGGED);
  const evaluator = createInMemoryOffPolicyEvaluator({ ensemble, timeMachine: machine });

  const notDerivable = asError(
    await evaluator.evaluateCandidate(
      opeInput({
        rewardSpec: reachRewardSpec({
          extraTerms: [
            {
              metric: 'quality',
              weight: 1,
              direction: 'maximize',
              definition: 'a source that resolves nowhere',
              metricSource: 'no-such-metric-anywhere',
            },
          ],
        }),
      }),
    ),
  );
  assert.equal(notDerivable.error, 'reward-term-not-derivable');

  // A source resolving in BOTH the predicted and the observed domains is
  // ambiguous — the caller must disambiguate explicitly (§21).
  const overlappingHistory = await timeMachineWith(
    OPE_LAGGED.map((row) => ({
      ...row,
      metrics: [
        { metric: 'baseline-reach', value: row.metrics[0]?.value ?? 0, unit: 'people' },
        { metric: 'qualified-reach', value: 5_000, unit: 'people' },
      ],
    })),
  );
  const ambiguousEvaluator = createInMemoryOffPolicyEvaluator({
    ensemble,
    timeMachine: overlappingHistory,
  });
  const ambiguous = asError(await ambiguousEvaluator.evaluateCandidate(opeInput()));
  assert.equal(ambiguous.error, 'reward-term-ambiguous');
});

// ---------------------------------------------------------------------------
// Ensemble + input failure codes
// ---------------------------------------------------------------------------

test('unknown ensemble / missing version / malformed inputs fail closed', async () => {
  const { ensemble } = await ensembleStack();
  const machine = await timeMachineWith(OPE_LAGGED);
  const evaluator = createInMemoryOffPolicyEvaluator({ ensemble, timeMachine: machine });

  const unknown = asError(
    await evaluator.evaluateCandidate(opeInput({ scope: scopeOf('tenant-b') })),
  );
  assert.equal(unknown.error, 'unknown-ensemble');

  const missingVersion = asError(
    await evaluator.evaluateCandidate(opeInput({ ensembleVersion: 9 })),
  );
  assert.equal(missingVersion.error, 'ensemble-version-not-found');

  for (const bad of [
    { seeds: [] },
    { seeds: [42, Number.NaN] },
    { program: { candidate: contentCandidate, horizonSteps: 0 } },
    { confidence: 0 },
    { minObservations: 0 },
    { rewardSpec: { version: 1, terms: [] } },
  ]) {
    const invalid = asError(
      await evaluator.evaluateCandidate(opeInput(bad as Partial<OffPolicyEvaluationInput>)),
    );
    assert.equal(invalid.error, 'invalid-input');
  }
});

test('the OPE surface is a single evaluateCandidate method (≤ 12 policy budget)', async () => {
  const { ensemble } = await ensembleStack();
  const machine = await timeMachineWith(OPE_LAGGED);
  const evaluator = createInMemoryOffPolicyEvaluator({ ensemble, timeMachine: machine });
  assert.deepEqual(Object.keys(evaluator), ['evaluateCandidate']);
});

// The HistoricalObservation/estimate separation is structural as well: the
// score references the basis by observation IDS, never by embedding records.
test('the score basis carries observation ids, never embedded historical records', async () => {
  const { ensemble } = await ensembleStack();
  const machine = await timeMachineWith(OPE_LAGGED);
  const evaluator = createInMemoryOffPolicyEvaluator({ ensemble, timeMachine: machine });
  const score = asScore(await evaluator.evaluateCandidate(opeInput()));

  const replay = await machine.replayDelayedInformation(scopeOf('tenant-a'), {
    asOf: OPE_AS_OF,
    lagMs: scenarioOf().informationLag,
    niche: 'sourdough-baking',
    platform: 'short-video',
  });
  if ('error' in replay) {
    assert.fail(`unexpected replay error: ${replay.error}`);
  }
  const ids = replay.map((observation: HistoricalObservation) => String(observation.id));
  assert.deepEqual(basisIds(score), ids);
});
