import type { TenantId, TenantScope, Timestamp } from '@mos/contracts';

/**
 * Lab simulator & Time Machine view port (UX-003, over LAB-004 + LAB-005
 * + LAB-006).
 *
 * The Lab workspace's Simulator & Time Machine section: the versioned
 * social world models (LAB-004), the population-resolved dynamics models
 * (LAB-005), the deterministic seed-required simulation runs (LAB-004
 * results — every predicted metric WITH its §22 uncertainty interval), and
 * the Time Machine's THREE §20 modes (LAB-006): historical replay
 * (observations ≤ T), delayed-information replay (at T under lag L, only
 * information available by T−L — with the leakage pins that prove it), and
 * counterfactual branches (forked worlds under declared interventions).
 *
 * THE SURFACE'S CORE LAW (§20, lock rules 29/30, carried from the
 * authority's own contracts): historical and simulated records are
 * DISTINCT KINDS OF DATA. Every view model below carries the REQUIRED
 * literal flags — `counterfactual: true` on everything the simulator
 * produced (runs, world models' disclosure, branch records) and
 * `counterfactual: false` on historical observations (measured reality,
 * never rewritten) — and the views render those flags as visible labels.
 * The time horizon (step) and information cutoff (T and T−L) are ALWAYS
 * visible on every run and replay record.
 *
 * View port discipline as `lab-benchmark.ts`: presentation-shaped view
 * models re-declared from the LAB-004/005/006 record shapes, importing
 * only `@mos/contracts` types; composition OUTSIDE `src/`.
 */

/** The synthetic world-state dimensions a social world model carries. */
export interface LabWorldModelStateView {
  readonly baseAudience: number;
  /** Accumulated audience fatigue in [0, 1]. */
  readonly fatigue: number;
  /** Aggregate competitor audience share in [0, 1]. */
  readonly competitorShare: number;
  readonly seasonalFactor: number;
}

/** One versioned social world model record (synthetic — disclosed). */
export interface LabWorldModelView {
  readonly worldModelId: string;
  readonly worldModelVersion: number;
  readonly tenantId: TenantId;
  readonly niche: string;
  readonly platform: string;
  readonly state: LabWorldModelStateView;
  readonly createdAt: Timestamp;
  readonly notes: string | null;
  /** DISCLOSURE (verbatim kind): synthetic parametric world model. */
  readonly disclosure: 'synthetic-parametric-world-model';
  /** §20/§24 PIN: a model artifact — never observed reality. */
  readonly counterfactual: true;
}

/** One population segment of a dynamics model (LAB-005). */
export interface LabDynamicsSegmentView {
  readonly segmentId: string;
  readonly kind: 'user' | 'creator' | 'competitor-profile';
  readonly label: string;
  /** Population share in (0, 1]. */
  readonly share: number;
  readonly fatigueSensitivity: number;
  readonly noveltySeeking: number;
  readonly engagementPropensity: number;
}

/** One versioned population-resolved dynamics model (LAB-005, synthetic). */
export interface LabDynamicsModelView {
  readonly dynamicsModelId: string;
  readonly version: number;
  readonly tenantId: TenantId;
  readonly niche: string;
  readonly platform: string;
  readonly populations: readonly LabDynamicsSegmentView[];
  readonly createdAt: Timestamp;
  readonly notes: string | null;
  readonly disclosure: 'synthetic-parametric-dynamics-model';
  /** §20/§24 PIN: a model artifact — never observed reality. */
  readonly counterfactual: true;
}

/** One predicted metric with its §22 envelope — NEVER a bare point. */
export interface LabPredictedMetricView {
  readonly metric: string;
  readonly expectedValue: number;
  readonly interval: { readonly lower: number; readonly upper: number };
  readonly unit: string;
}

/** One simulated platform-state metric delta (synthetic, disclosed). */
export interface LabSimulatedDeltaView {
  readonly metric: string;
  readonly expectedDelta: number;
  readonly interval: { readonly lower: number; readonly upper: number };
  readonly unit: string;
}

/**
 * One simulation run as listed: seed-required, counterfactual-labeled,
 * with the time horizon + information cutoff ALWAYS carried.
 */
