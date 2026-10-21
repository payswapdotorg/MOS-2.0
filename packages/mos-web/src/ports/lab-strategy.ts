import type { LabScenarioId, TenantId, TenantScope, Timestamp } from '@mos/contracts';

/**
 * Lab strategy & organizations view port (UX-003, over LAB-007..010 +
 * LAB-016's declared seam).
 *
 * The Lab workspace's Strategy & Organizations section: the strategy
 * candidates the lab has produced or evaluated — learned strategy
 * candidates (LAB-009: learned from simulation experience only, with full
 * evaluation provenance: ensemble id/version, member world-model
 * versions, simulator version, reward spec version, seed, stopping
 * record) and benchmark-declared candidates across the LAB-017 origin
 * vocabulary (hand-designed / learned-strategy / organization-search /
 * production-search — the production-program search surface of LAB-016
 * arrives through exactly that declared action seam) — the agent
 * organization search results (LAB-010, §23) with THE THREE-WAY
 * COMPARISON MANDATE rendered structurally (generalist single-agent
 * baseline + hand-designed + generated — always all three, never only
 * generated), and the DECLARED mission-specific reward objective +
 * constraints (LAB-008/009: versioned reward spec whose terms bind their
 * value sources EXPLICITLY; vanity metrics never silently replace the
 * declared objective, §21).
 *
 * §22 DISCIPLINE: every expected value on this surface renders WITH its
 * uncertainty interval and the no-op baseline is ALWAYS visible in
 * comparisons. §20/§24: every candidate is `counterfactual: true` —
 * simulation-derived estimates for SELECTION, never deployment evidence.
 *
 * View port discipline as `lab-benchmark.ts`: presentation-shaped view
 * models re-declared from the LAB-007..010 record shapes, importing only
 * `@mos/contracts` types; composition OUTSIDE `src/`.
 */

/** Where a strategy candidate came from (the accepted origin vocabulary). */
export type LabStrategyOriginView =
  | 'hand-designed'
  | 'learned-strategy'
  | 'organization-search'
  | 'production-search'
  | 'no-op-baseline';

/** A reported uncertainty interval — [lower, upper] (§22, never bare points). */
export interface LabStrategyIntervalView {
  readonly lower: number;
  readonly upper: number;
}

/** The action knobs of a candidate program (the declared action seam). */
export interface LabStrategyActionView {
  readonly strategyRef: string;
  readonly kind: 'content' | 'repost' | 'no-op';
  readonly cadencePerWeek: number;
  readonly novelty: number;
  readonly engagementEffort: number;
}

/** The evaluation provenance every candidate carries (versions + seeds). */
export interface LabStrategyProvenanceView {
  readonly ensembleId: string;
  readonly ensembleVersion: number;
  /** Member world-model versions (aligned with the ensemble member order). */
  readonly memberWorldModelVersions: readonly number[];
  readonly simulatorVersion: number;
  readonly rewardSpecVersion: number;
  /**
   * The determinism seed(s) the evaluation declared — REQUIRED, never empty
   * (a single seed for learned candidates; the DECLARED seed sweep for
   * benchmark-evaluated candidates — §22 seed robustness stays visible).
   */
  readonly seeds: readonly number[];
}

/**
 * One strategy candidate as listed: its action, its origin, its evaluation
 * (expected reward WITH interval, §22) and its provenance. Learned
 * candidates additionally carry their learning trace summary.
 */
export interface LabStrategyCandidateView {
  readonly candidateId: string;
  readonly tenantId: TenantId;
  readonly label: string | null;
  readonly origin: LabStrategyOriginView;
  readonly action: LabStrategyActionView;
  /** Simulated horizon in steps (>= 1). */
  readonly horizonSteps: number;
  /** §22: expected reward WITH its reported interval — always paired. */
  readonly expectedReward: number;
  readonly interval: LabStrategyIntervalView;
  readonly provenance: LabStrategyProvenanceView;
  /** Learning-trace summary (learned candidates only; null otherwise). */
  readonly learning: {
    readonly iterationCount: number;
    readonly stoppingReason: 'budget-exhausted' | 'iteration-cap-reached' | 'plateau-detected';
    readonly stoppingDetail: string;
    /** Final incumbent estimate WITH interval (§22 — never a bare point). */
    readonly finalEstimate: {
      readonly reward: number;
      readonly interval: LabStrategyIntervalView;
    } | null;
  } | null;
  /** §20/§24 PIN: simulation-derived candidate — never measured reality. */
  readonly counterfactual: true;
}

/** One §23 organization dimension declaration on a searched candidate. */
export interface LabOrganizationFeaturesView {
  /** The twelve §23 dimension signatures (one per dimension, no defaults). */
  readonly fingerprint: Readonly<Record<string, string>>;
  /** The three DECLARED features the frozen record cannot express. */
  readonly critics: readonly string[];
  readonly toolAllocation: readonly { readonly nodeId: string; readonly toolRefs: readonly string[] }[];
  readonly executionOrdering: 'sequential' | 'parallel' | 'staged';
  /** The organization descriptor's structural dimensions (counts only). */
  readonly agentCount: number;
  readonly roles: readonly string[];
}

