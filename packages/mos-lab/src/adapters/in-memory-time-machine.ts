import type { TenantScope, Timestamp, Version } from '@mos/contracts';
import type {
  AppendHistoricalObservationInput,
  BranchRecordId,
  CounterfactualBranch,
  CounterfactualBranchRecord,
  CreateBranchInput,
  DelayedInformationQuery,
  HistoricalObservationDraft,
  HistoricalTimelineQuery,
  RecordBranchPredictionInput,
  TimeMachineBranchId,
  TimeMachineError,
  TimeMachineIntervention,
  TimeMachinePort,
} from '../contracts/time-machine.js';
import type {
  HistoricalObservation,
  HistoricalObservationId,
} from '../contracts/evidence.js';
import { deepFreeze } from './parametric-support.js';

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

const fail = (error: TimeMachineError['error'], message: string): TimeMachineError => ({
  error,
  message,
});

const isBlank = (value: string): boolean => value.trim().length === 0;

/** Parse an ISO-8601 timestamp to epoch milliseconds, or `null` when malformed. */
const epochMs = (value: string): number | null => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

/** Options for {@link createInMemoryTimeMachine}. */
export interface InMemoryTimeMachineOptions {
  /** Injectable clock for deterministic `createdAt`/`recordedAt` stamps. */
  readonly now?: () => Timestamp;
  /**
   * Injectable NEW-branch-id factory (mode 3 assigns the branch id). The
   * default mints `cf-branch-<n>` in creation order per machine instance.
   */
  readonly nextBranchId?: () => TimeMachineBranchId;
}

/**
 * Build an in-memory {@link TimeMachinePort} — the LAB-006 Time Machine with
 * the three §20 modes.
 *
 * W3-A DISCLOSURE: ephemeral process-local scaffold (durable persistence is
 * TL-owned). Availability semantics: an observation is "available by X" iff
 * `observedAt <= X` — a durable adapter may tighten this with an ingestion
 * ledger (append-time availability); that refinement changes no port shape.
 *
 * GUARANTEES (all test-pinned):
 * - MODE 1 serves strictly `observedAt <= T`;
 * - MODE 2 serves strictly `observedAt <= T - L` — never newer (lock rule 30);
 * - the historical timeline is APPEND-ONLY and immutable: no port method can
 *   rewrite or remove history, appended records are deep-frozen, and
 *   duplicate ids are rejected;
 * - MODE 3 branches are counterfactual by construction and isolated: branch
 *   records never enter the timeline, other branches, or replay results;
 * - branch records re-validate `counterfactual === true` at runtime, so even
 *   a double-cast caller cannot smuggle historical evidence into a branch
 *   (lock rule 29).
 */
