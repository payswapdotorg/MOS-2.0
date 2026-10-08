import type { LabScenario, StrategyRef, TenantId, TenantScope } from '@mos/contracts';
import type { EnsembleMember, EnsemblePort, WorldModelEnsemble } from '../contracts/ensemble.js';
import type { SocialWorldModelDraft, SocialWorldModelStore } from '../contracts/simulator.js';
import type { SimulatorEnginePort } from '../contracts/simulator.js';
import type {
  BenchmarkCandidate,
  MarketingBenchmarkInput,
  RobustBenchmarkId,
  RobustnessPolicy,
} from '../contracts/robust-benchmark.js';
import {
  FIXED_NOW,
  contentCandidate,
  ensembleId,
  ensembleStack,
  fullCoverage,
  reachRewardSpec,
  scopeOf,
  scenarioOf,
} from './w4a-lab-fixtures.js';

/**
 * INTERNAL W9-A test fixtures (LAB-017 robust marketing benchmark tests).
 * NOT exported from the package index — test scaffolding only, never
 * production surface.
 *
 * The fixture WORLD-MODEL SET is two ensembles with DISJOINT member world
 * models: the primary ensemble (world-a 12k + world-b 24k — the W4-A
 * stack, member-b carrying the NARROW cadence coverage so cadence-5
 * candidates surface the OOD flag) and the alternative ensemble (world-c
 * 30k + world-d 12k, full coverage). The two ensembles' AGGREGATE means
 * differ structurally (18k vs 21k effective audience) so the cross-world
 * spread is structural and hand-checkable, while the per-world member
 * disagreement stays visible on both sides.
 */

export const BENCHMARK_TENANT = 'tenant-a';

export const benchmarkScope = (): TenantScope => scopeOf(BENCHMARK_TENANT);

export const foreignScope = (): TenantScope => scopeOf('tenant-b');

const strategyRefOf = (value: string): StrategyRef => value as StrategyRef;

export const benchmarkId = (value = 'bench-reach-v1'): RobustBenchmarkId =>
  value as RobustBenchmarkId;

export const ALT_ENSEMBLE_ID = ensembleId('ensemble-reach-alt');