export interface LabSimulationRunSummaryView {
  readonly runId: string;
  readonly tenantId: TenantId;
  /** The scenario the run belongs to (its version pins reproducibility). */
  readonly scenarioRef: string;
  /** The determinism seed — REQUIRED on every run, never null. */
  readonly seed: number;
  /** Time horizon: the simulation step this run's summary record belongs to. */
  readonly step: number;
  /** Information cutoff: when the prediction was produced. */
  readonly predictedAt: Timestamp;
  /** World model + simulator version pins (provenance, always carried). */
  readonly worldModelVersion: number;
  readonly simulatorVersion: number;
  /** §20/§24 PIN: simulation output — never measured reality. */
  readonly counterfactual: true;
}

/** The full simulation run detail (the LAB-004 result surface). */
export interface LabSimulationRunDetailView {
  readonly summary: LabSimulationRunSummaryView;
  /** Predicted metrics with uncertainty envelopes (§22 — always paired). */
  readonly metrics: readonly LabPredictedMetricView[];
  /** Simulated per-step platform-state deltas (synthetic, disclosed). */
  readonly deltas: readonly LabSimulatedDeltaView[];
  /** The world state after applying the step (synthetic). */
  readonly nextWorldState: LabWorldModelStateView;
  /**
   * The strategy the run stepped — the record carries its canonical
   * `StrategyRef` (the action knobs live with the candidate descriptor in
   * the Strategy section; this surface relays only what the run record
   * itself carries).
   */
  readonly strategyRef: string;
  /** Uncertainty summary as the authority reported it (level + note). */
  readonly uncertainty: { readonly level: string; readonly note: string | null };
  /** §20/§24 PIN: the whole run is simulation-derived, never evidence. */
  readonly counterfactual: true;
  /** The disclosure the authority carries on every prediction. */
  readonly disclosure: 'synthetic-response-function';
}

/** One historical observation (the §20 MEASURED side — lock rule 29). */
export interface LabHistoricalObservationView {
  readonly observationId: string;
  readonly tenantId: TenantId;
  readonly niche: string;
  readonly platform: string;
  /** Observed metric values (real-world evidence — never synthetic). */
  readonly metrics: readonly { readonly metric: string; readonly value: number; readonly unit: string }[];
  /** When the observation became true in the real world (the visibility key). */
  readonly observedAt: Timestamp;
  /** Non-empty external source references backing the observation. */
  readonly sourceRefs: readonly string[];
  /** Regime label the observation was taken under. */
  readonly regime: string;
  /** LOCK RULE 29 PIN: historical evidence — never a counterfactual output. */
  readonly counterfactual: false;
}

/**
 * The Time Machine's §20 mode-2 declaration: at T under lag L, the agent
 * sees ONLY information available by T−L. The view model carries the
 * declared window AND the leakage pin — how many appended records exist
 * inside the forbidden window (records with T−L < observedAt ≤ T) — so the
 * delayed replay's honesty is visible, never assumed.
 */
export interface LabDelayedReplayView {
  readonly asOf: Timestamp;
  /** Information lag L in milliseconds (>= 0; 0 = exact historical replay). */
  readonly lagMs: number;
  /** The cutoff actually applied: `asOf − lagMs` (ALWAYS visible). */
  readonly visibleThrough: Timestamp;
  /** Observations visible at T−L (observedAt <= asOf − lagMs). */
  readonly visibleObservations: readonly LabHistoricalObservationView[];
  /**
   * The LEAKAGE PIN: appended observations inside the forbidden window
   * (observedAt in (T−L, T]) — they exist in the timeline but are NEVER
   * served by the delayed mode (lock rule 30). Count + ids, so the view
   * can show exactly what was withheld.
   */
  readonly withheldInWindow: {
    readonly count: number;
    readonly observationIds: readonly string[];
  };
}