export function createInMemoryTimeMachine(
  options: InMemoryTimeMachineOptions = {},
): TimeMachinePort {
  const now = options.now ?? nowDefault;
  let branchCounter = 0;
  const nextBranchId =
    options.nextBranchId ??
    (() => `cf-branch-${(branchCounter += 1)}` as TimeMachineBranchId);
  let recordCounter = 0;

  /** Tenant timeline: id → record, plus append order for stable listing. */
  const timelines = new Map<string, Map<HistoricalObservationId, HistoricalObservation>>();
  /** Tenant branch registry: branch id → branch, plus creation order. */
  const branches = new Map<string, Map<TimeMachineBranchId, CounterfactualBranch>>();
  const branchOrder = new Map<string, TimeMachineBranchId[]>();
  /** Branch records per branch id (tenant-checked through the branch). */
  const branchRecords = new Map<TimeMachineBranchId, CounterfactualBranchRecord[]>();

  const timelineOf = (scope: TenantScope): Map<HistoricalObservationId, HistoricalObservation> =>
    timelines.get(scope.tenantId) ?? new Map();

  const registryOf = (scope: TenantScope): Map<TimeMachineBranchId, CounterfactualBranch> =>
    branches.get(scope.tenantId) ?? new Map();

  const validateDraft = (draft: HistoricalObservationDraft): string | null => {
    if (isBlank(draft.id)) {
      return 'observation id must be a non-empty string';
    }
    if (isBlank(draft.niche) || isBlank(draft.platform)) {
      return 'observation niche and platform must be non-empty strings';
    }
    if (!Array.isArray(draft.metrics) || draft.metrics.length === 0) {
      return 'observation must carry at least one metric';
    }
    for (const metric of draft.metrics) {
      if (isBlank(metric.metric) || isBlank(metric.unit)) {
        return 'observation metric names and units must be non-empty strings';
      }
      if (typeof metric.value !== 'number' || !Number.isFinite(metric.value)) {
        return `observation metric ${metric.metric}: value must be a finite number`;
      }
    }
    if (epochMs(draft.observedAt) === null) {
      return 'observation observedAt must be an ISO-8601 timestamp';
    }
    if (!Array.isArray(draft.sourceRefs) || draft.sourceRefs.length === 0) {
      return 'observation must carry at least one source ref';
    }
    for (const ref of draft.sourceRefs) {
      if (isBlank(ref)) {
        return 'observation source refs must be non-empty strings';
      }
    }
    if (draft.regime !== undefined && isBlank(draft.regime)) {
      return 'observation regime, when present, must be a non-empty string';
    }
    return null;
  };

  const validateIntervention = (intervention: TimeMachineIntervention): string | null => {
    if (intervention === null || typeof intervention !== 'object') {
      return 'intervention must be an object';
    }
    if (isBlank(intervention.description)) {
      return 'intervention.description must be a non-empty string';
    }
    if (
      intervention.changedParameters === null ||
      typeof intervention.changedParameters !== 'object' ||
      Array.isArray(intervention.changedParameters)
    ) {
      return 'intervention.changedParameters must be a JSON object';
    }
    return null;
  };

  const validateQuery = (query: HistoricalTimelineQuery): string | null => {
    if (epochMs(query.asOf) === null) {
      return 'query.asOf must be an ISO-8601 timestamp';
    }
    if (query.niche !== undefined && isBlank(query.niche)) {
      return 'query.niche, when present, must be a non-empty string';
    }
    if (query.platform !== undefined && isBlank(query.platform)) {
      return 'query.platform, when present, must be a non-empty string';
    }
    if (
      query.limit !== undefined &&
      (!Number.isInteger(query.limit) || query.limit <= 0)
    ) {
      return 'query.limit, when present, must be a positive integer';
    }
    return null;
  };

  /** Shared replay core: observations visible at `cutoffEpochMs`, ascending. */
  const replayAt = (
    scope: TenantScope,
    query: HistoricalTimelineQuery,
    cutoffEpochMs: number,
  ): readonly HistoricalObservation[] => {
    const visible = [...timelineOf(scope).values()]
      .filter((observation) => {
        const observed = epochMs(observation.observedAt);
        return (
          observed !== null &&
          observed <= cutoffEpochMs &&
          (query.niche === undefined || observation.niche === query.niche) &&
          (query.platform === undefined || observation.platform === query.platform)
        );
      })
      .sort((a, b) => {
        const at = epochMs(a.observedAt) ?? 0;
        const bt = epochMs(b.observedAt) ?? 0;
        return at !== bt ? at - bt : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
    return query.limit === undefined ? visible : visible.slice(0, query.limit);
  };

  return {
    async appendHistoricalObservation(
      input: AppendHistoricalObservationInput,
    ): Promise<HistoricalObservation | TimeMachineError> {
      const fault = validateDraft(input.observation);
      if (fault !== null) {
        return fail('invalid-input', fault);
      }
      let timeline = timelines.get(input.scope.tenantId);
      if (timeline === undefined) {
        timeline = new Map();
        timelines.set(input.scope.tenantId, timeline);
      }
      if (timeline.has(input.observation.id)) {
        return fail(
          'duplicate-observation',
          `historical observation ${input.observation.id} already exists in the timeline (append-only: rewrite is forbidden)`,
        );
      }
      const record: HistoricalObservation = deepFreeze({
        id: input.observation.id,
        version: 1 as Version,
        tenantId: input.scope.tenantId,
        niche: input.observation.niche,
        platform: input.observation.platform,
        metrics: input.observation.metrics,
        observedAt: input.observation.observedAt,
        sourceRefs: input.observation.sourceRefs,
        regime: input.observation.regime,
        counterfactual: false,
      });
      timeline.set(input.observation.id, record);
      return record;
    },

    async replayHistorical(
      scope: TenantScope,
      query: HistoricalTimelineQuery,
    ): Promise<readonly HistoricalObservation[] | TimeMachineError> {
      const fault = validateQuery(query);
      if (fault !== null) {
        return fail('invalid-input', fault);
      }
      // MODE 1: strictly observations with observedAt <= T.
      return replayAt(scope, query, epochMs(query.asOf) as number);
    },

    async replayDelayedInformation(
      scope: TenantScope,
      query: DelayedInformationQuery,
    ): Promise<readonly HistoricalObservation[] | TimeMachineError> {
      if (typeof query.lagMs !== 'number' || !Number.isFinite(query.lagMs) || query.lagMs < 0) {
        return fail('invalid-input', 'query.lagMs must be a finite number >= 0');
      }
      const fault = validateQuery(query);
      if (fault !== null) {
        return fail('invalid-input', fault);
      }
      // MODE 2 (lock rule 30): at T under lag L the agent sees ONLY
      // information available by T-L — records newer than T-L are never
      // visible, regardless of append order.
      const cutoff = (epochMs(query.asOf) as number) - query.lagMs;
      return replayAt(scope, query, cutoff);
    },

    async createBranch(
      input: CreateBranchInput,
    ): Promise<CounterfactualBranch | TimeMachineError> {
      const interventionFault = validateIntervention(input.intervention);
      if (interventionFault !== null) {
        return fail('invalid-input', interventionFault);
      }
      if (epochMs(input.forkPoint) === null) {
        return fail('invalid-input', 'forkPoint must be an ISO-8601 timestamp');
      }
      if (input.label !== undefined && input.label !== null && isBlank(input.label)) {
        return fail('invalid-input', 'label, when present, must be a non-empty string or null');
      }
      let registry = branches.get(input.scope.tenantId);
      if (registry === undefined) {
        registry = new Map();
        branches.set(input.scope.tenantId, registry);
        branchOrder.set(input.scope.tenantId, []);
      }
      if (
        input.parentBranchId !== undefined &&
        !registry.has(input.parentBranchId)
      ) {
        return fail(
          'unknown-branch',
          `parent branch ${input.parentBranchId} does not resolve in this tenant scope`,
        );
      }
      const id = nextBranchId();
      if (registry.has(id)) {
        return fail('invalid-input', `branch id factory produced a duplicate id: ${id}`);
      }
      const branch: CounterfactualBranch = deepFreeze({
        id,
        version: 1 as Version,
        tenantId: input.scope.tenantId,
        parentBranchId: input.parentBranchId ?? null,
        forkPoint: input.forkPoint,
        intervention: input.intervention,
        label: input.label ?? null,
        createdAt: now(),
        counterfactual: true,
      });
      registry.set(id, branch);
      branchOrder.get(input.scope.tenantId)?.push(id);
      return branch;
    },

    async getBranch(
      scope: TenantScope,
      branchId: TimeMachineBranchId,
    ): Promise<CounterfactualBranch | null> {
      // Unknown and cross-tenant are indistinguishable: no existence leak.
      return registryOf(scope).get(branchId) ?? null;
    },

    async listBranches(
      scope: TenantScope,
    ): Promise<readonly CounterfactualBranch[]> {
      const registry = registryOf(scope);
      return (branchOrder.get(scope.tenantId) ?? [])
        .map((id) => registry.get(id))
        .filter((branch): branch is CounterfactualBranch => branch !== undefined);
    },

    async recordBranchPrediction(
      input: RecordBranchPredictionInput,
    ): Promise<CounterfactualBranchRecord | TimeMachineError> {
      const branch = registryOf(input.scope).get(input.branchId);
      if (branch === undefined) {
        return fail(
          'unknown-branch',
          `branch ${input.branchId} does not resolve in this tenant scope`,
        );
      }
      if (input.prediction === null || typeof input.prediction !== 'object') {
        return fail('invalid-input', 'prediction must be a SimulationPrediction record');
      }
      // LOCK RULE 29 runtime re-validation — even a double-cast caller cannot
      // smuggle a non-counterfactual record into a counterfactual branch.
      if (input.prediction.counterfactual !== true) {
        return fail(
          'prediction-not-counterfactual',
          'only counterfactual SimulationPrediction records may enter a branch (historical evidence is never branch content)',
        );
      }
      if (input.prediction.tenantId !== input.scope.tenantId) {
        return fail(
          'prediction-tenant-mismatch',
          'prediction belongs to a different tenant than the branch scope',
        );
      }
      if (isBlank(input.prediction.id)) {
        return fail('invalid-input', 'prediction.id must be a non-empty string');
      }
      recordCounter += 1;
      const record: CounterfactualBranchRecord = deepFreeze({
        id: `cf-record-${input.branchId}-${recordCounter}` as BranchRecordId,
        branchId: input.branchId,
        prediction: input.prediction,
        recordedAt: now(),
        counterfactual: true,
      });
      const records = branchRecords.get(input.branchId) ?? [];
      records.push(record);
      branchRecords.set(input.branchId, records);
      return record;
    },

    async getBranchRecords(
      scope: TenantScope,
      branchId: TimeMachineBranchId,
    ): Promise<readonly CounterfactualBranchRecord[] | TimeMachineError> {
      if (!registryOf(scope).has(branchId)) {
        return fail(
          'unknown-branch',
          `branch ${branchId} does not resolve in this tenant scope`,
        );
      }
      return [...(branchRecords.get(branchId) ?? [])];
    },
  };
}
