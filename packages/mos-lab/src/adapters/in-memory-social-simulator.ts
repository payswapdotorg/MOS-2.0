import type { TenantScope, Timestamp, Version } from '@mos/contracts';
import type {
  RegisterWorldModelInput,
  SimulatedMetricDelta,
  SimulatorEnginePort,
  SimulatorError,
  SimulatorStepInput,
  SocialSimulationResult,
  SocialWorldModel,
  SocialWorldModelDraft,
  SocialWorldModelId,
  SocialWorldModelState,
  SocialWorldModelStore,
} from '../contracts/simulator.js';
import type { PredictedMetric, SimulationPredictionId } from '../contracts/evidence.js';
import {
  clamp01,
  createSeededRandom,
  deepFreeze,
  isFiniteNonNegative,
  isUnitInterval,
  mixStepSeed,
  predictionId,
  uncertaintyFor,
  validateStrategyActionCandidate,
} from './parametric-support.js';

/**
 * The synthetic simulator version this adapter implements. A `LabScenario`
 * pins the simulator version it was declared against; the engine rejects
 * scenarios declared against a different version (`simulator-version-
 * mismatch`) so runs stay reproducible.
 */
const SYNTHETIC_SIMULATOR_VERSION = 1 as Version;

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

const fail = (error: SimulatorError['error'], message: string): SimulatorError => ({
  error,
  message,
});

const isBlank = (value: string): boolean => value.trim().length === 0;

// ---------------------------------------------------------------------------
// In-memory world model store (append-only, disclosed scaffold)
// ---------------------------------------------------------------------------

/** Options for {@link createInMemorySocialWorldModelStore}. */
export interface InMemorySocialWorldModelStoreOptions {
  /** Injectable clock for deterministic `createdAt` stamps. */
  readonly now?: () => Timestamp;
}

/**
 * Build an in-memory {@link SocialWorldModelStore}.
 *
 * W3-A DISCLOSURE: ephemeral process-local scaffold (no durable persistence
 * — TL-owned). World model versions are APPEND-ONLY: registration appends
 * `worldModelVersion + 1` per id, prior versions stay retrievable, and every
 * stored record is deep-frozen. A durable adapter replaces this without
 * touching the port.
 */