/** One ranked organization candidate (§22-labeled, all counterfactual). */
export interface LabRankedOrganizationView {
  readonly rank: number;
  readonly origin: 'generalist-single-agent-baseline' | 'hand-designed' | 'composed' | 'generated';
  /** Organization descriptor facts (id, version) + the §23 features. */
  readonly organization: {
    readonly organizationId: string;
    readonly version: number;
  };
  readonly features: LabOrganizationFeaturesView;
  /** §22: expected reward WITH interval + disagreement half-width. */
  readonly expectedReward: number;
  readonly interval: LabStrategyIntervalView;
  readonly disagreementHalfWidth: number;
  /** Seed robustness: per-seed estimates + spread (never hidden). */
  readonly seedRobustness: {
    readonly seeds: readonly number[];
    readonly perSeedExpected: readonly number[];
    readonly spread: number;
  };
  /** OOD verdict across the rollout's ensemble predictions. */
  readonly ood: {
    readonly status: 'in-coverage' | 'out-of-declared-coverage' | 'partially-undeclared';
    readonly flagged: boolean;
  };
  /** Dimensions varied vs the parent (generated candidates; full twelve for caller-supplied). */
  readonly variedDimensions: readonly string[];
  /** 1-based generation index (null for caller-supplied candidates). */
  readonly generationIndex: number | null;
  /** Interval overlap with the rank-1 leader (null on rank 1, declared otherwise). */
  readonly intervalOverlapWithLeader: { readonly overlaps: boolean } | null;
  /** §20/§24 PIN: ensemble-evaluated simulation estimate, never evidence. */
  readonly counterfactual: true;
}

/** THE §23 THREE-WAY COMPARISON, structurally required on every result. */
export interface LabOrganizationComparisonView {
  readonly baseline: LabRankedOrganizationView;
  readonly handDesigned: LabRankedOrganizationView;
  /** Search-produced organizations — ALWAYS >= 1. */
  readonly generated: readonly LabRankedOrganizationView[];
}

/** One organization search result (LAB-010, §23). */
export interface LabOrganizationSearchResultView {
  readonly searchId: string;
  readonly tenantId: TenantId;
  /** Deterministic ranked order (expected desc → width asc → key asc). */
  readonly ranked: readonly LabRankedOrganizationView[];
  readonly comparison: LabOrganizationComparisonView;
  /** Budget accounting (declared vs consumed member steps). */
  readonly budget: {
    readonly maxMemberSteps: number;
    readonly consumedMemberSteps: number;
    readonly evaluationsExecuted: number;
    readonly generatedEvaluated: number;
  };
  /** The declared stopping record. */
  readonly stopping: {
    readonly reason: 'budget-exhausted' | 'plateau-detected' | 'generation-cap-reached';
    readonly detail: string;
    readonly generationsExecuted: number;
  };
  /** The scenario + ensemble the search ran under (provenance). */
  readonly scenarioRef: LabScenarioId;
  readonly ensembleId: string;
  readonly ensembleVersion: number;
  readonly searchedAt: Timestamp;
  /** §20/§24 PIN: simulation-derived search output, never evidence. */
  readonly counterfactual: true;
}

/** One reward term with its EXPLICIT value-source binding (§21). */
export interface LabRewardTermView {
  readonly metric: string;
  readonly weight: number;
  readonly direction: 'maximize' | 'minimize';
  /** Precise definition of what counts (mandatory, never defaulted). */
  readonly definition: string;
  /** The concrete metric id this term draws its value from (explicit binding). */
  readonly metricSource: string;
}

/**
 * The DECLARED mission-specific reward objective + constraints for one
 * scenario (LAB-008/009): the versioned reward spec the scenario pins.
 */
export interface LabRewardObjectiveView {
  readonly scenarioRef: LabScenarioId;
  readonly tenantId: TenantId;
  /** Spec-local version (must equal the scenario's rewardVersion pin). */
  readonly rewardSpecVersion: number;
  readonly terms: readonly LabRewardTermView[];
  /**
   * The scenario's declared constraints (carried verbatim from the
   * scenario objective context — budget + objective statement).
   */
  readonly constraints: {
    readonly objective: string;
    readonly maxCost: { readonly amount: number; readonly currency: string };
    readonly maxDurationMs: number;
  };
}

/** Typed failure shapes for the strategy port. */
export type LabStrategyFailure =
  | { readonly error: 'lab-strategy-unavailable'; readonly message: string }
  | { readonly error: 'lab-search-not-found'; readonly message: string }
  | { readonly error: 'lab-reward-objective-not-found'; readonly message: string };

/**
 * The declared Lab strategy & organizations view surface (read-only, 3
 * methods ≤ 12 policy budget). Async by design; unknown and cross-tenant
 * ids are the SAME explicit miss (§31, no existence leak).
 */
export interface LabStrategyViewPort {
  /**
   * Every strategy candidate visible in one tenant scope — learned
   * candidates with their trace summaries and benchmark-declared
   * candidates across the origin vocabulary (the LAB-016
   * production-program-search seam included).
   */
  listStrategyCandidates(
    scope: TenantScope,
  ): Promise<readonly LabStrategyCandidateView[] | LabStrategyFailure>;

  /**
   * Every agent-organization search result visible in the tenant scope
   * (§23 three-way comparison structurally carried on each).
   */
  listOrganizationSearchResults(
    scope: TenantScope,
  ): Promise<readonly LabOrganizationSearchResultView[] | LabStrategyFailure>;

  /**
   * The DECLARED reward objective + constraints one scenario's evaluation
   * pinned (versioned terms with explicit metric-source bindings, §21).
   */
  loadRewardObjective(
    scenarioRef: LabScenarioId,
    scope: TenantScope,
  ): Promise<LabRewardObjectiveView | LabStrategyFailure>;
}
