import type { TenantId, Timestamp, Version } from '@mos/contracts';
import type {
  DynamicsError,
  DynamicsModel,
  DynamicsModelDraft,
  DynamicsModelId,
  DynamicsModelStore,
  DynamicsSegmentState,
  DynamicsState,
  DynamicsStepInput,
  DynamicsStepPort,
  DynamicsStepResult,
  PopulationSegment,
  RegisterDynamicsModelInput,
} from '../contracts/dynamics.js';
import type {
  PredictedMetric,
  SimulationPredictionId,
} from '../contracts/evidence.js';
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

/** The synthetic dynamics simulator version this adapter implements. */
const SYNTHETIC_DYNAMICS_VERSION = 1 as Version;

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

const fail = (error: DynamicsError['error'], message: string): DynamicsError => ({
  error,
  message,
});

const isBlank = (value: string): boolean => value.trim().length === 0;

// ---------------------------------------------------------------------------
// In-memory dynamics model store (append-only, disclosed scaffold)
// ---------------------------------------------------------------------------

/** Options for {@link createInMemoryDynamicsModelStore}. */
export interface InMemoryDynamicsModelStoreOptions {
  /** Injectable clock for deterministic `createdAt` stamps. */
  readonly now?: () => Timestamp;
}

const validateSegment = (
  segment: PopulationSegment,
  index: number,
): string | null => {
  const where = `populations[${index}] (${segment.id || 'unnamed'})`;
  if (isBlank(segment.id)) {
    return `${where}: segment id must be a non-empty string`;
  }
  if (isBlank(segment.label)) {
    return `${where}: segment label must be a non-empty string`;
  }
  if (
    segment.kind !== 'user-archetype' &&
    segment.kind !== 'creator-archetype' &&
    segment.kind !== 'competitor-profile'
  ) {
    return `${where}: kind must be user-archetype | creator-archetype | competitor-profile`;
  }
  if (typeof segment.share !== 'number' || !Number.isFinite(segment.share) || segment.share <= 0 || segment.share > 1) {
    return `${where}: share must be a number in (0, 1]`;
  }
  if (!isUnitInterval(segment.fatigueSensitivity)) {
    return `${where}: fatigueSensitivity must be a number in [0, 1]`;
  }
  if (!isUnitInterval(segment.noveltySeeking)) {
    return `${where}: noveltySeeking must be a number in [0, 1]`;
  }
  if (!isUnitInterval(segment.engagementPropensity)) {
    return `${where}: engagementPropensity must be a number in [0, 1]`;
  }
  if (segment.kind === 'competitor-profile') {
    if (segment.aggressiveness === undefined || !isUnitInterval(segment.aggressiveness)) {
      return `${where}: competitor profiles must carry aggressiveness in [0, 1]`;
    }
  } else if (segment.aggressiveness !== undefined) {
    return `${where}: only competitor profiles may carry aggressiveness`;
  }
  return null;
};

/**
 * Build an in-memory {@link DynamicsModelStore}.
 *
 * W3-A DISCLOSURE: ephemeral process-local scaffold (durable persistence is
 * TL-owned). Model versions are APPEND-ONLY (`version + 1` per id, prior
 * versions retrievable, records deep-frozen).
 */
