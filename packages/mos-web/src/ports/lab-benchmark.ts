import type { LabScenarioId, TenantId, TenantScope } from '@mos/contracts';

/**
 * Lab benchmark-digest view port (UX-003, over LAB-017).
 *
 * The Lab surface's READ side over the robust marketing benchmark authority
 * (LAB-017 `MarketingBenchmarkPort`): it lists the benchmark record chains
 * visible in one tenant scope and loads ONE frozen record version's digest —
 * the DECLARED robustness policy, the ranked candidate set with the
 * ALWAYS-present no-op baseline, every expected value WITH its uncertainty
 * interval, per-world model disagreement, OOD flags against the members'
 * declared coverage, the fairness pin, full version provenance, and the
 * calibration surface DECLARED pending reality (the LAB-018 seam).
 *
 * This is a VIEW port, not a domain port (module registry: `web` → authority
 * `presentation-only`, dependencies `[contracts]`): every type below is a
 * presentation-shaped view model re-declared from the LAB-017 record shapes,
 * importing only `@mos/contracts` types. The composition seam OUTSIDE `src/`
 * (`testing/`) adapts the real lab records into these models; a server-side
 * composition binds the same port over the MOS service transport later
 * without touching this file.
 *
 * COUNTERFACTUAL DISCIPLINE (§20/§24, lock rules 29/32 — the reason this
 * surface exists): every benchmark number is a simulation-derived estimate
 * over disclosed synthetic ensembles — NEVER measured reality. The view
 * models therefore carry `counterfactual: true` as a REQUIRED literal flag
 * (on summaries, digests and candidate evaluations), and the views render
 * that flag as a visible label. The surface never presents a simulated value
 * as measured/real, and the §24 boundary statement renders with every
 * digest.
 */

/**
 * The benchmark's always-present synthesized no-op baseline identity (§7:
 * the no-op path is always a valid baseline). A candidate row carrying this
 * origin IS the benchmark's own baseline — the reserved identity mirrors the
 * authority's `BENCHMARK_NOOP_STRATEGY_REF` discipline (caller-claimed
 * baselines fail closed there; here the flag is presentation-only).
 */
export const LAB_NOOP_BASELINE_ORIGIN = 'no-op-baseline' as const;

/** Where a benchmark candidate came from (the LAB-017 origin vocabulary). */
export type LabBenchmarkCandidateOriginView =
  | 'hand-designed'
  | 'learned-strategy'
  | 'organization-search'
  | 'production-search'
  | typeof LAB_NOOP_BASELINE_ORIGIN;

/** A reported uncertainty interval — [lower, upper] (§22, never bare points). */
export interface LabIntervalView {
  readonly lower: number;
  readonly upper: number;
}

/** The always-visible §22 disagreement of one world model's members. */
export interface LabWorldDisagreementView {
  /** The world-model set entry's declared label (e.g. `primary`). */
  readonly label: string;
  readonly ensembleVersion: number;
  /** Half the spread of the members' expected rewards inside this world. */
  readonly halfSpread: number;
}

/** The §22 cross-world robustness of one candidate. */
export interface LabWorldRobustnessView {
  readonly perWorld: readonly {
    readonly label: string;
    readonly ensembleVersion: number;
    readonly expectedReward: number;
  }[];
  readonly worstExpectedReward: number;
  readonly bestExpectedReward: number;
  readonly spread: number;
}

/** The §22 OOD/novelty-regime signal against DECLARED coverage. */
export interface LabOodSignalView {
  readonly status: 'in-coverage' | 'out-of-declared-coverage' | 'partially-undeclared';
  readonly flagged: boolean;
  readonly perWorld: readonly {
    readonly label: string;
    readonly status: LabOodSignalView['status'];
    readonly flagged: boolean;
    /** Max normalized out-of-box distance over the world's members (0 = inside). */
    readonly maxDistance: number;
  }[];
}

/**
 * The declared comparison of one ranked candidate against the NO-OP
 * BASELINE (§7: comparisons are against the always-present baseline).
 * `certainlyBetter` means the interval's lower bound is strictly above the
 * baseline's upper bound UNDER SIMULATION — never a deployment claim.
 */
