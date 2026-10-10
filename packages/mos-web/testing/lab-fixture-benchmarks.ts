import type { LabScenario, LabScenarioId, StrategyRef, TenantId, Timestamp } from '@mos/contracts';
import type {
  BenchmarkCandidateFixture,
  LabBenchmarkIdFixture,
  RankedBenchmarkCandidateFixture,
  RobustBenchmarkRecordFixture,
  RobustnessPolicyFixture,
} from './lab-fixture-shapes.js';
import {
  BENCHMARK_CALIBRATION_DECLARATION, BENCHMARK_FAIRNESS_STATEMENT, BENCHMARK_LAB_ONLY_STATEMENT,
  LAUNCH_SCENARIO, REACH_SCENARIO, WORLD_PESSIMISTIC, WORLD_PINS, WORLD_PRIMARY, asTimestamp,
  candidateOf, digestOf, evaluationOf, noopBaselineRankedOf, policyOf, provenanceOf, rankedOf,
} from './lab-fixture-support.js';

/**
 * REAL-shaped LAB-017 benchmark fixture RECORDS (UX-003 composition seam).
 *
 * DISCLOSED synthetic fixture material in the EXACT record shapes the
 * robust marketing benchmark authority appends (`RobustBenchmarkRecord
 * Fixture` — the field-for-field mirror). Numbers are hand-checkable;
 * chains (append-only, tenant-scoped):
 * - bench-reach-v1 (tenant-demo) — v1 (first run, cites nothing) and v2
 *   (the closed loop: cites calibration context v1 derived by LAB-018);
 * - bench-launch-v2 (tenant-demo) — v1 under worst-world-mean aggregation;
 * - bench-other-1 (tenant-other) — cross-tenant isolation (§31).
 */

const REACH_SEEDS = [11, 23, 37, 41] as const;
const LAUNCH_SEEDS = [7, 19] as const;

const REACH_POLICY: RobustnessPolicyFixture = policyOf(
  'policy-robust-reach',
  1,
  REACH_SEEDS,
  [WORLD_PRIMARY, WORLD_PESSIMISTIC],
  'pooled-mean',
  'robust reach policy v1: four seeds, two declared world models, pooled mean',
);

const LAUNCH_POLICY: RobustnessPolicyFixture = policyOf(
  'policy-launch-conservative',
  2,
  LAUNCH_SEEDS,
  [WORLD_PRIMARY, WORLD_PESSIMISTIC],
  'worst-world-mean',
  'conservative launch policy v2: worst world-model mean — a candidate that only wins in one world cannot hide it',
);

// ——— the declared candidates ———

const clip5Candidate = candidateOf(
  'clip-5',
  'Daily sourdough clip',
  'hand-designed',
  {
    strategyRef: 'strategy:clip-daily-5' as StrategyRef,
    kind: 'content',
    cadencePerWeek: 5,
    novelty: 0.7,
    engagementEffort: 0.4,
  },
  [],
  'hand-designed by the growth operator',
);

const remix2Candidate = candidateOf(
  'remix-2',
  'Learned remix cadence',
  'learned-strategy',
  {
    strategyRef: 'strategy:learned-remix-2' as StrategyRef,
    kind: 'repost',
    cadencePerWeek: 2,
    novelty: 0.35,
    engagementEffort: 0.6,
  },
  [{ surface: 'strategy-learning', version: 3 }],
  'learned from simulation experience under the declared stopping policy',
);

const podcast1Candidate = candidateOf(
  'podcast-1',
  'Production-search podcast program',
  'production-search',
  {
    strategyRef: 'strategy:production-podcast-1' as StrategyRef,
    kind: 'content',
    cadencePerWeek: 1,
    novelty: 0.8,
    engagementEffort: 0.5,
  },
  [{ surface: 'production-program-search', version: 5 }],
  'composed by the production-program search (§7 sixteen dimensions)',
);

const orgSearch7Candidate = candidateOf(
  'org-search-7',
  'Organization-search critic layout',
  'organization-search',
  {
    strategyRef: 'strategy:org-search-7' as StrategyRef,
    kind: 'content',
    cadencePerWeek: 3,
    novelty: 0.6,
    engagementEffort: 0.7,
  },
  [{ surface: 'organization-search', version: 4 }],
  'generated organization with a quality critic (§23 three-way comparison)',
);

const teaser2Candidate = candidateOf(
  'teaser-2',
  'Launch teaser pair',
  'hand-designed',
  {
    strategyRef: 'strategy:launch-teaser-2' as StrategyRef,
    kind: 'content',
    cadencePerWeek: 2,
    novelty: 0.9,
    engagementEffort: 0.3,
  },
  [],
  'two launch teasers ahead of the starter-kit offer',
);

