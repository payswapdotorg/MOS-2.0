/**
 * DurableJobRecord and its vocabulary (JOBS-001, spec §26/§30/§31).
 *
 * §26 Durable jobs: Lab runs, media processing, engine execution,
 * rendering, Studio processing and benchmark jobs MUST use a durable
 * job/worker path — this record is that path's authority shape. Inputs are
 * ARTIFACT REFS ONLY (never inline payloads; media never travels over the
 * control plane), every record is tenant/workspace scoped (§31), and every
 * completion carries the §30 observability fields (run id, contract
 * version, actor, engine/capability versions where applicable, artifact
 * refs, cost/latency, failure/warnings, provenance).
 *
 * Frozen-contract vocabulary is imported from @mos/contracts (the module's
 * only registry dependency): ArtifactRef, TenantScope, Version, EngineId,
 * CapabilityId, ResourceUsage, MoneyAmount, RunProvenance, JsonObject.
 */

import type {
  ArtifactRef,
  CapabilityId,
  EngineId,
  JsonObject,
  Milliseconds,
  MoneyAmount,
  ResourceUsage,
  RunProvenance,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
  WorkspaceId,
} from "@mos/contracts";

import type { DurableJobId, JobKey, LeaseToken } from "./ids.js";

// ---------------------------------------------------------------------------
// Kind + lifecycle (the §26 list, verbatim)
// ---------------------------------------------------------------------------

/** The §26 long-running job kinds that must use the durable job path. */
export const DURABLE_JOB_KINDS = Object.freeze([
  "lab-run",
  "media-processing",
  "engine-execution",
  "rendering",
  "studio-processing",
  "benchmark",
] as const);

/** One §26 long-running job kind. */
export type DurableJobKind = (typeof DURABLE_JOB_KINDS)[number];

/**
 * Lifecycle states. queued → running → succeeded | failed | cancelled |
 * timed_out is the terminal vocabulary; retriable failures loop a running
 * attempt back to queued (retry-scheduled) and retry EXHAUSTION terminates
 * in dead_lettered with the full append-only history preserved.
 */
export const DURABLE_JOB_STATUSES = Object.freeze([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
  "dead_lettered",
] as const);

/** Lifecycle state of one durable job record. */
export type DurableJobStatus = (typeof DURABLE_JOB_STATUSES)[number];

/** States a job can never leave (append-only history records the rest). */
export const TERMINAL_JOB_STATUSES = Object.freeze([
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
  "dead_lettered",
] as const);

/** One of the terminal statuses. */
export type TerminalJobStatus = (typeof TERMINAL_JOB_STATUSES)[number];

// ---------------------------------------------------------------------------
// Retry policy + typed failure (retries are driven FROM typed failures)
// ---------------------------------------------------------------------------

/**
 * Declared retry policy: maximum execution attempts (INCLUDING the first)
 * and the backoff schedule — one delay in milliseconds per scheduled retry,
 * indexed by the failed attempt number (attempt 1 fails → schedule[0];
 * the last entry clamps for attempts beyond the schedule length).
 */
export interface JobRetryPolicy {
  readonly maxAttempts: number;
  readonly backoffScheduleMs: readonly Milliseconds[];
}

/**
 * A typed failure record — the ENG-003 EngineJobFailure vocabulary is the
 * model (code / message / retriable / details). `terminalStatus` selects
 * which terminal lifecycle the failure records when it is NOT retried:
 * plain failures → "failed", timeouts → "timed_out". Engine failure
 * records map onto this shape field-for-field at the bridge adapter.
 */
export interface TypedJobFailure {
  readonly code: string;
  readonly message: string;
  readonly retriable: boolean;
  readonly terminalStatus: "failed" | "timed_out";
  readonly details?: JsonObject;
}