const worldDraftC = (): SocialWorldModelDraft => ({
  id: 'world-c' as never,
  niche: 'sourdough-baking',
  platform: 'short-video',
  state: { baseAudience: 30_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
  notes: 'alt member C synthetic world (audience 30k)',
});

const worldDraftD = (): SocialWorldModelDraft => ({
  id: 'world-d' as never,
  niche: 'sourdough-baking',
  platform: 'short-video',
  state: { baseAudience: 12_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
  notes: 'alt member D synthetic world (audience 12k)',
});

const altMembers = (): readonly EnsembleMember[] => [
  {
    id: 'member-c',
    worldModelId: 'world-c' as never,
    worldModelVersion: 1,
    coverage: fullCoverage(),
    notes: null,
  },
  {
    id: 'member-d',
    worldModelId: 'world-d' as never,
    worldModelVersion: 1,
    coverage: fullCoverage(),
    notes: null,
  },
];

/**
 * The two-ensemble fixture world: the W4-A primary stack (world-a/world-b,
 * member-b with NARROW cadence coverage — the OOD seam) extended with the
 * alternative ensemble (world-c/world-d, full coverage).
 */
export const benchmarkEnsembleStack = async (): Promise<{
  readonly ensemble: EnsemblePort;
  readonly primary: WorldModelEnsemble;
  readonly alternative: WorldModelEnsemble;
  readonly worldModels: SocialWorldModelStore;
  readonly engine: SimulatorEnginePort;
}> => {
  const primaryStack = await ensembleStack();
  const worldModels = primaryStack.worldModels;
  for (const draft of [worldDraftC(), worldDraftD()]) {
    const registered = await worldModels.registerWorldModel({
      scope: scopeOf(BENCHMARK_TENANT),
      worldModel: draft,
    });
    if ('error' in registered) {
      throw new Error(`fixture alt world registration failed: ${registered.error}`);
    }
  }
  const alternative = await primaryStack.ensemble.registerEnsemble({
    scope: scopeOf(BENCHMARK_TENANT),
    ensemble: {
      id: ALT_ENSEMBLE_ID,
      niche: 'sourdough-baking',
      platform: 'short-video',
      members: altMembers(),
      weightingPolicy: {
        id: 'policy-uniform-alt',
        version: 1,
        kind: 'uniform',
        note: 'equal member weight on the alternative world set — an explicit declared choice',
      },
      notes: 'fixture alternative ensemble',
    },
  });
  if ('error' in alternative) {
    throw new Error(`fixture alt ensemble registration failed: ${alternative.error}`);
  }
  return {
    ensemble: primaryStack.ensemble,
    primary: primaryStack.registered,
    alternative,
    worldModels,
    engine: primaryStack.engine,
  };
};

/** The declared robustness policy fixture: 3 seeds × the two-ensemble world set. */
export const robustnessPolicy = (
  overrides: Partial<RobustnessPolicy> = {},
): RobustnessPolicy => ({
  id: 'policy-robust-reach',
  version: 1,
  seedBudget: 3,
  worldModelSet: [
    { ensembleId: ensembleId(), ensembleVersion: 1, label: 'primary' },
    { ensembleId: ALT_ENSEMBLE_ID, ensembleVersion: 1, label: 'pessimistic' },
  ],
  sweepDimensions: ['seed', 'world-model'],
  aggregation: 'pooled-mean',
  tieBreak: 'expected-desc-halfwidth-asc-key-asc',
  note: 'fixture policy: 3-seed sweep over the two-ensemble world set, pooled mean',
  ...overrides,
});

/** The fairness-pin seed fixture (exactly policy.seedBudget distinct seeds). */
export const BENCHMARK_SEEDS: readonly number[] = Object.freeze([11, 22, 33]);

const handDesignedSource = (note: string) => ({
  origin: 'hand-designed' as const,
  producerPins: [],
  note,
});

/** The alpha fixture candidate (cadence 5 — OUTSIDE member-b's narrow coverage). */
export const benchmarkCandidateAlpha = (
  overrides: Partial<BenchmarkCandidate> = {},
): BenchmarkCandidate => ({
  key: 'alpha',
  action: { ...contentCandidate },
  horizonSteps: 2,
  source: handDesignedSource('fixture hand-designed cadence-5 content candidate'),
  label: 'Alpha (cadence 5)',
  ...overrides,
});

/** The beta fixture candidate (cadence 2 — inside every declared coverage). */
export const benchmarkCandidateBeta = (
  overrides: Partial<BenchmarkCandidate> = {},
): BenchmarkCandidate => ({
  key: 'beta',
  action: {
    strategyRef: strategyRefOf('strategy-beta'),
    kind: 'content',
    cadencePerWeek: 2,
    novelty: 0.4,
    engagementEffort: 0.3,
  },
  horizonSteps: 2,
  source: handDesignedSource('fixture hand-designed cadence-2 content candidate'),
  label: 'Beta (cadence 2)',
  ...overrides,
});

/** A production-search-shaped fixture candidate (the declared action seam). */
export const benchmarkCandidateFromSearch = (
  overrides: Partial<BenchmarkCandidate> = {},
): BenchmarkCandidate => ({
  key: 'searched-1',
  action: {
    strategyRef: strategyRefOf('strategy:program-search-result-1'),
    kind: 'content',
    cadencePerWeek: 3,
    novelty: 0.5,
    engagementEffort: 0.2,
  },
  horizonSteps: 1,
  source: {
    origin: 'production-search',
    producerPins: [{ surface: 'production-program-search', version: 1 }],
    note: 'fixture candidate mirroring a LAB-016 program-search result flowing through the declared action seam',
  },
  label: 'Searched 1',
  ...overrides,
});

/** The standard benchmark run input fixture. */
export const benchmarkInput = (
  overrides: Partial<MarketingBenchmarkInput> = {},
): MarketingBenchmarkInput => ({
  scope: benchmarkScope(),
  benchmarkId: benchmarkId(),
  scenario: scenarioOf(),
  candidates: [benchmarkCandidateAlpha(), benchmarkCandidateBeta()],
  rewardSpec: reachRewardSpec(),
  policy: robustnessPolicy(),
  seeds: BENCHMARK_SEEDS,
  ...overrides,
});

/** The scenario fixture (re-exported for the record-side tests). */
export const benchmarkScenario = (overrides: Partial<LabScenario> = {}): LabScenario =>
  scenarioOf(overrides);

export { FIXED_NOW, reachRewardSpec, scenarioOf, scopeOf };

/** Coerces a tenant id (fixture helper). */
export const tenantOf = (value: string): TenantId => value as TenantId;