export interface LabBaselineComparisonView {
  readonly baselineExpectedReward: number;
  readonly expectedRewardDelta: number;
  readonly overlaps: boolean;
  readonly certainlyBetter: boolean;
}

/** The §22 calibration surface as DECLARED PENDING REALITY — never a number. */
export interface LabCalibrationPendingView {
  readonly status: 'pending-reality';
  /** What LAB-018 calibrates against this record (verbatim from the authority). */
  readonly provenance:
    'calibration is LAB-018 (online calibration): simulation-to-reality prediction error is recorded there once real experiments exist; this frozen benchmark record is never rewritten';
}

/**
 * One ranked benchmark candidate as presented: expected reward WITH its
 * interval (§22 — never a bare point estimate), the additive interval
 * breakdown, seed robustness, world robustness, member disagreement, the
 * OOD signal, the baseline comparison — all COUNTERFACTUAL.
 */
export interface LabBenchmarkCandidateView {
  /** 1-based rank under the declared policy's deterministic order. */
  readonly rank: number;
  readonly key: string;
  readonly label: string | null;
  readonly origin: LabBenchmarkCandidateOriginView;
  /** Expected reward under the declared aggregation rule. */
  readonly expectedReward: number;
  /** §22: the reported uncertainty interval — rendered WITH the expected value. */
  readonly interval: LabIntervalView;
  /** The additive interval half-width (`bench-additive-v1`). */
  readonly totalHalfWidth: number;
  readonly breakdown: {
    readonly formula: 'bench-additive-v1';
    readonly memberDisagreementHalfWidth: number;
    readonly seedRobustnessHalfWidth: number;
    readonly worldModelSpreadHalfWidth: number;
    readonly aggregation: 'pooled-mean' | 'worst-world-mean';
  };
  readonly seedRobustness: {
    readonly seedCount: number;
    readonly spread: number;
    readonly halfSpread: number;
    readonly relativeSpread: number;
  };
  readonly worldRobustness: LabWorldRobustnessView;
  readonly disagreement: {
    readonly perWorld: readonly LabWorldDisagreementView[];
    /** Worst per-world member half-spread (§22 — never hidden by aggregation). */
    readonly worstHalfWidth: number;
  };
  readonly ood: LabOodSignalView;
  /** Null only on the baseline itself; every declared candidate carries one. */
  readonly comparisonToBaseline: LabBaselineComparisonView | null;
  /** Declared overlap vs the rank-1 leader (null on rank 1). */
  readonly intervalOverlapWithLeader: { readonly overlaps: boolean } | null;
  /** §20/§24 PIN: simulation-derived estimate — never measured reality. */
  readonly counterfactual: true;
  readonly calibration: LabCalibrationPendingView;
}

/** One benchmark record chain as listed in the directory. */
export interface LabBenchmarkSummaryView {
  /** The benchmark chain id (the authority's `RobustBenchmarkId`, as a string). */
  readonly benchmarkId: string;
  /** The tenant the chain belongs to — always explicit, never ambient (§31). */
  readonly tenantId: TenantId;
  readonly scenarioRef: LabScenarioId;
  readonly scenarioNiche: string;
  readonly scenarioPlatform: string;
  /** Latest record version of the append-only chain. */
  readonly latestVersion: number;
  readonly versionCount: number;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly rewardSpecVersion: number;
  /** How many DECLARED candidates the latest record ran (baseline excluded). */
  readonly declaredCandidateCount: number;
  /** ISO-8601 timestamp of the latest record. */
  readonly benchmarkedAt: string;
  /** The LAB-018 calibration-context version the latest record cites, if any. */
  readonly citedCalibrationContextVersion: number | null;
  /** §20/§24 PIN: every listed number is simulation-derived. */
  readonly counterfactual: true;
  readonly calibration: LabCalibrationPendingView;
}

