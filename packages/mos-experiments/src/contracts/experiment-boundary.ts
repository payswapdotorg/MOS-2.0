/**
 * BRIDGE-003 boundary vocabulary — the §24 statement, the experiment
 * lifecycle, the declared measurement context and the frozen durable-job
 * plan.
 *
 * Basis: spec/mos-architecture-v2.0.md §2 loop 3 (observations → model →
 * simulation → real experiment → calibration), §3 authority model
 * (Experiment / Evidence / Measurement / Learning are DISTINCT single
 * authorities; Lab ≠ Experiment — FORBIDDEN duplication), §24 (the
 * real-world boundary chain: the experiments authority owns the chain's
 * → Evidence/Measurement/Experiment → Learning/Calibration segments),
 * §26 (durable jobs — long-running work rides the durable-job path, never
 * synchronous-HTTP claims), §31 (tenant scope), lock rules 29/32/37.
 */

import type { Timestamp, Version } from "@mos/contracts";

import type { ExperimentId } from "./ids.js";

// ---------------------------------------------------------------------------
// The §24 boundary statement (carried on EVERY record, verbatim)
// ---------------------------------------------------------------------------

/**
 * The §24 boundary statement every experiments record carries: this
 * authority records REAL experiments and their platform-said evidence — it
 * never simulates, never re-runs the Lab's simulators, and never treats
 * simulated predictions as observations (Lab ≠ Experiment, §3).
 */
export const REAL_EXPERIMENT_BOUNDARY_STATEMENT =
  "a real MOS experiment under the §24 boundary chain — the experiments authority records real experiments and their platform-said evidence; it never simulates, never re-runs the Lab's simulators, and never treats simulated predictions as observations (Lab ≠ Experiment)" as const;

// ---------------------------------------------------------------------------
// The experiment lifecycle (§24 → §26 durable execution)
// ---------------------------------------------------------------------------

/**
 * The real-experiment lifecycle. `created` is minted by the binding act;
 * `running`/`measured` advance through the durable measurement segment
 * (leased claims on the REAL @mos/jobs JobQueuePort); `analysed` appends
 * the outcome record; `closed`/`abandoned` are TERMINAL (append-only
 * history preserves every prior version).
 */
export const EXPERIMENT_LIFECYCLE_STATUSES = Object.freeze([
  "created",
  "running",
  "measured",
  "analysed",
  "closed",
  "abandoned",
] as const);

/** One lifecycle status of a real experiment. */
export type ExperimentLifecycleStatus = (typeof EXPERIMENT_LIFECYCLE_STATUSES)[number];

/** The terminal lifecycle statuses (no successor exists). */
export const TERMINAL_EXPERIMENT_STATUSES = Object.freeze([
  "closed",
  "abandoned",
] as const);

/** One terminal lifecycle status. */
export type TerminalExperimentStatus = (typeof TERMINAL_EXPERIMENT_STATUSES)[number];

// ---------------------------------------------------------------------------
// The declared measurement context (carried verbatim, never invented)
// ---------------------------------------------------------------------------

/**
 * The DECLARED measurement context of one experiment: the real-world niche
 * and regime label the experiment runs under, plus the platform-measurement
 * window. `niche`/`regime` are CALLER-DECLARED context carried verbatim
 * (documented derivation: they label the boundary-chain observations the
 * LAB-018 calibration citation projects — the authority never invents
 * them); `platform` is DERIVED from the REAL distribution publication's
 * provider id (never caller-claimed).
 */
export interface ExperimentMeasurementContext {
  /** ISO-8601 window start (inclusive). */
  readonly windowStart: Timestamp;
  /** ISO-8601 window end (exclusive). */
  readonly windowEnd: Timestamp;
  /** The declared real-world niche label (non-blank, carried verbatim). */
  readonly niche: string;
  /** The declared regime label under which the measurement is taken. */
  readonly regime: string;
  /** The REAL platform identity (the publication's provider id — derived). */
  readonly platform: string;
}

// ---------------------------------------------------------------------------
// The frozen durable-job plan (§26 — the declared measurement-job contract)
// ---------------------------------------------------------------------------

/**
 * The DECLARED durable-job contract version of the experiments
 * measurement segment. Bumped only with a record-family change (the
 * requireExplicitVersionedContracts discipline).
 */
export const EXPERIMENT_JOB_CONTRACT_VERSION = 1 as Version;

/**
 * The §26 job kind the measurement segment rides. DISCLOSED MAPPING: the
 * frozen six-kind vocabulary lives in worker-b's mos-jobs subtree (out of
 * this package's subtree — untouchable per the scope rules) and carries no
 * `experiment` kind; among the frozen kinds the experiment's long-running
 * measurement/analysis segment is structurally an EVALUATION job over
 * reality — the closest frozen kind is `benchmark`. The full experiment
 * identity rides the job key + parameters (the kind stays a coarse §26
 * routing label). CENTRAL-FILE NOTE for the TL: a dedicated `experiment`
 * kind should be pinned by the jobs owner at the next registry re-pin;
 * this mapping is test-pinned here and flagged in the completion report.
 */
export const EXPERIMENT_JOB_KIND = "benchmark" as const;

/**
 * The declared retry policy of the measurement job: the window wait fails
 * typed-retriable (`measurement-window-not-elapsed`) and retries on the
 * declared backoff schedule (the last entry clamps for attempts beyond the
 * schedule length — the JOBS-001 semantics).
 */
export const EXPERIMENT_JOB_RETRY_POLICY = Object.freeze({
  maxAttempts: 8,
  backoffScheduleMs: [60_000, 60_000, 300_000, 300_000, 900_000, 900_000, 3_600_000],
} as const);

/**
 * The §30 citation of one experiment's durable job — carried on the
 * experiment record at every lifecycle version (the job events enrich the
 * §30 trail through the REAL queue's own append-only history).
 */
export interface ExperimentJobCitation {
  /** The experiments authority's own id (the job's subject). */
  readonly experimentId: ExperimentId;
  /** The REAL durable job id (assigned by the jobs authority). */
  readonly jobId: string;
  /** The idempotent client job key (`experiment:<experimentId>`). */
  readonly jobKey: string;
  /** The frozen §26 kind the segment rides (the disclosed mapping). */
  readonly kind: typeof EXPERIMENT_JOB_KIND;
  /** The declared job contract version. */
  readonly contractVersion: number;
  readonly enqueuedAt: Timestamp;
  /** The job's own status echo at the latest experiment transition. */
  readonly jobStatus: string;
  /** Execution attempts started so far (the queue's own count). */
  readonly attemptCount: number;
}
