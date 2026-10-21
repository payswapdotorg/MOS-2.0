import type { LabScenarioId, TenantId, TenantScope, Timestamp } from '@mos/contracts';

/**
 * Lab research-overview view port (UX-003, over the LAB-001..018 aggregate).
 *
 * The Lab workspace's landing read: where the research loop stands in THIS
 * tenant scope — which sections hold real records, how much evidence
 * exists (and of which §20 kind), which scenario is active, what ran
 * recently, and which stage of the research loop is next. Every number is
 * a COUNT of records the lab authorities actually hold — nothing here is
 * computed, estimated or invented; the port relays the counts and the
 * DECLARED stage ordering, and the views derive the next-step label from
 * presentation data (the first stage with zero records is the next stage —
 * a derivation over declared states, never a business decision).
 *
 * View port discipline as `lab-benchmark.ts`: presentation-shaped view
 * models re-declared from the lab record shapes, importing only
 * `@mos/contracts` types; the composition seam OUTSIDE `src/` adapts the
 * real lab runtime into these models (Worker C's binding), while the
 * disclosed in-memory double runs on REAL-shaped fixtures.
 *
 * EVIDENCE SEPARATION (§20, lock rule 29): the summary counts keep
 * measured evidence and counterfactual outputs in DISTINCT fields —
 * historical observations (measured reality) are never folded into the
 * simulated-record counts. The active scenario carries the Time Machine
 * information lag and version pins so the time horizon + information
 * cutoff are visible at the workspace's front door.
 */

/** One research-loop stage's record standing (counts only, never content). */
export interface LabLoopStageStandingView {
  /**
   * The §2 research-loop stage id (presentation ordering key — the loop
   * order is declared here because it is presentation, not lab state).
   */
  readonly stageId: 'corpus' | 'features' | 'ideas' | 'simulator' | 'strategy' | 'transforms' | 'benchmarks' | 'calibration';
  /** How many records this stage's authority holds in this tenant scope. */
  readonly recordCount: number;
  /** Whether at least one record exists (the stage has been entered). */
  readonly started: boolean;
}

/** One recent lab run as listed on the overview (count-level facts only). */
export interface LabRecentRunView {
  /** The run's producing surface id (e.g. a benchmark chain id). */
  readonly runId: string;
  /** Which lab authority produced it (the accepted vocabulary). */
  readonly surface: 'robust-benchmark' | 'strategy-learning' | 'organization-search' | 'simulator';
  /** ISO-8601 timestamp of the latest record of the run. */
  readonly recordedAt: Timestamp;
  /** §20/§24 PIN: every lab run output is simulation-derived. */
  readonly counterfactual: true;
}

/** The active scenario the tenant's lab work is pinned against. */
export interface LabActiveScenarioView {
  readonly scenarioRef: LabScenarioId;
  readonly niche: string;
  readonly platform: string;
  /** The research objective statement the scenario carries (verbatim). */
  readonly objective: string;
  /**
   * Time Machine information lag L in ms (§20): at T the agent sees only
   * information available by T-L — ALWAYS visible in the workspace header.
   */
  readonly informationLag: number;
  /** The exact version pins the scenario freezes (reproducibility). */
  readonly pins: {
    readonly corpusVersion: number;
    readonly simulatorVersion: number;
    readonly rewardVersion: number;
  };
}

/**
 * The tenant's lab research overview. Evidence counts are SPLIT by §20
 * kind: `historicalObservationCount` is measured reality;
 * `counterfactualRecordCount` counts simulation-derived records — they are
 * never summed into one number.
 */
export interface LabOverviewView {
  /** The tenant the overview belongs to — always explicit (§31). */
  readonly tenantId: TenantId;
  readonly stages: readonly LabLoopStageStandingView[];
  readonly evidence: {
    /** MEASURED boundary-chain historical observations (§20 reality side). */
    readonly historicalObservationCount: number;
    /** Counterfactual simulation-derived records (benchmarks, runs, searches). */
    readonly counterfactualRecordCount: number;
    /** The distinct regimes the measured observations were taken under. */
    readonly regimes: readonly string[];
  };
  readonly activeScenario: LabActiveScenarioView | null;
  /** Most-recent-first, capped listing of the tenant's lab runs. */
  readonly recentRuns: readonly LabRecentRunView[];
  /** Earliest/latest acquisition boundary of the corpus evidence, if any. */
  readonly corpusTimeBoundaries: {
    readonly earliestAcquiredAt: Timestamp | null;
    readonly latestAcquiredAt: Timestamp | null;
  };
}

/** Typed failure shapes for the overview port. */
export type LabOverviewFailure =
  | { readonly error: 'lab-overview-unavailable'; readonly message: string };

/**
 * The declared Lab research-overview view surface (read-only, 1 method ≤
 * 12 policy budget). Async by design: the production binding aggregates
 * over the lab service transport, so loading and failure states are part
 * of the contract — never placeholders.
 */
export interface LabOverviewPort {
  /**
   * The research-loop standing, evidence summary, active scenario and
   * recent runs visible in ONE tenant scope (§31 — cross-tenant records
   * are never counted, listed or leaked).
   */
  loadLabOverview(scope: TenantScope): Promise<LabOverviewView | LabOverviewFailure>;
}
