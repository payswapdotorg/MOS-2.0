import type { TenantScope, Timestamp } from '@mos/contracts';
import type { EnsemblePort, WorldModelEnsemble } from '../contracts/ensemble.js';
import type { SocialWorldModelStore } from '../contracts/simulator.js';
import type { HistoricalObservationDraft } from '../contracts/time-machine.js';
import type { HistoricalObservationId } from '../contracts/evidence.js';
import type {
  CalibrationErrorFunctional,
  LabCalibrationId,
  RecordCalibrationErrorInput,
} from '../contracts/online-calibration.js';
import type { OnlineCalibrationPort } from '../contracts/online-calibration-port.js';
import type {
  MarketingBenchmarkPort,
} from '../contracts/robust-benchmark-port.js';
import { createInMemoryMarketingBenchmark } from '../adapters/in-memory-marketing-benchmark.js';
import { createInMemoryOnlineCalibration } from '../adapters/in-memory-online-calibration.js';
import {
  createInMemoryRealityObservationReader,
} from '../adapters/in-memory-reality-observation-reader.js';
import {
  benchmarkEnsembleStack,
  benchmarkId,
  benchmarkInput,
  benchmarkScope,
  reachRewardSpec,
  robustnessPolicy,
} from './w9a-benchmark-fixtures.js';
import { FIXED_NOW } from './w9a-benchmark-fixtures.js';
import { fullCoverage } from './w4a-lab-fixtures.js';

/**
 * INTERNAL W10-A test fixtures (LAB-018 online-calibration tests). NOT
 * exported from the package index — test scaffolding only, never
 * production surface.
 *
 * THE CALIBRATION LOOP (the closed loop under test): the REAL LAB-017
 * benchmark + the REAL LAB-018 calibration + the DISCLOSED reality reader
 * double, wired in BOTH directions — the calibration consumes the frozen
 * benchmark records through the benchmark reader seam, and the benchmark
 * validates DECLARED citations through the calibration's context reader
 * seam. The two-directional wiring needs ONE late-bound reference (the
 * calibration adapter holds a closure over the benchmark port variable,
 * assigned before any call reaches it) — the same shape the composition
 * root will wire.
 *
 * The fixture reality observations are `qualified-reach` measurements in
 * the benchmark scenario's niche/platform under ONE regime (`baseline`),
 * so the observed outcome under the one-term `reachRewardSpec` is the mean
 * observed reach — hand-checkable arithmetic against the no-op baseline's
 * structurally-zero prediction.
 */

export const CALIBRATION_TENANT = 'tenant-a';

/** The observation id factory used by every W10-A fixture. */
export const observationIdOf = (value: string): HistoricalObservationId =>
  `obs-${value}` as HistoricalObservationId;

/** One reality observation draft: a measured qualified-reach value. */
export const realityObservation = (
  id: string,
  reach: number,
  overrides: Partial<HistoricalObservationDraft> = {},
): HistoricalObservationDraft => ({
  id: observationIdOf(id),
  niche: 'sourdough-baking',
  platform: 'short-video',
  metrics: [{ metric: 'qualified-reach', value: reach, unit: 'people' }],
  observedAt: '2026-06-20T12:00:00.000Z' as Timestamp,
  sourceRefs: [`src://platform/analytics/${id}`],
  regime: 'baseline',
  ...overrides,
});

/** The standard reality basis: reach 100 + reach 200 → observed mean 150. */
export const STANDARD_REALITY_SEEDS = [
  realityObservation('reality-a', 100),
  realityObservation('reality-b', 200),
] as const;

/** The calibration chain id fixture. */
export const calibrationId = (value = 'calib-reach-v1'): LabCalibrationId =>
  value as LabCalibrationId;

/** The declared v1 error functional fixture. */
export const calibrationFunctional = (): CalibrationErrorFunctional => ({
  id: 'calib-signed-error-v1',
  version: 1,
  note: 'fixture-declared v1 functional: signed reality-minus-prediction error with interval containment',
});

/**
 * The standard calibration input: calibrate the benchmark's SYNTHESIZED
 * NO-OP BASELINE (structurally-zero prediction, [0, 0] interval) against
 * the standard reality basis (mean 150) — every error quantity is
 * hand-checkable: signed 150, absolute 150, relative 1, containment false.
 */
export const calibrationInput = (
  overrides: Partial<RecordCalibrationErrorInput> = {},
): RecordCalibrationErrorInput => ({
  scope: benchmarkScope(),
  calibrationId: calibrationId(),
  prediction: {
    benchmarkId: benchmarkId(),
    benchmarkVersion: 1,
    candidateKey: 'no-op-baseline',
  },
  observationRefs: [observationIdOf('reality-a'), observationIdOf('reality-b')],
  rewardSpec: reachRewardSpec(),
  functional: calibrationFunctional(),
  note: null,
  ...overrides,
});

/** The composed calibration loop (see the module docblock). */
export interface CalibrationLoopStack {
  readonly benchmark: MarketingBenchmarkPort;
  readonly calibration: OnlineCalibrationPort;
  readonly reality: ReturnType<typeof createInMemoryRealityObservationReader>;
  readonly ensemble: EnsemblePort;
  readonly primary: WorldModelEnsemble;
  readonly alternative: WorldModelEnsemble;
  /** The shared world-model store (tenant-scoped registration surface). */
  readonly worldModels: SocialWorldModelStore;
}