const waitThenPostCandidate = candidateOf(
  'wait-then-post-1',
  'Delay-economics wait path',
  'production-search',
  {
    strategyRef: 'strategy:wait-then-post-1' as StrategyRef,
    kind: 'repost',
    cadencePerWeek: 1,
    novelty: 0.5,
    engagementEffort: 0.2,
  },
  [{ surface: 'production-program-search', version: 5 }],
  'the delay-economics winner: wait for the weekend window, then repost the top clip',
);

// ——— the §22 evaluations ———

const noopReachEvaluation = evaluationOf({
  expectedReward: 8.2,
  memberDisagreementHalfWidth: 0.6,
  seedRobustnessHalfWidth: 0.8,
  worldModelSpreadHalfWidth: 1.4,
  seeds: REACH_SEEDS,
  perSeedExpected: [8.1, 8.4, 8.0, 8.3],
  primaryExpected: 9.2,
  pessimisticExpected: 7.2,
  primaryMembers: [8.8, 9.6],
  pessimisticMembers: [7.0, 7.4],
  oodPrimaryStatus: 'in-coverage',
  oodPrimaryDistance: 0,
});

const clip5Evaluation = evaluationOf({
  expectedReward: 24.6,
  memberDisagreementHalfWidth: 2.1,
  seedRobustnessHalfWidth: 1.5,
  worldModelSpreadHalfWidth: 2.3,
  seeds: REACH_SEEDS,
  perSeedExpected: [25.4, 23.8, 24.9, 24.3],
  primaryExpected: 27.4,
  pessimisticExpected: 21.8,
  primaryMembers: [25.9, 28.9],
  pessimisticMembers: [21.2, 22.4],
  // §22 OOD: cadence 5/week is OUTSIDE the primary world's declared coverage
  oodPrimaryStatus: 'out-of-declared-coverage',
  oodPrimaryDistance: 1.4,
});

const remix2Evaluation = evaluationOf({
  expectedReward: 21.3,
  memberDisagreementHalfWidth: 1.2,
  seedRobustnessHalfWidth: 1.0,
  worldModelSpreadHalfWidth: 2.05,
  seeds: REACH_SEEDS,
  perSeedExpected: [21.8, 20.9, 21.5, 21.0],
  primaryExpected: 23.1,
  pessimisticExpected: 19.5,
  primaryMembers: [22.4, 23.8],
  pessimisticMembers: [19.1, 19.9],
  oodPrimaryStatus: 'in-coverage',
  oodPrimaryDistance: 0,
});

const podcast1Evaluation = evaluationOf({
  expectedReward: 18.9,
  memberDisagreementHalfWidth: 1.6,
  seedRobustnessHalfWidth: 1.3,
  worldModelSpreadHalfWidth: 1.8,
  seeds: REACH_SEEDS,
  perSeedExpected: [19.4, 18.5, 19.1, 18.6],
  primaryExpected: 20.3,
  pessimisticExpected: 17.5,
  primaryMembers: [19.2, 21.4],
  pessimisticMembers: [17.1, 17.9],
  oodPrimaryStatus: 'partially-undeclared',
  oodPrimaryDistance: 0.6,
});

const orgSearch7Evaluation = evaluationOf({
  expectedReward: 26.1,
  memberDisagreementHalfWidth: 1.9,
  seedRobustnessHalfWidth: 1.4,
  worldModelSpreadHalfWidth: 2.5,
  seeds: REACH_SEEDS,
  perSeedExpected: [26.8, 25.4, 26.3, 25.9],
  primaryExpected: 28.9,
  pessimisticExpected: 23.3,
  primaryMembers: [27.4, 30.4],
  pessimisticMembers: [22.7, 23.9],
  oodPrimaryStatus: 'in-coverage',
  oodPrimaryDistance: 0.2,
});

const teaser2Evaluation = evaluationOf({
  expectedReward: 15.2,
  memberDisagreementHalfWidth: 1.1,
  seedRobustnessHalfWidth: 0.9,
  worldModelSpreadHalfWidth: 2.2,
  seeds: LAUNCH_SEEDS,
  perSeedExpected: [15.6, 14.8],
  primaryExpected: 17.4,
  pessimisticExpected: 13.0,
  primaryMembers: [16.6, 18.2],
  pessimisticMembers: [12.6, 13.4],
  oodPrimaryStatus: 'in-coverage',
  oodPrimaryDistance: 0,
  aggregation: 'worst-world-mean',
});

