import type {
  LabScenario,
  StrategyRef,
  Timestamp,
  UncertaintySummary,
} from '@mos/contracts';
import type {
  BenchmarkCalibrationDeclarationFixture,
  BenchmarkCandidateEvaluationFixture,
  BenchmarkCandidateFixture,
  BenchmarkCandidateProvenanceFixture,
  BenchmarkWorldModelPinFixture,
  BenchmarkWorldModelRefFixture,
  RankedBenchmarkCandidateFixture,
  RobustnessPolicyFixture,
} from './lab-fixture-shapes.js';

/**
 * Shared builder parts for the REAL-shaped LAB-017 benchmark fixtures
 * (UX-003 composition seam). The world-model set, the DECLARED policies,
 * the §22 evaluation builder (additive-consistent intervals) and the ranked
 * candidate builder live here so the record files stay within the ≤500-line
 * managed-file discipline.
 *
 * Every builder produces data in the EXACT authority record shapes
 * (`lab-fixture-shapes.ts` mirrors) — no view models, no invention: numbers
 * are hand-checkable and structurally consistent (breakdown half-widths sum
 * to the total; intervals bracket the expected value symmetrically).
 */

/** Mirror of the authority's frozen pending-reality calibration declaration. */
export const BENCHMARK_CALIBRATION_DECLARATION: BenchmarkCalibrationDeclarationFixture = {
  status: 'pending-reality',
  provenance:
    'calibration is LAB-018 (online calibration): simulation-to-reality prediction error is recorded there once real experiments exist; this frozen benchmark record is never rewritten',
  predictionSurface: 'per-candidate expected reward + interval',
};

const UNCERTAINTY: UncertaintySummary = {
  level: 'moderate',
  note: 'bench-additive-v1 over the declared world-model set and seed budget',
};

/** The declared two-world model set every fixture policy sweeps over. */
export const WORLD_PRIMARY: BenchmarkWorldModelRefFixture = {
  ensembleId: 'ensemble-reach-primary' as never,
  ensembleVersion: 3,
  label: 'primary',
};

export const WORLD_PESSIMISTIC: BenchmarkWorldModelRefFixture = {
  ensembleId: 'ensemble-reach-pessimistic' as never,
  ensembleVersion: 2,
  label: 'pessimistic',
};

export const WORLD_PINS: readonly BenchmarkWorldModelPinFixture[] = [
  {
    ensembleId: WORLD_PRIMARY.ensembleId,
    ensembleVersion: WORLD_PRIMARY.ensembleVersion,
    weightingPolicyId: 'weight-uniform-v1',
    weightingPolicyVersion: 1,
    weightingKind: 'uniform',
    memberWorldModelVersions: [4, 2],
  },
  {
    ensembleId: WORLD_PESSIMISTIC.ensembleId,
    ensembleVersion: WORLD_PESSIMISTIC.ensembleVersion,
    weightingPolicyId: 'weight-uniform-v1',
    weightingPolicyVersion: 1,
    weightingKind: 'uniform',
    memberWorldModelVersions: [3, 5],
  },
];

/** The scenarios the fixture benchmark records cite. */
export const REACH_SCENARIO: LabScenario = {
  id: 'scenario-reach-sourdough' as never,
  version: 2 as never,
  niche: 'sourdough-baking',
  platform: 'short-video',
  objective: 'Grow qualified reach of the home-baker audience this quarter.',
  context: { audience: 'home bakers', region: 'eu-west' },
  budget: { maxCost: { amount: 4000, currency: 'EUR' }, maxDurationMs: 2_592_000_000 },
  informationLag: 7,
  corpusVersion: 6 as never,
  simulatorVersion: 4 as never,
  rewardVersion: 2 as never,
};

export const LAUNCH_SCENARIO: LabScenario = {
  id: 'scenario-launch-starterkit' as never,
  version: 1 as never,
  niche: 'sourdough-baking',
  platform: 'short-video',
  objective: 'Launch the starter-kit offer without fatiguing the audience.',
  context: { audience: 'home bakers', region: 'eu-west' },
  budget: { maxCost: { amount: 2500, currency: 'EUR' }, maxDurationMs: 1_296_000_000 },
  informationLag: 3,
  corpusVersion: 6 as never,
  simulatorVersion: 4 as never,
  rewardVersion: 2 as never,
};

/** Build a DECLARED versioned robustness policy (the frozen vocabulary). */
export const policyOf = (
  id: string,
  version: number,
  seeds: readonly number[],
  worldModelSet: readonly BenchmarkWorldModelRefFixture[],
  aggregation: RobustnessPolicyFixture['aggregation'],
  note: string,
): RobustnessPolicyFixture => ({
  id,
  version,
  seedBudget: seeds.length,
  worldModelSet,
  sweepDimensions: ['seed', 'world-model'],
  aggregation,
  tieBreak: 'expected-desc-halfwidth-asc-key-asc',
  note,
});