export function createInMemoryDynamicsModelStore(
  options: InMemoryDynamicsModelStoreOptions = {},
): DynamicsModelStore {
  const now = options.now ?? nowDefault;
  /** Version chains keyed by (tenant, dynamics model id) — tenants never share a chain. */
  const chains = new Map<string, DynamicsModel[]>();
  const chainKey = (tenantId: TenantId, id: DynamicsModelId): string =>
    `${tenantId}\u0000${id}`;

  const scoped = (tenantId: TenantId, id: DynamicsModelId): readonly DynamicsModel[] =>
    chains.get(chainKey(tenantId, id)) ?? [];

  return {
    async registerDynamicsModel(
      input: RegisterDynamicsModelInput,
    ): Promise<DynamicsModel | DynamicsError> {
      const draft: DynamicsModelDraft = input.dynamicsModel;
      if (isBlank(draft.id)) {
        return fail('invalid-input', 'dynamics model id must be a non-empty string');
      }
      if (isBlank(draft.niche) || isBlank(draft.platform)) {
        return fail('invalid-input', 'dynamics model niche and platform must be non-empty strings');
      }
      if (!Array.isArray(draft.populations) || draft.populations.length === 0) {
        return fail('invalid-input', 'dynamics model must carry at least one population segment');
      }
      const seenIds = new Set<string>();
      for (let index = 0; index < draft.populations.length; index += 1) {
        const segmentFault = validateSegment(draft.populations[index], index);
        if (segmentFault !== null) {
          return fail('invalid-input', segmentFault);
        }
        const segmentId = draft.populations[index].id;
        if (seenIds.has(segmentId)) {
          return fail('invalid-input', `duplicate population segment id: ${segmentId}`);
        }
        seenIds.add(segmentId);
      }
      const key = chainKey(input.scope.tenantId, draft.id);
      const chain = chains.get(key) ?? [];
      const record: DynamicsModel = deepFreeze({
        id: draft.id,
        version: (chain.length + 1) as Version,
        tenantId: input.scope.tenantId,
        niche: draft.niche,
        platform: draft.platform,
        populations: draft.populations,
        createdAt: now(),
        notes: draft.notes ?? null,
        disclosure: 'synthetic-parametric-dynamics-model',
      });
      chain.push(record);
      chains.set(key, chain);
      return record;
    },

    async getDynamicsModel(scope, id, version): Promise<DynamicsModel | null> {
      return scoped(scope.tenantId, id).find((model) => model.version === version) ?? null;
    },

    async listDynamicsModelVersions(scope, id): Promise<readonly DynamicsModel[]> {
      return [...scoped(scope.tenantId, id)];
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory dynamics stepper (DISCLOSED deterministic synthetic parametric model)
// ---------------------------------------------------------------------------

/** Options for {@link createInMemoryDynamicsStepper}. */
export interface InMemoryDynamicsStepperOptions {
  /** Injectable clock for deterministic `predictedAt` stamps. */
  readonly now?: () => Timestamp;
}

/**
 * Build an in-memory {@link DynamicsStepPort}.
 *
 * W3-A DISCLOSURE — THIS IS A SYNTHETIC PARAMETRIC POPULATION MODEL, NOT A
 * MODEL OF A REAL POPULATION. The step computes fatigue accumulation,
 * audience growth/decay, novelty effects and competitive displacement from
 * documented parametric equations with SEEDED noise (mulberry32 over
 * `(seed, step)`):
 *
 * ```
 * exposure           = clamp01(cadencePerWeek / 7)
 * effectiveNovelty   = novelty (repost kind: novelty * 0.5)
 * segmentFatigueΔ_i  = fs_i * exposure * (0.5 + 0.5 * effectiveNovelty)
 *                      * (1 - fatigue_i)              // >= 0, always
 * noveltyEffect      = (effectiveNovelty - 0.5) * Σ share_i * ns_i
 * growth             = audienceSize * exposure * Σ share_i * ep_i
 *                      * (1 - fatigue_i) * 0.02 * (0.9 + 0.2 * u1)
 * decay              = audienceSize * 0.01 * Σ share_i * fatigue_i
 * competitorPressure = Σ_competitor share_c * aggressiveness_c
 * displacement       = audienceSize * competitorShare * competitorPressure
 *                      * (1 - 0.5 * engagementEffort) * 0.02 * (0.9 + 0.2 * u2)
 * competitorDrift    = 0.01 * (competitorPressure * (1 - engagementEffort)
 *                      - 0.5 * engagementEffort * exposure)
 * ```
 *
 * Fatigue is NON-DECREASING by construction (every segment fatigue delta is
 * a product of non-negative terms; no recovery term is modeled). A `no-op`
 * candidate adds zero fatigue and zero growth, but decay and competitor
 * drift still apply — inaction has modeled consequences. Envelope
 * half-widths are ±12% of the expected value (spec §22). Pure function of
 * its inputs: same seed + same inputs → bit-identical results.
 */
export function createInMemoryDynamicsStepper(
  options: InMemoryDynamicsStepperOptions = {},
): DynamicsStepPort {
  const now = options.now ?? nowDefault;

  const envelope = (expectedValue: number): { lower: number; upper: number } => {
    const halfWidth = Math.abs(expectedValue) * 0.12;
    return { lower: expectedValue - halfWidth, upper: expectedValue + halfWidth };
  };

  const metric = (name: string, expectedValue: number, unit: string): PredictedMetric => ({
    metric: name,
    expectedValue,
    interval: envelope(expectedValue),
    unit,
  });

  const validateState = (
    input: DynamicsStepInput,
  ): DynamicsError | null => {
    const state = input.state;
    if (!isFiniteNonNegative(state.audienceSize)) {
      return fail('invalid-input', 'state.audienceSize must be a finite number >= 0');
    }
    if (!isUnitInterval(state.competitorShare)) {
      return fail('invalid-input', 'state.competitorShare must be a number in [0, 1]');
    }
    if (!Number.isInteger(state.step) || state.step < 0) {
      return fail('invalid-input', 'state.step must be an integer >= 0');
    }
    if (state.step !== input.step) {
      return fail('invalid-input', `input step ${input.step} does not match state.step ${state.step}`);
    }
    const modelIds = input.dynamicsModel.populations.map((segment) => segment.id).sort();
    const stateIds = state.segmentStates.map((segment) => segment.segmentId).sort();
    if (modelIds.length !== stateIds.length || modelIds.some((id, i) => id !== stateIds[i])) {
      return fail(
        'state-segment-mismatch',
        'state segment ids must match the dynamics model populations exactly',
      );
    }
    for (const segment of state.segmentStates) {
      if (!isUnitInterval(segment.fatigue) || !isUnitInterval(segment.affinity)) {
        return fail(
          'invalid-input',
          `segment ${segment.segmentId}: fatigue and affinity must be numbers in [0, 1]`,
        );
      }
    }
    return null;
  };

  return {
    async step(input: DynamicsStepInput): Promise<DynamicsStepResult | DynamicsError> {
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
      if (input.scenario.simulatorVersion !== SYNTHETIC_DYNAMICS_VERSION) {
        return fail(
          'simulator-version-mismatch',
          `scenario pins simulatorVersion ${input.scenario.simulatorVersion}, this dynamics engine implements ${SYNTHETIC_DYNAMICS_VERSION}`,
        );
      }
      const stateFault = validateState(input);
      if (stateFault !== null) {
        return stateFault;
      }

      // ---- disclosed synthetic population dynamics (see file docblock) ----
      const populations = input.dynamicsModel.populations;
      const audienceSegments = populations.filter(
        (segment) => segment.kind !== 'competitor-profile',
      );
      const competitorSegments = populations.filter(
        (segment) => segment.kind === 'competitor-profile',
      );
      const fatigueBySegment = new Map<string, number>(
        input.state.segmentStates.map((segment) => [segment.segmentId, segment.fatigue]),
      );
      const affinityBySegment = new Map<string, number>(
        input.state.segmentStates.map((segment) => [segment.segmentId, segment.affinity]),
      );
      const random = createSeededRandom(mixStepSeed(input.seed, input.step));

      const exposure = clamp01(input.candidate.cadencePerWeek / 7);
      const effectiveNovelty =
        input.candidate.kind === 'repost' ? input.candidate.novelty * 0.5 : input.candidate.novelty;
      const noop = input.candidate.kind === 'no-op';

      const segmentFatigueDeltas = new Map<string, number>();
      if (!noop) {
        for (const segment of audienceSegments) {
          const fatigue = fatigueBySegment.get(segment.id) ?? 0;
          const delta =
            segment.fatigueSensitivity *
            exposure *
            (0.5 + 0.5 * effectiveNovelty) *
            (1 - fatigue);
          segmentFatigueDeltas.set(segment.id, delta);
        }
      }

      const noveltyEffect =
        (effectiveNovelty - 0.5) *
        audienceSegments.reduce((sum, segment) => sum + segment.share * segment.noveltySeeking, 0);

      const growth = noop
        ? 0
        : input.state.audienceSize *
          exposure *
          audienceSegments.reduce(
            (sum, segment) =>
              sum + segment.share * segment.engagementPropensity * (1 - (fatigueBySegment.get(segment.id) ?? 0)),
            0,
          ) *
          0.02 *
          (0.9 + 0.2 * random());

      const decay =
        input.state.audienceSize *
        0.01 *
        audienceSegments.reduce(
          (sum, segment) => sum + segment.share * (fatigueBySegment.get(segment.id) ?? 0),
          0,
        );

      const competitorPressure = competitorSegments.reduce(
        (sum, segment) => sum + segment.share * (segment.aggressiveness ?? 0),
        0,
      );
      const displacement =
        input.state.audienceSize *
        input.state.competitorShare *
        competitorPressure *
        (1 - 0.5 * input.candidate.engagementEffort) *
        0.02 *
        (0.9 + 0.2 * random());
      const competitorDrift =
        0.01 *
        (competitorPressure * (1 - input.candidate.engagementEffort) -
          0.5 * input.candidate.engagementEffort * exposure);

      const nextSegmentStates: DynamicsSegmentState[] = populations.map((segment) => {
        const fatigue = fatigueBySegment.get(segment.id) ?? 0;
        const affinity = affinityBySegment.get(segment.id) ?? 0;
        const fatigueDelta = segmentFatigueDeltas.get(segment.id) ?? 0;
        const affinityDelta = noop
          ? 0
          : 0.02 * exposure * segment.engagementPropensity * (0.9 + 0.2 * random());
        return {
          segmentId: segment.id,
          fatigue: clamp01(fatigue + fatigueDelta),
          affinity: clamp01(affinity + affinityDelta),
        };
      });

      const audienceDelta = growth - decay - displacement;
      const nextState: DynamicsState = deepFreeze({
        audienceSize: Math.max(0, input.state.audienceSize + audienceDelta),
        segmentStates: nextSegmentStates,
        competitorShare: clamp01(input.state.competitorShare + competitorDrift),
        step: input.step + 1,
      } satisfies DynamicsState);

      const fatigueDeltaTotal = [...segmentFatigueDeltas.values()].reduce(
        (sum, delta) => sum + delta,
        0,
      );
      const avgFatigueNext = nextSegmentStates.reduce(
        (sum, segment, index) =>
          sum + (populations[index]?.share ?? 0) * segment.fatigue,
        0,
      );

      const metrics: readonly PredictedMetric[] = [
        metric('audience', nextState.audienceSize, 'people'),
        metric('audience-delta', audienceDelta, 'people'),
        metric('fatigue', avgFatigueNext, 'share'),
        metric('competitor-share', nextState.competitorShare, 'share'),
      ];

      const spreadNote =
        'deterministic synthetic population dynamics — NOT ground truth (§22); envelope ±12% of expected value';
      const uncertainty = uncertaintyFor(
        nextState.audienceSize,
        Math.abs(nextState.audienceSize) * 0.12,
        spreadNote,
      );

      const result: DynamicsStepResult = {
        id: predictionId('dyn', [
          input.dynamicsModel.id,
          input.dynamicsModel.version,
          input.candidate.strategyRef,
          input.seed,
          input.step,
        ]) as SimulationPredictionId,
        version: 1 as Version,
        tenantId: input.scope.tenantId,
        scenarioRef: input.scenario.id,
        worldModelVersion: input.dynamicsModel.version,
        simulatorVersion: SYNTHETIC_DYNAMICS_VERSION,
        strategyRef: input.candidate.strategyRef,
        seed: input.seed,
        step: input.step,
        metrics,
        predictedAt: now(),
        uncertainty,
        counterfactual: true,
        disclosure: 'synthetic-response-function',
        nextState,
        response: {
          audienceDelta,
          fatigueDelta: fatigueDeltaTotal,
          competitiveDisplacement: displacement,
          noveltyEffect,
        },
      };
      return deepFreeze(result);
    },
  };
}