export function createInMemorySocialWorldModelStore(
  options: InMemorySocialWorldModelStoreOptions = {},
): SocialWorldModelStore {
  const now = options.now ?? nowDefault;
  /** Version chains keyed by (tenant, world model id) — tenants never share a chain. */
  const chains = new Map<string, SocialWorldModel[]>();
  // W9-B: JSON array key — injective over the (tenant, id) tuple (the
  // W3-A hostile-id-factory class is unaliasable by construction).
  const chainKey = (scope: TenantScope, id: SocialWorldModelId): string =>
    JSON.stringify([scope.tenantId as string, id as string]);

  const validateDraft = (
    draft: SocialWorldModelDraft,
  ): SimulatorError | null => {
    if (isBlank(draft.id)) {
      return fail('invalid-input', 'world model id must be a non-empty string');
    }
    if (isBlank(draft.niche) || isBlank(draft.platform)) {
      return fail('invalid-input', 'world model niche and platform must be non-empty strings');
    }
    const state = draft.state;
    if (!isFiniteNonNegative(state.baseAudience)) {
      return fail('invalid-input', 'world state baseAudience must be a finite number >= 0');
    }
    if (!isUnitInterval(state.fatigue)) {
      return fail('invalid-input', 'world state fatigue must be a number in [0, 1]');
    }
    if (!isUnitInterval(state.competitorShare)) {
      return fail('invalid-input', 'world state competitorShare must be a number in [0, 1]');
    }
    if (typeof state.seasonalFactor !== 'number' || !Number.isFinite(state.seasonalFactor) || state.seasonalFactor <= 0) {
      return fail('invalid-input', 'world state seasonalFactor must be a finite number > 0');
    }
    return null;
  };

  const scoped = (scope: TenantScope, id: SocialWorldModelId): readonly SocialWorldModel[] =>
    chains.get(chainKey(scope, id)) ?? [];

  return {
    async registerWorldModel(input: RegisterWorldModelInput): Promise<SocialWorldModel | SimulatorError> {
      const invalid = validateDraft(input.worldModel);
      if (invalid !== null) {
        return invalid;
      }
      const key = chainKey(input.scope, input.worldModel.id);
      const chain = chains.get(key) ?? [];
      const nextVersion = (chain.length + 1) as Version;
      const record: SocialWorldModel = deepFreeze({
        id: input.worldModel.id,
        worldModelVersion: nextVersion,
        tenantId: input.scope.tenantId,
        niche: input.worldModel.niche,
        platform: input.worldModel.platform,
        state: input.worldModel.state,
        createdAt: now(),
        notes: input.worldModel.notes ?? null,
        disclosure: 'synthetic-parametric-world-model',
      });
      chain.push(record);
      chains.set(key, chain);
      return record;
    },

    async getWorldModel(scope, id, worldModelVersion): Promise<SocialWorldModel | null> {
      return (
        scoped(scope, id).find((model) => model.worldModelVersion === worldModelVersion) ?? null
      );
    },

    async resolveLatestWorldModel(scope, id): Promise<SocialWorldModel | null> {
      const visible = scoped(scope, id);
      return visible.length === 0 ? null : (visible[visible.length - 1] ?? null);
    },

    async listWorldModelVersions(scope, id): Promise<readonly SocialWorldModel[]> {
      return [...scoped(scope, id)];
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory simulator engine (DISCLOSED deterministic synthetic response function)
// ---------------------------------------------------------------------------

/** Options for {@link createInMemorySimulatorEngine}. */
export interface InMemorySimulatorEngineOptions {
  /** World model registry the engine resolves versions from. */
  readonly worldModels: Pick<
    SocialWorldModelStore,
    'getWorldModel' | 'resolveLatestWorldModel'
  >;
  /** Injectable clock for deterministic `predictedAt` stamps. */
  readonly now?: () => Timestamp;
}

/**
 * Build an in-memory {@link SimulatorEnginePort}.
 *
 * W3-A DISCLOSURE — THIS IS A SYNTHETIC RESPONSE FUNCTION, NOT A REAL
 * PLATFORM MODEL. The engine computes reach/engagement-style quantities from
 * a fully documented parametric response function with SEEDED noise
 * (mulberry32), exactly as follows — every coefficient is a disclosed model
 * choice, calibrated to nothing:
 *
 * ```
 * exposure          = clamp01(cadencePerWeek / 7)
 * effectiveNovelty  = novelty (repost kind: novelty * 0.5)
 * noveltyFactor     = 0.55 + 0.45 * effectiveNovelty        // [0.55, 1]
 * effortFactor      = 0.5 + 0.5 * engagementEffort           // [0.5, 1]
 * effectiveAudience = baseAudience * (1 - 0.7 * fatigue)
 * impressions       = cadencePerWeek * effectiveAudience * seasonalFactor
 * qualifiedReach    = impressions * noveltyFactor * (0.9 + 0.2 * u1)
 * engagements       = qualifiedReach * (0.03 + 0.07 * effortFactor)
 *                    * (0.85 + 0.3 * u2)
 * objectiveOutcome  = qualifiedReach * (0.02 + 0.06 * effortFactor * (1 - fatigue))
 * fatigueDelta      = 0.06 * exposure * (0.5 + 0.5 * effectiveNovelty) * (1 - fatigue)
 * audienceGrowth    = engagements * 0.012 * (1 - fatigue)
 * audienceDecay     = baseAudience * 0.01 * fatigue
 * competitorDrift   = (u3 - 0.5) * 0.02                       // seeded ±1%
 * ```
 *
 * `u1..u3` are seeded draws (u ∈ [0, 1)); the noise stream is derived from
 * `(seed, step)` so every step is independently reproducible. A `no-op`
 * candidate produces zero deltas and leaves the world state unchanged; a
 * `repost` carries damped novelty. Envelope half-widths are ±12% of the
 * expected value (deterministic; spec §22). The adapter is a pure function
 * of its inputs — same seed + same inputs → bit-identical results.
 */
export function createInMemorySimulatorEngine(
  options: InMemorySimulatorEngineOptions,
): SimulatorEnginePort {
  const now = options.now ?? nowDefault;

  const envelope = (expectedValue: number): { lower: number; upper: number } => {
    const halfWidth = Math.abs(expectedValue) * 0.12;
    return { lower: expectedValue - halfWidth, upper: expectedValue + halfWidth };
  };

  const predictedMetric = (
    metric: string,
    expectedValue: number,
    unit: string,
  ): PredictedMetric => ({
    metric,
    expectedValue,
    interval: envelope(expectedValue),
    unit,
  });

  return {
    async simulateStep(
      input: SimulatorStepInput,
    ): Promise<SocialSimulationResult | SimulatorError> {
      const candidateFault = validateStrategyActionCandidate(input.candidate);
      if (candidateFault !== null) {
        return fail('invalid-input', candidateFault);
      }
      if (typeof input.seed !== 'number' || !Number.isFinite(input.seed)) {
        return fail('invalid-input', 'seed is required and must be a finite number');
      }
      if (!Number.isInteger(input.step) || input.step < 0) {
        return fail('invalid-input', 'step must be an integer >= 0');
      }
      if (isBlank(input.scenario.objective)) {
        return fail('invalid-input', 'scenario.objective must be a non-empty string');
      }
      if (
        typeof input.scenario.informationLag !== 'number' ||
        !Number.isFinite(input.scenario.informationLag) ||
        input.scenario.informationLag < 0
      ) {
        return fail('invalid-input', 'scenario.informationLag must be a finite number >= 0');
      }

      const latest = await options.worldModels.resolveLatestWorldModel(
        input.scope,
        input.worldModelId,
      );
      if (latest === null) {
        return fail(
          'unknown-world-model',
          `no world model ${input.worldModelId} visible in this tenant scope`,
        );
      }
      const worldModel = await options.worldModels.getWorldModel(
        input.scope,
        input.worldModelId,
        input.worldModelVersion,
      );
      if (worldModel === null) {
        return fail(
          'world-model-version-not-found',
          `world model ${input.worldModelId} has no version ${input.worldModelVersion} in this tenant scope`,
        );
      }
      if (worldModel.niche !== input.scenario.niche || worldModel.platform !== input.scenario.platform) {
        return fail(
          'scenario-world-model-mismatch',
          `scenario (${input.scenario.niche}/${input.scenario.platform}) does not match world model ${input.worldModelId} v${input.worldModelVersion} (${worldModel.niche}/${worldModel.platform})`,
        );
      }
      if (input.scenario.simulatorVersion !== SYNTHETIC_SIMULATOR_VERSION) {
        return fail(
          'simulator-version-mismatch',
          `scenario pins simulatorVersion ${input.scenario.simulatorVersion}, this engine implements ${SYNTHETIC_SIMULATOR_VERSION}`,
        );
      }

      // ---- disclosed synthetic response function (see file docblock) ----
      const state = worldModel.state;
      const noop = input.candidate.kind === 'no-op';
      const effectiveNovelty =
        input.candidate.kind === 'repost' ? input.candidate.novelty * 0.5 : input.candidate.novelty;

      let nextWorldState: SocialWorldModelState;
      let qualifiedReach = 0;
      const metrics: PredictedMetric[] = [];
      const deltas: SimulatedMetricDelta[] = [];

      if (!noop) {
        const random = createSeededRandom(mixStepSeed(input.seed, input.step));
        const exposure = clamp01(input.candidate.cadencePerWeek / 7);
        const noveltyFactor = 0.55 + 0.45 * effectiveNovelty;
        const effortFactor = 0.5 + 0.5 * input.candidate.engagementEffort;
        const effectiveAudience = state.baseAudience * (1 - 0.7 * state.fatigue);
        const impressions = input.candidate.cadencePerWeek * effectiveAudience * state.seasonalFactor;
        qualifiedReach = impressions * noveltyFactor * (0.9 + 0.2 * random());
        const engagements =
          qualifiedReach * (0.03 + 0.07 * effortFactor) * (0.85 + 0.3 * random());
        const objectiveOutcome =
          qualifiedReach * (0.02 + 0.06 * effortFactor * (1 - state.fatigue));
        const fatigueDelta =
          0.06 * exposure * (0.5 + 0.5 * effectiveNovelty) * (1 - state.fatigue);
        const audienceGrowth = engagements * 0.012 * (1 - state.fatigue);
        const audienceDecay = state.baseAudience * 0.01 * state.fatigue;
        const competitorDrift = (random() - 0.5) * 0.02;

        const objectiveMetric = `objective:${input.scenario.objective}`;
        metrics.push(
          predictedMetric('qualified-reach', qualifiedReach, 'people'),
          predictedMetric('engagements', engagements, 'events'),
          predictedMetric(objectiveMetric, objectiveOutcome, 'outcome'),
        );
        deltas.push(
          { metric: 'qualified-reach', expectedDelta: qualifiedReach, interval: envelope(qualifiedReach), unit: 'people' },
          { metric: 'engagements', expectedDelta: engagements, interval: envelope(engagements), unit: 'events' },
          { metric: objectiveMetric, expectedDelta: objectiveOutcome, interval: envelope(objectiveOutcome), unit: 'outcome' },
          { metric: 'audience', expectedDelta: audienceGrowth - audienceDecay, interval: envelope(audienceGrowth - audienceDecay), unit: 'people' },
          { metric: 'fatigue', expectedDelta: fatigueDelta, interval: envelope(fatigueDelta), unit: 'share' },
        );
        nextWorldState = deepFreeze({
          baseAudience: Math.max(0, state.baseAudience + audienceGrowth - audienceDecay),
          fatigue: clamp01(state.fatigue + fatigueDelta),
          competitorShare: clamp01(state.competitorShare + competitorDrift),
          seasonalFactor: state.seasonalFactor,
          parameters: state.parameters,
        } satisfies SocialWorldModelState);
      } else {
        // no-op: zero activity, world state unchanged (first-class candidate).
        nextWorldState = state;
        metrics.push(
          predictedMetric('qualified-reach', 0, 'people'),
          predictedMetric('engagements', 0, 'events'),
          predictedMetric(`objective:${input.scenario.objective}`, 0, 'outcome'),
        );
        deltas.push(
          { metric: 'qualified-reach', expectedDelta: 0, interval: envelope(0), unit: 'people' },
          { metric: 'engagements', expectedDelta: 0, interval: envelope(0), unit: 'events' },
        );
      }

      const spreadNote =
        'deterministic synthetic response function output — NOT ground truth (§22); envelope ±12% of expected value';
      const uncertainty = uncertaintyFor(
        qualifiedReach,
        Math.abs(qualifiedReach) * 0.12,
        spreadNote,
      );

      const result: SocialSimulationResult = {
        id: predictionId('sim', [
          input.worldModelId,
          input.worldModelVersion,
          input.candidate.strategyRef,
          input.seed,
          input.step,
        ]) as SimulationPredictionId,
        version: 1 as Version,
        tenantId: input.scope.tenantId,
        scenarioRef: input.scenario.id,
        worldModelVersion: worldModel.worldModelVersion,
        simulatorVersion: SYNTHETIC_SIMULATOR_VERSION,
        strategyRef: input.candidate.strategyRef,
        seed: input.seed,
        step: input.step,
        metrics,
        predictedAt: now(),
        uncertainty,
        counterfactual: true,
        disclosure: 'synthetic-response-function',
        deltas,
        nextWorldState,
      };
      return deepFreeze(result);
    },
  };
}