/** Build one benchmark candidate input (the declared action seam shape). */
export const candidateOf = (
  key: string,
  label: string,
  origin: BenchmarkCandidateFixture['source']['origin'],
  action: BenchmarkCandidateFixture['action'],
  producerPins: BenchmarkCandidateFixture['source']['producerPins'],
  note: string,
): BenchmarkCandidateFixture => ({
  key,
  action,
  horizonSteps: 12,
  source: { origin, producerPins, note },
  label,
});

/**
 * Build one §22 evaluation with an ADDITIVE-consistent interval: the
 * breakdown half-widths sum to `totalHalfWidth`, and the interval brackets
 * the expected value symmetrically (the authority's documented
 * bench-additive-v1 form). Per-world member disagreement and OOD signals are
 * carried per declared world, never hidden by aggregation.
 */
export const evaluationOf = (input: {
  readonly expectedReward: number;
  readonly memberDisagreementHalfWidth: number;
  readonly seedRobustnessHalfWidth: number;
  readonly worldModelSpreadHalfWidth: number;
  readonly seeds: readonly number[];
  readonly perSeedExpected: readonly number[];
  readonly primaryExpected: number;
  readonly pessimisticExpected: number;
  readonly primaryMembers: readonly number[];
  readonly pessimisticMembers: readonly number[];
  readonly oodPrimaryStatus: BenchmarkCandidateEvaluationFixture['ood']['perWorld'][number]['status'];
  readonly oodPrimaryDistance: number;
  readonly aggregation?: BenchmarkCandidateEvaluationFixture['breakdown']['aggregation'];
}): BenchmarkCandidateEvaluationFixture => {
  const totalHalfWidth =
    input.memberDisagreementHalfWidth +
    input.seedRobustnessHalfWidth +
    input.worldModelSpreadHalfWidth;
  const halfOf = (values: readonly number[]): number =>
    (Math.max(...values) - Math.min(...values)) / 2;
  const spreadOf = (values: readonly number[]): number => Math.max(...values) - Math.min(...values);
  const aggregation = input.aggregation ?? 'pooled-mean';
  return {
    expectedReward: input.expectedReward,
    interval: {
      lower: Number((input.expectedReward - totalHalfWidth).toFixed(2)),
      upper: Number((input.expectedReward + totalHalfWidth).toFixed(2)),
    },
    uncertainty: UNCERTAINTY,
    breakdown: {
      memberDisagreementHalfWidth: input.memberDisagreementHalfWidth,
      seedRobustnessHalfWidth: input.seedRobustnessHalfWidth,
      worldModelSpreadHalfWidth: input.worldModelSpreadHalfWidth,
      totalHalfWidth,
      formula: 'bench-additive-v1',
      aggregation,
    },
    seedRobustness: {
      seeds: [...input.seeds],
      perSeedExpected: [...input.perSeedExpected],
      spread: Number(spreadOf(input.perSeedExpected).toFixed(2)),
      halfSpread: Number(halfOf(input.perSeedExpected).toFixed(2)),
      relativeSpread: Number(
        (
          spreadOf(input.perSeedExpected) /
          Math.abs(
            input.perSeedExpected.reduce((sum, value) => sum + value, 0) /
              input.perSeedExpected.length,
          )
        ).toFixed(3),
      ),
    },
    worldRobustness: {
      perWorld: [
        { ...WORLD_PRIMARY, expectedReward: input.primaryExpected },
        { ...WORLD_PESSIMISTIC, expectedReward: input.pessimisticExpected },
      ],
      spread: Number(Math.abs(input.primaryExpected - input.pessimisticExpected).toFixed(2)),
      halfSpread: Number(
        (Math.abs(input.primaryExpected - input.pessimisticExpected) / 2).toFixed(2),
      ),
      worstExpectedReward: Math.min(input.primaryExpected, input.pessimisticExpected),
      bestExpectedReward: Math.max(input.primaryExpected, input.pessimisticExpected),
    },
    disagreement: {
      perWorld: [
        {
          ...WORLD_PRIMARY,
          memberExpected: [...input.primaryMembers],
          spread: Number(spreadOf(input.primaryMembers).toFixed(2)),
          halfSpread: Number(halfOf(input.primaryMembers).toFixed(2)),
        },
        {
          ...WORLD_PESSIMISTIC,
          memberExpected: [...input.pessimisticMembers],
          spread: Number(spreadOf(input.pessimisticMembers).toFixed(2)),
          halfSpread: Number(halfOf(input.pessimisticMembers).toFixed(2)),
        },
      ],
      worstHalfWidth: Number(
        Math.max(halfOf(input.primaryMembers), halfOf(input.pessimisticMembers)).toFixed(2),
      ),
    },
    ood: {
      status: input.oodPrimaryStatus,
      flagged: input.oodPrimaryStatus !== 'in-coverage',
      perWorld: [
        {
          ...WORLD_PRIMARY,
          status: input.oodPrimaryStatus,
          flagged: input.oodPrimaryStatus !== 'in-coverage',
          maxDistance: input.oodPrimaryDistance,
        },
        {
          ...WORLD_PESSIMISTIC,
          status: 'in-coverage',
          flagged: false,
          maxDistance: 0,
        },
      ],
    },
    calibration: BENCHMARK_CALIBRATION_DECLARATION,
    counterfactual: true,
    disclosure: 'robust-benchmark-over-disclosed-synthetic-ensembles',
  };
};