/** The declared versioned robustness policy snapshot of one record. */
export interface LabRobustnessPolicyView {
  readonly id: string;
  readonly version: number;
  readonly seedBudget: number;
  readonly seeds: readonly number[];
  readonly sweepDimensions: readonly ('seed' | 'world-model')[];
  readonly aggregation: 'pooled-mean' | 'worst-world-mean';
  readonly tieBreak: 'expected-desc-halfwidth-asc-key-asc';
  readonly worldModelSet: readonly {
    readonly ensembleId: string;
    readonly ensembleVersion: number;
    readonly label: string;
  }[];
  readonly note: string;
}

/** Run-level version provenance of one record. */
export interface LabBenchmarkProvenanceView {
  readonly simulatorVersion: number;
  readonly corpusVersion: number;
  readonly rewardSpecVersion: number;
  readonly worldModels: readonly {
    readonly ensembleId: string;
    readonly ensembleVersion: number;
    readonly weightingKind: 'uniform' | 'declared-member-weights';
    readonly memberWorldModelVersionCount: number;
  }[];
}

/** The digest-integrity state of one frozen record (digest-sealed chain). */
export interface LabRecordIntegrityView {
  readonly status: 'intact' | 'tampered';
  /** The recorded digest (short display form is derived by the views). */
  readonly digest: string;
}

/** One frozen benchmark record version's full digest, as browsed. */
export interface LabBenchmarkDigestView {
  readonly summary: LabBenchmarkSummaryView;
  /** The record version this digest shows (the append-only chain position). */
  readonly version: number;
  readonly recordedAt: string;
  readonly integrity: LabRecordIntegrityView;
  readonly policy: LabRobustnessPolicyView;
  readonly provenance: LabBenchmarkProvenanceView;
  /**
   * The frozen fairness statement (rendered verbatim): every candidate was
   * evaluated under the same seeds / world-model set / policy / reward spec.
   */
  readonly fairnessStatement:
    'every candidate in this benchmark was evaluated under the same seeds, world-model set, policy version and reward spec version — no per-candidate condition cherry-picking';
  /** §7 PIN: the ALWAYS-present synthesized no-op baseline — required, never an array slot. */
  readonly noopBaseline: LabBenchmarkCandidateView;
  /** The declared candidates in rank order (baseline excluded). */
  readonly declaredCandidates: readonly LabBenchmarkCandidateView[];
  /** The LAB-018 context citation this run carried, or null (first run of a loop). */
  readonly citedCalibrationContext: {
    readonly version: number;
    readonly statement: string;
  } | null;
  /** §20/§24 PIN: the whole digest is simulation-derived, never evidence. */
  readonly counterfactual: true;
  /** The disclosure the authority carries on every record. */
  readonly disclosure: string;
  /** §24 boundary statement carried on EVERY record (rendered verbatim). */
  readonly labOnly: string;
}

/** Typed failure shapes for the benchmark-digest port. */
export type LabBenchmarkDigestFailure =
  | { readonly error: 'lab-benchmark-unavailable'; readonly message: string }
  | { readonly error: 'lab-benchmark-not-found'; readonly message: string };

/**
 * The declared Lab benchmark-digest view surface (read-only, 2 methods ≤ 12
 * policy budget). Async by design: the production binding is a service call,
 * so loading and failure states are part of the contract — never
 * placeholders.
 */
export interface LabBenchmarkDigestPort {
  /**
   * Latest summaries of every benchmark chain visible in one tenant scope
   * (§31 — cross-tenant chains are never listed or leaked).
   */
  listBenchmarkSummaries(
    scope: TenantScope,
  ): Promise<readonly LabBenchmarkSummaryView[] | LabBenchmarkDigestFailure>;

  /**
   * One record version's digest — the LATEST version when `version` is
   * `null`, the exact chain position otherwise. `lab-benchmark-not-found`
   * for unknown/cross-tenant ids (no existence leak across tenants).
   */
  loadBenchmarkDigest(
    benchmarkId: string,
    version: number | null,
    scope: TenantScope,
  ): Promise<LabBenchmarkDigestView | LabBenchmarkDigestFailure>;
}