const waitThenPostEvaluation = evaluationOf({
  expectedReward: 13.7,
  memberDisagreementHalfWidth: 0.8,
  seedRobustnessHalfWidth: 0.7,
  worldModelSpreadHalfWidth: 1.6,
  seeds: LAUNCH_SEEDS,
  perSeedExpected: [13.9, 13.5],
  primaryExpected: 14.9,
  pessimisticExpected: 12.5,
  primaryMembers: [14.3, 15.5],
  pessimisticMembers: [12.2, 12.8],
  oodPrimaryStatus: 'in-coverage',
  oodPrimaryDistance: 0,
  aggregation: 'worst-world-mean',
});

const noopLaunchEvaluation = evaluationOf({
  expectedReward: 6.4,
  memberDisagreementHalfWidth: 0.5,
  seedRobustnessHalfWidth: 0.4,
  worldModelSpreadHalfWidth: 0.9,
  seeds: LAUNCH_SEEDS,
  perSeedExpected: [6.5, 6.3],
  primaryExpected: 7.1,
  pessimisticExpected: 5.7,
  primaryMembers: [6.8, 7.4],
  pessimisticMembers: [5.5, 5.9],
  oodPrimaryStatus: 'in-coverage',
  oodPrimaryDistance: 0,
  aggregation: 'worst-world-mean',
});

// ——— ranked entries ———

const reachBaseline = noopBaselineRankedOf(4, noopReachEvaluation, REACH_SEEDS, REACH_POLICY.id, 1);
const launchBaseline = noopBaselineRankedOf(3, noopLaunchEvaluation, LAUNCH_SEEDS, LAUNCH_POLICY.id, 2);

const reachRankedOf = (
  rank: number,
  candidate: BenchmarkCandidateFixture,
  evaluation: RankedBenchmarkCandidateFixture['evaluation'],
): RankedBenchmarkCandidateFixture =>
  rankedOf(
    rank,
    candidate,
    evaluation,
    provenanceOf(candidate.source.origin, candidate.source, REACH_SEEDS, REACH_POLICY.id, 1),
    8.2,
  );

const launchRankedOf = (
  rank: number,
  candidate: BenchmarkCandidateFixture,
  evaluation: RankedBenchmarkCandidateFixture['evaluation'],
): RankedBenchmarkCandidateFixture =>
  rankedOf(
    rank,
    candidate,
    evaluation,
    provenanceOf(candidate.source.origin, candidate.source, LAUNCH_SEEDS, LAUNCH_POLICY.id, 2),
    6.4,
  );

const reachV1Ranked: readonly RankedBenchmarkCandidateFixture[] = [
  reachRankedOf(1, clip5Candidate, clip5Evaluation),
  reachRankedOf(2, remix2Candidate, remix2Evaluation),
  reachRankedOf(3, podcast1Candidate, podcast1Evaluation),
  reachBaseline,
];

const reachV2Ranked: readonly RankedBenchmarkCandidateFixture[] = [
  reachRankedOf(1, orgSearch7Candidate, orgSearch7Evaluation),
  reachRankedOf(2, clip5Candidate, clip5Evaluation),
  reachRankedOf(3, remix2Candidate, remix2Evaluation),
  reachRankedOf(4, podcast1Candidate, podcast1Evaluation),
  reachBaseline,
];

const launchRanked: readonly RankedBenchmarkCandidateFixture[] = [
  launchRankedOf(1, teaser2Candidate, teaser2Evaluation),
  launchRankedOf(2, waitThenPostCandidate, waitThenPostEvaluation),
  launchBaseline,
];

// ——— record assembly ———

const recordOf = (
  input: {
    readonly id: LabBenchmarkIdFixture;
    readonly tenantId: TenantId;
    readonly scenario: LabScenario;
    readonly policy: RobustnessPolicyFixture;
    readonly seeds: readonly number[];
    readonly ranked: readonly RankedBenchmarkCandidateFixture[];
    readonly benchmarkedAt: Timestamp;
    readonly version: number;
    readonly citedCalibrationContext: RobustBenchmarkRecordFixture['citedCalibrationContext'];
  },
): RobustBenchmarkRecordFixture => {
  const noopBaseline = input.ranked.find(
    (entry) => entry.origin === 'no-op-baseline',
  ) as RankedBenchmarkCandidateFixture;
  return {
    id: input.id,
    tenantId: input.tenantId,
    scenarioRef: input.scenario.id as LabScenarioId,
    ranked: [...input.ranked],
    comparison: {
      noopBaseline,
      declared: input.ranked.filter((entry) => entry.origin !== 'no-op-baseline'),
    },
    policy: input.policy,
    seeds: [...input.seeds],
    fairness: {
      seeds: [...input.seeds],
      worldModelSet: input.policy.worldModelSet,
      policyId: input.policy.id,
      policyVersion: input.policy.version,
      rewardSpecVersion: 2,
      statement: BENCHMARK_FAIRNESS_STATEMENT,
    },
    provenance: {
      simulatorVersion: 4,
      corpusVersion: 6,
      rewardSpecVersion: 2,
      policyId: input.policy.id,
      policyVersion: input.policy.version,
      seeds: [...input.seeds],
      sweepDimensions: ['seed', 'world-model'],
      worldModels: WORLD_PINS,
    },
    benchmarkedAt: input.benchmarkedAt,
    counterfactual: true,
    disclosure: 'robust-benchmark-over-disclosed-synthetic-ensembles',
    labOnly: BENCHMARK_LAB_ONLY_STATEMENT,
    calibration: BENCHMARK_CALIBRATION_DECLARATION,
    citedCalibrationContext: input.citedCalibrationContext,
    version: input.version as never,
    resultDigest: digestOf(`${String(input.id)}-v${input.version}`),
    recordedAt: input.benchmarkedAt,
  };
};