/** Build the version provenance of one ranked candidate. */
export const provenanceOf = (
  origin: BenchmarkCandidateFixture['source']['origin'],
  candidateSource: BenchmarkCandidateFixture['source'],
  seeds: readonly number[],
  policyId: string,
  policyVersion: number,
): BenchmarkCandidateProvenanceFixture => ({
  origin,
  candidateSource,
  simulatorVersion: 4,
  rewardSpecVersion: 2,
  policyId,
  policyVersion,
  seeds: [...seeds],
  horizonSteps: 12,
  worldModels: WORLD_PINS,
});

/** Build one ranked candidate (comparison against the baseline declared). */
export const rankedOf = (
  rank: number,
  candidate: BenchmarkCandidateFixture,
  evaluation: BenchmarkCandidateEvaluationFixture,
  provenance: BenchmarkCandidateProvenanceFixture,
  baselineExpected: number,
): RankedBenchmarkCandidateFixture => ({
  rank,
  key: candidate.key,
  label: candidate.label ?? null,
  origin: candidate.source.origin,
  candidate,
  evaluation,
  provenance,
  comparisonToBaseline: {
    baselineExpectedReward: baselineExpected,
    expectedRewardDelta: Number((evaluation.expectedReward - baselineExpected).toFixed(2)),
    intervalOverlapWithBaseline: {
      overlaps: true,
      note: 'declared overlap — intervals are never hidden',
    },
    certainlyBetterThanBaseline: false,
  },
  intervalOverlapWithLeader:
    rank === 1
      ? null
      : {
          overlaps: true,
          note: 'declared overlap with the rank-1 leader',
        },
});

/** The benchmark's OWN synthesized no-op baseline candidate (§7 reserved identity). */
export const noopCandidate = candidateOf(
  'noop-baseline',
  'Do nothing (no-op baseline)',
  'no-op-baseline',
  {
    strategyRef: 'strategy:benchmark-no-op-baseline' as StrategyRef,
    kind: 'no-op',
    cadencePerWeek: 0,
    novelty: 0,
    engagementEffort: 0,
  },
  [],
  'the benchmark’s own synthesized no-op baseline (reserved identity)',
);

/**
 * The ranked no-op baseline: it IS the reference point, so its baseline
 * comparison carries a zero delta by construction (the authority's own
 * discipline — the baseline is synthesized, never caller-claimable).
 */
export const noopBaselineRankedOf = (
  rank: number,
  evaluation: BenchmarkCandidateEvaluationFixture,
  seeds: readonly number[],
  policyId: string,
  policyVersion: number,
): RankedBenchmarkCandidateFixture => ({
  ...rankedOf(
    rank,
    noopCandidate,
    evaluation,
    provenanceOf('no-op-baseline', noopCandidate.source, seeds, policyId, policyVersion),
    evaluation.expectedReward,
  ),
  comparisonToBaseline: {
    baselineExpectedReward: evaluation.expectedReward,
    expectedRewardDelta: 0,
    intervalOverlapWithBaseline: {
      overlaps: true,
      note: 'the baseline is its own reference — delta is zero by construction',
    },
    certainlyBetterThanBaseline: false,
  },
});

/** The §24 boundary statement every fixture record carries verbatim. */
export const BENCHMARK_LAB_ONLY_STATEMENT =
  'robust benchmark output informs selection only — it is NOT deployment evidence; the real-experiment boundary (§24) is the only path to reality-grade proof';

/** The fairness pin statement (the authority's frozen literal). */
export const BENCHMARK_FAIRNESS_STATEMENT =
  'every candidate in this benchmark was evaluated under the same seeds, world-model set, policy version and reward spec version — no per-candidate condition cherry-picking';

/** A deterministic-looking 64-hex digest for fixture records. */
export const digestOf = (seed: string): string => {
  let hash = 0x811c9dc5;
  let out = '';
  for (let round = 0; round < 8; round += 1) {
    for (const char of `${seed}#${round}`) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    out += hash.toString(16).padStart(8, '0');
  }
  return out.slice(0, 64);
};

export const asTimestamp = (value: string): Timestamp => value as Timestamp;