/** One counterfactual branch (§20 mode 3, immutable audit record). */
export interface LabBranchView {
  readonly branchId: string;
  readonly version: number;
  readonly tenantId: TenantId;
  /** Parent branch, or null when forked from the historical timeline. */
  readonly parentBranchId: string | null;
  /** World-state fork point T (the timeline itself is never touched). */
  readonly forkPoint: Timestamp;
  /** The declared intervention that defines the branch. */
  readonly intervention: {
    readonly description: string;
    /** Structured changed parameters (carried verbatim, never interpreted). */
    readonly changedParameters: Readonly<Record<string, unknown>>;
  };
  readonly label: string | null;
  readonly createdAt: Timestamp;
  /** How many counterfactual predictions are recorded into the branch. */
  readonly recordCount: number;
  /** LOCK RULE 29 PIN: counterfactual — never historical evidence. */
  readonly counterfactual: true;
}

/** One prediction recorded into a branch (counterfactual, labeled). */
export interface LabBranchRecordView {
  readonly recordId: string;
  readonly branchId: string;
  /** The counterfactual prediction the branch recorded (§22 envelopes). */
  readonly prediction: {
    readonly scenarioRef: string;
    readonly worldModelVersion: number;
    readonly simulatorVersion: number;
    readonly seed: number;
    readonly step: number;
    readonly metrics: readonly LabPredictedMetricView[];
    readonly predictedAt: Timestamp;
  };
  readonly recordedAt: Timestamp;
  /** LOCK RULE 29 PIN: branch records are counterfactual, never historical. */
  readonly counterfactual: true;
}

/** The simulator section's aggregate read (worlds, dynamics, ensembles). */
export interface LabSimulatorOverviewView {
  readonly tenantId: TenantId;
  /** Social world model versions visible in the tenant scope. */
  readonly worldModels: readonly LabWorldModelView[];
  /** Population-resolved dynamics model versions (LAB-005). */
  readonly dynamicsModels: readonly LabDynamicsModelView[];
  /** Simulation runs visible in the scope, most recent first. */
  readonly runs: readonly LabSimulationRunSummaryView[];
  /**
   * The Time Machine view: the historical replay (mode 1) as of the
   * declared T, the delayed-information declaration (mode 2) with its
   * leakage pin, and the counterfactual branches (mode 3).
   */
  readonly timeMachine: {
    /** MODE 1 — historical replay: observations with observedAt <= asOf. */
    readonly historical: {
      readonly asOf: Timestamp;
      readonly observations: readonly LabHistoricalObservationView[];
    };
    /** MODE 2 — delayed-information replay at asOf under lagMs. */
    readonly delayed: LabDelayedReplayView;
    /** MODE 3 — counterfactual branches in creation order. */
    readonly branches: readonly LabBranchView[];
  };
}

/** Typed failure shapes for the simulator port. */
export type LabSimulatorFailure =
  | { readonly error: 'lab-simulator-unavailable'; readonly message: string }
  | { readonly error: 'lab-run-not-found'; readonly message: string }
  | { readonly error: 'lab-branch-not-found'; readonly message: string };

/**
 * The declared Lab simulator & Time Machine view surface (read-only, 3
 * methods ≤ 12 policy budget). Async by design; unknown and cross-tenant
 * run/branch ids are the SAME explicit miss (§31, no existence leak).
 */
export interface LabSimulatorViewPort {
  /**
   * The simulator overview visible in one tenant scope: world models,
   * dynamics models, simulation runs and the Time Machine's three §20
   * modes with their literal counterfactual/measured flags.
   */
  loadSimulatorOverview(scope: TenantScope): Promise<LabSimulatorOverviewView | LabSimulatorFailure>;

  /**
   * One simulation run's full detail — predicted metrics WITH intervals,
   * deltas, next world state, candidate knobs, provenance versions.
   * `lab-run-not-found` for unknown/cross-tenant ids.
   */
  loadSimulationRunDetail(
    runId: string,
    scope: TenantScope,
  ): Promise<LabSimulationRunDetailView | LabSimulatorFailure>;

  /**
   * One counterfactual branch's recorded predictions (§20 mode 3 detail).
   * `lab-branch-not-found` for unknown/cross-tenant ids.
   */
  loadBranchRecords(
    branchId: string,
    scope: TenantScope,
  ): Promise<readonly LabBranchRecordView[] | LabSimulatorFailure>;
}