/** A non-fatal warning recorded with a job completion (§30 warnings). */
export interface JobWarning {
  readonly code: string;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Actor (§30: the submitting actor; the bridge enriches "engine-runner")
// ---------------------------------------------------------------------------

/** The actor that submitted the job. */
export type JobSubmitterActor =
  | { readonly kind: "user"; readonly identityRef: string }
  | { readonly kind: "service"; readonly name: string }
  | { readonly kind: "agent"; readonly instanceRef: string };

/**
 * §30 actor attribution recorded on every job event: the EXECUTING
 * authority (e.g. the runner's "engine-runner", or the worker id for
 * claim-side events) enriched with the SUBMITTING actor from the job
 * record — the enrichment the ENG-003 runner seam cannot perform itself.
 */
export interface JobActorAttribution {
  readonly executor: string;
  readonly submittedBy: JobSubmitterActor;
}

// ---------------------------------------------------------------------------
// Input, run info and §30 observability
// ---------------------------------------------------------------------------

/**
 * Job input: artifact REFERENCES plus small opaque parameters — never
 * inline payloads (spec §6/§26: large media stays in object storage and is
 * referenced, never carried over the control plane).
 */
export interface DurableJobInput {
  readonly inputArtifactRefs: readonly ArtifactRef[];
  readonly parameters: JsonObject;
}

/**
 * §30 run identity + versions for the current/last attempt (engine and
 * capability identity apply to engine-execution/benchmark jobs; null for
 * kinds without an engine behind them).
 */
export interface DurableJobRunInfo {
  readonly runId: string | null;
  readonly engineId: EngineId | null;
  readonly engineVersion: Version | null;
  readonly capabilityId: CapabilityId | null;
  readonly capabilityVersion: Version | null;
  readonly workerId: string | null;
}

/**
 * §30 observability block captured from the completing attempt: duration,
 * cost, resource usage, warnings, output artifact refs and provenance.
 */
export interface DurableJobObservability {
  readonly runId: string | null;
  readonly engineId: EngineId | null;
  readonly engineVersion: Version | null;
  readonly capabilityId: CapabilityId | null;
  readonly capabilityVersion: Version | null;
  readonly outputArtifactRefs: readonly ArtifactRef[];
  readonly durationMs: Milliseconds;
  readonly cost: MoneyAmount | null;
  readonly resourceUsage: ResourceUsage | null;
  readonly warnings: readonly JobWarning[];
  readonly provenance: JobProvenance | null;
}

/**
 * Provenance of one job execution (§30). Structurally mirrors the engine
 * RunProvenance with nullable identity so engine executions copy over
 * losslessly while non-engine kinds can still record run identity + time.
 */
export interface JobProvenance {
  readonly engineId: EngineId | null;
  readonly engineVersion: Version | null;
  readonly capabilityId: CapabilityId | null;
  readonly capabilityVersion: Version | null;
  readonly modelIdentity: string | null;
  readonly recordedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Lease (claim visibility semantics)
// ---------------------------------------------------------------------------

/** A claim lease: the token authorizes claim-held mutations until expiry. */
export interface JobLease {
  readonly token: LeaseToken;
  readonly workerId: string;
  readonly attempt: number;
  readonly acquiredAt: Timestamp;
  /** Epoch milliseconds; at expiry the job becomes reclaimable (crash recovery). */
  readonly expiresAtMs: number;
  readonly durationMs: Milliseconds;
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/**
 * One durable job record — the durable-job AUTHORITY shape (§26). Fields:
 * id, tenant scope, §26 kind, job contract version, submitting actor,
 * artifact-ref inputs, lifecycle status, attempt count, declared retry
 * policy, §30 run info + observability, last typed failure, timestamps
 * (injectable clock), the current lease, backoff-waiting and dead-letter
 * stamps.
 */
export interface DurableJobRecord {
  readonly id: DurableJobId;
  readonly jobKey: JobKey;
  readonly scope: TenantScope;
  readonly kind: DurableJobKind;
  readonly contractVersion: Version;
  readonly submittedBy: JobSubmitterActor;
  readonly input: DurableJobInput;
  readonly status: DurableJobStatus;
  /** Execution attempts STARTED (claims), including the current one. */
  readonly attemptCount: number;
  readonly retryPolicy: JobRetryPolicy;
  readonly run: DurableJobRunInfo;
  readonly observability: DurableJobObservability | null;
  readonly failure: TypedJobFailure | null;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
  /** Epoch ms before which a backoff-waiting queued job is not claimable. */
  readonly nextAttemptAtMs: number | null;
  readonly lease: JobLease | null;
  readonly deadLetteredAt: Timestamp | null;
}

// ---------------------------------------------------------------------------
// Submission, completion and queries
// ---------------------------------------------------------------------------

/** Input to enqueue: everything the record needs (except machine fields). */
export interface DurableJobSubmission {
  readonly scope: TenantScope;
  readonly jobKey: JobKey;
  readonly kind: DurableJobKind;
  readonly contractVersion: Version;
  readonly submittedBy: JobSubmitterActor;
  readonly inputArtifactRefs: readonly ArtifactRef[];
  readonly parameters: JsonObject;
  readonly retryPolicy: JobRetryPolicy;
}

/**
 * §30 completion facts supplied by the completing worker (or materialized
 * by the bridge adapter from a runner observability record).
 * `executor` overrides the §30 executor attribution (the runner bridge
 * passes "engine-runner"; default is the claim's worker id).
 */
export interface JobCompletion {
  readonly executor?: string;
  readonly runId?: string;
  readonly engineId?: EngineId | null;
  readonly engineVersion?: Version | null;
  readonly capabilityId?: CapabilityId | null;
  readonly capabilityVersion?: Version | null;
  readonly outputArtifactRefs: readonly ArtifactRef[];
  readonly durationMs: Milliseconds;
  readonly cost?: MoneyAmount | null;
  readonly resourceUsage?: ResourceUsage | null;
  readonly warnings?: readonly JobWarning[];
  readonly provenance?: JobProvenance | RunProvenance | null;
}

/** Query for listing jobs, always tenant-scoped (§31). */
export interface JobListQuery {
  readonly tenantId: TenantId;
  readonly workspaceId?: WorkspaceId;
  readonly statuses?: readonly DurableJobStatus[];
  readonly kinds?: readonly DurableJobKind[];
  readonly limit?: number;
}