/** Wire the full calibration loop over the two-ensemble fixture world. */
export const calibrationLoop = async (
  seeds: readonly HistoricalObservationDraft[] = STANDARD_REALITY_SEEDS,
): Promise<CalibrationLoopStack> => {
  const stack = await benchmarkEnsembleStack();
  const reality = createInMemoryRealityObservationReader({
    seeds: seeds.map((draft) => ({ scope: benchmarkScope(), observation: draft })),
  });
  // The two-directional seam: the calibration's benchmark reader is a
  // late-bound closure (assigned before any call reaches it); the
  // benchmark's context reader is the calibration port itself.
  let benchmarkRef: MarketingBenchmarkPort | null = null;
  const calibration = createInMemoryOnlineCalibration({
    benchmark: {
      getBenchmarkRecord: (scope, id, version) =>
        (benchmarkRef as MarketingBenchmarkPort).getBenchmarkRecord(scope, id, version),
      resolveLatestBenchmarkRecord: (scope, id) =>
        (benchmarkRef as MarketingBenchmarkPort).resolveLatestBenchmarkRecord(scope, id),
    },
    reality,
    now: FIXED_NOW,
  });
  const benchmark = createInMemoryMarketingBenchmark({
    ensemble: stack.ensemble,
    calibrationContexts: calibration,
    now: FIXED_NOW,
  });
  benchmarkRef = benchmark;
  return {
    benchmark,
    calibration,
    reality,
    ensemble: stack.ensemble,
    primary: stack.primary,
    alternative: stack.alternative,
    worldModels: stack.worldModels,
  };
};

/** Run the standard fixture benchmark (append one record version). */
export const runFixtureBenchmark = async (
  benchmark: MarketingBenchmarkPort,
  overrides: Partial<Parameters<MarketingBenchmarkPort['runBenchmark']>[0]> = {},
): Promise<ReturnType<MarketingBenchmarkPort['runBenchmark']>> =>
  benchmark.runBenchmark(benchmarkInput(overrides));

/**
 * Run the standard fixture benchmark under a SECOND tenant scope — the
 * tenant-scoped registration pattern of robust-benchmark-tenant-provenance
 * .test.ts: the shared stores are tenant-scoped, so a foreign scope cannot
 * resolve tenant-a's fixture worlds and must register its OWN two-world
 * ensemble first, then run the SAME benchmark id in that scope (one record
 * version in that scope's own chain). The second tenant's prediction
 * statement differs (their own worlds) — the W10-A tenant-independence
 * tests assert the CALIBRATION store's scoping, never the prediction values.
 *
 * (W10-A recovery fix: the second attempt's delimiter-injection and
 * two-tenant tests declared cross-scope calibrations WITHOUT this setup and
 * correctly failed closed with unknown-benchmark / unknown-ensemble — the
 * adapters' tenant scoping is correct; the tests' setups were incomplete.)
 */
export const runFixtureBenchmarkInScope = async (
  loop: CalibrationLoopStack,
  scope: TenantScope,
  tag: string,
): Promise<ReturnType<MarketingBenchmarkPort['runBenchmark']>> => {
  const { worldModels, ensemble, benchmark } = loop;
  for (const draft of [
    {
      id: `world-${tag}-a` as never,
      niche: 'sourdough-baking',
      platform: 'short-video',
      state: { baseAudience: 15_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
      notes: `w10a ${tag} fixture world A`,
    },
    {
      id: `world-${tag}-b` as never,
      niche: 'sourdough-baking',
      platform: 'short-video',
      state: { baseAudience: 25_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
      notes: `w10a ${tag} fixture world B`,
    },
  ] as const) {
    const registered = await worldModels.registerWorldModel({ scope, worldModel: draft });
    if ('error' in registered) {
      throw new Error(`w10a ${tag} world registration failed: ${registered.error}`);
    }
  }
  const ensembleIdInScope = `ensemble-${tag}` as never;
  const registered = await ensemble.registerEnsemble({
    scope,
    ensemble: {
      id: ensembleIdInScope,
      niche: 'sourdough-baking',
      platform: 'short-video',
      members: [
        {
          id: `member-${tag}-a`,
          worldModelId: `world-${tag}-a` as never,
          worldModelVersion: 1,
          coverage: fullCoverage(),
          notes: null,
        },
        {
          id: `member-${tag}-b`,
          worldModelId: `world-${tag}-b` as never,
          worldModelVersion: 1,
          coverage: fullCoverage(),
          notes: null,
        },
      ],
      weightingPolicy: {
        id: `policy-${tag}`,
        version: 1,
        kind: 'uniform',
        note: `w10a ${tag} fixture uniform weighting`,
      },
      notes: `w10a ${tag} fixture ensemble`,
    },
  });
  if ('error' in registered) {
    throw new Error(`w10a ${tag} ensemble registration failed: ${registered.error}`);
  }
  return benchmark.runBenchmark(
    benchmarkInput({
      scope,
      policy: robustnessPolicy({
        id: `policy-${tag}`,
        worldModelSet: [{ ensembleId: ensembleIdInScope, ensembleVersion: 1, label: 'primary' }],
        sweepDimensions: ['seed'],
        note: `w10a ${tag} fixture policy over its own ensemble`,
      }),
    }),
  );
};

export { benchmarkId, benchmarkInput, benchmarkScope, reachRewardSpec, FIXED_NOW };