/** bench-reach-v1 record v1 — three declared candidates + the baseline, OOD on clip-5. */
export const FIXTURE_BENCH_REACH_V1: RobustBenchmarkRecordFixture = recordOf({
  id: 'bench-reach-v1' as LabBenchmarkIdFixture,
  tenantId: 'tenant-demo' as TenantId,
  scenario: REACH_SCENARIO,
  policy: REACH_POLICY,
  seeds: REACH_SEEDS,
  ranked: reachV1Ranked,
  benchmarkedAt: asTimestamp('2026-07-02T09:15:00.000Z'),
  version: 1,
  citedCalibrationContext: null,
});

/** bench-reach-v1 record v2 — the closed loop: cites calibration context v1. */
export const FIXTURE_BENCH_REACH_V2: RobustBenchmarkRecordFixture = recordOf({
  id: 'bench-reach-v1' as LabBenchmarkIdFixture,
  tenantId: 'tenant-demo' as TenantId,
  scenario: REACH_SCENARIO,
  policy: REACH_POLICY,
  seeds: REACH_SEEDS,
  ranked: reachV2Ranked,
  benchmarkedAt: asTimestamp('2026-07-16T10:40:00.000Z'),
  version: 2,
  citedCalibrationContext: {
    version: 1,
    statement:
      'this benchmark run cites the DECLARED versioned LAB-018 calibration context derived from prior simulation-to-reality error records; the citation is provenance — it never rewrites any calibration or benchmark record and never implies calibrated output',
  },
});

/** bench-launch-v2 record v1 — worst-world-mean aggregation, 2 declared + baseline. */
export const FIXTURE_BENCH_LAUNCH_V1: RobustBenchmarkRecordFixture = recordOf({
  id: 'bench-launch-v2' as LabBenchmarkIdFixture,
  tenantId: 'tenant-demo' as TenantId,
  scenario: LAUNCH_SCENARIO,
  policy: LAUNCH_POLICY,
  seeds: LAUNCH_SEEDS,
  ranked: launchRanked,
  benchmarkedAt: asTimestamp('2026-07-09T14:05:00.000Z'),
  version: 1,
  citedCalibrationContext: null,
});

/** A record chain in ANOTHER tenant — never listed or leaked into tenant-demo (§31). */
export const FIXTURE_BENCH_OTHER_V1: RobustBenchmarkRecordFixture = {
  ...recordOf({
    id: 'bench-other-1' as LabBenchmarkIdFixture,
    tenantId: 'tenant-other' as TenantId,
    scenario: LAUNCH_SCENARIO,
    policy: LAUNCH_POLICY,
    seeds: LAUNCH_SEEDS,
    ranked: launchRanked,
    benchmarkedAt: asTimestamp('2026-07-11T08:20:00.000Z'),
    version: 1,
    citedCalibrationContext: null,
  }),
  resultDigest: digestOf('bench-other-1-v1'),
};

/** Every benchmark fixture record, in chain order. */
export const FIXTURE_BENCHMARK_RECORDS: readonly RobustBenchmarkRecordFixture[] = [
  FIXTURE_BENCH_REACH_V1,
  FIXTURE_BENCH_REACH_V2,
  FIXTURE_BENCH_LAUNCH_V1,
  FIXTURE_BENCH_OTHER_V1,
];

/** The scenarios the fixture records cite (id → scenario). */
export const FIXTURE_LAB_SCENARIOS: Readonly<Record<string, LabScenario>> = Object.freeze({
  [String(REACH_SCENARIO.id)]: REACH_SCENARIO,
  [String(LAUNCH_SCENARIO.id)]: LAUNCH_SCENARIO,
});
