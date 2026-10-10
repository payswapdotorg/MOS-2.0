/**
 * BRIDGE-003 — the real-experiment authority port (TWELVE public methods,
 * the architecture policy maxPublicMethods budget exactly).
 *
 * Write paths: `createBinding` (the gate-ordered §24 chain — the ONLY path
 * that mints experiment state), `advanceMeasurement` (the durable
 * measurement segment runner — validates the REAL queue claim, advances
 * created → running → measured), `analyse` (appends the outcome record),
 * `closeExperiment` (the terminal closure: `closed` or the FIRST-CLASS
 * `abandoned` with reason + snapshot). Read paths: the experiment chain
 * reads, the evidence chain reads, the outcome reads + the outcome
 * observation (the LAB-018 boundary projection), the binding-attempt audit
 * log and the digest-sealed integrity verification. There is NO update or
 * delete method anywhere on the surface — append-only by construction.
 */

import type { IdentityRef, TenantScope } from "@mos/contracts";

import type {
  RealExperimentBindingOutcome,
  RealExperimentBindingRequest,
} from "./binding-request.js";
import type {
  ExperimentAbandonmentSnapshot,
  RealExperimentBindingAuditRecord,
  RealExperimentRecord,
} from "./experiment-record.js";
import type { ExperimentEvidenceRecord } from "./evidence.js";
import type { ExperimentOutcomeObservation, ExperimentOutcomeRecord } from "./outcome.js";
import type { ExperimentId, ExperimentObservationId } from "./ids.js";

// ---------------------------------------------------------------------------
// The durable measurement segment (§26 — the worker-facing surface)
// ---------------------------------------------------------------------------

/**
 * The claim frame a worker presents: the REAL durable job's id + lease
 * token (the queue granted the lease; the authority validates it against
 * the job's live lease before any mutation — no synchronous-HTTP durable
 * claims exist).
 */
export interface ExperimentJobClaim {
  readonly jobId: string;
  readonly leaseToken: string;
  readonly workerId: string;
}

/** The typed failure model of {@link RealExperimentAuthorityPort.advanceMeasurement}. */
export type AdvanceMeasurementFailure =
  | { readonly kind: "experiment-unresolved"; readonly reason: string }
  | { readonly kind: "job-not-resolvable"; readonly reason: string }
  | { readonly kind: "job-experiment-mismatch"; readonly reason: string }
  | { readonly kind: "claim-stale"; readonly reason: string }
  | { readonly kind: "experiment-not-runnable"; readonly reason: string }
  | { readonly kind: "queue-mutation-failed"; readonly reason: string }
  | { readonly kind: "evidence-store-rejection"; readonly reason: string };

/** Ok/failure pair of the measurement segment runner. */
export type AdvanceMeasurementOutcome =
  | {
      readonly ok: true;
      readonly value: {
        /** The experiment record after the segment (running, or measured). */
        readonly experiment: RealExperimentRecord;
        /** What happened to the durable job: retriable retry (window not elapsed) or completion. */
        readonly jobOutcome: "retry-scheduled" | "completed";
        /** The measured evidence record (present when jobOutcome is "completed"). */
        readonly evidence: ExperimentEvidenceRecord | null;
      };
    }
  | { readonly ok: false; readonly error: AdvanceMeasurementFailure };

// ---------------------------------------------------------------------------
// The analysis + closure failures
// ---------------------------------------------------------------------------

/** The typed failure model of {@link RealExperimentAuthorityPort.analyse}. */
export type AnalyseOutcomeFailure =
  | { readonly kind: "experiment-unresolved"; readonly reason: string }
  | { readonly kind: "experiment-not-measured"; readonly reason: string }
  | { readonly kind: "no-measured-evidence"; readonly reason: string }
  | { readonly kind: "empty-measured-evidence"; readonly reason: string }
  | { readonly kind: "outcome-store-rejection"; readonly reason: string };

/** The typed failure model of {@link RealExperimentAuthorityPort.closeExperiment}. */
export type CloseExperimentFailure =
  | { readonly kind: "experiment-unresolved"; readonly reason: string }
  | { readonly kind: "experiment-already-terminal"; readonly reason: string }
  | { readonly kind: "invalid-closure-request"; readonly reason: string }
  | { readonly kind: "experiment-store-rejection"; readonly reason: string };

/** One terminal closure request: `closed` (summary) or `abandoned` (§18 inputs). */
export type ExperimentClosureInput =
  | { readonly kind: "closed"; readonly summary: string }
  | {
      readonly kind: "abandoned";
      /**
       * The §18 abandonment INPUTS: reason + summary only — the snapshot's
       * justifying citations (latest evidence, job echo, timestamp) DERIVE
       * from the chain state inside the core, never caller-claimed.
       */
      readonly abandonment: { readonly reason: string; readonly summary: string };
    };

// ---------------------------------------------------------------------------
// The integrity report
// ---------------------------------------------------------------------------

/** The bit-for-bit immutability verification of one stored record version. */
export interface ExperimentIntegrityReport {
  readonly experimentId: ExperimentId;
  readonly recordVersion: number;
  readonly status: "intact" | "tampered";
  readonly recordedDigest: string;
  readonly recomputedDigest: string;
}

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

/**
 * The real-experiment/evidence/learning authority surface (BRIDGE-003).
 * TWELVE public methods (policy budget exactly). Fails closed with the
 * typed codes everywhere; a failed call appends no state.
 */
export interface RealExperimentAuthorityPort {
  /**
   * Run the §24 binding chain: candidate resolvable → mission linkage →
   * policy verdict → rights frame → production request → distribution
   * binding → experiment record (the durable job enqueued). An
   * attributable gate denial appends EXACTLY ONE audit record with
   * verbatim attribution and mints ZERO experiment state; caller-error
   * shapes record NOTHING.
   */
  createBinding(request: RealExperimentBindingRequest): Promise<RealExperimentBindingOutcome>;

  /**
   * Run the durable measurement segment under a REAL queue claim: validate
   * the claim (job key + live lease), advance `created` → `running`; when
   * the window has not elapsed, fail the job typed-retriable (declared
   * backoff — the worker retries); when elapsed, fold the platform-said
   * observations within the window into a measured evidence record,
   * complete the job with the §30 observability, and advance to
   * `measured`.
   */
  advanceMeasurement(
    scope: TenantScope,
    experimentId: ExperimentId,
    claim: ExperimentJobClaim,
  ): Promise<AdvanceMeasurementOutcome>;

  /**
   * Append the analysis outcome record over the latest measured evidence
   * (status `measured` → `analysed`). Fails closed with
   * `empty-measured-evidence` when no observation was folded (an empty
   * outcome would be a fake measurement basis — the LAB-018
   * no-calibration-evidence precedent).
   */
  analyse(
    scope: TenantScope,
    experimentId: ExperimentId,
    actor: IdentityRef,
  ): Promise<
    | { readonly ok: true; readonly value: { readonly outcome: ExperimentOutcomeRecord; readonly experiment: RealExperimentRecord } }
    | { readonly ok: false; readonly error: AnalyseOutcomeFailure }
  >;

  /**
   * Close the experiment terminally: `closed` (summary) or `abandoned`
   * (first-class §18 abandonment with reason + snapshot — the abandoned
   * path stays auditable forever through the append-only versions).
   */
  closeExperiment(
    scope: TenantScope,
    experimentId: ExperimentId,
    actor: IdentityRef,
    closure: ExperimentClosureInput,
  ): Promise<
    | { readonly ok: true; readonly value: { readonly experiment: RealExperimentRecord } }
    | { readonly ok: false; readonly error: CloseExperimentFailure }
  >;

  /** One experiment record version (latest, or exact) — cross-tenant ≡ unknown (§31). */
  getExperiment(
    scope: TenantScope,
    experimentId: ExperimentId,
    version?: number,
  ): RealExperimentRecord | undefined;

  /** Every experiment chain's latest version of one tenant (creation order). */
  listExperiments(scope: TenantScope): readonly RealExperimentRecord[];

  /** One evidence record version (latest, or exact) — cross-tenant ≡ unknown. */
  getEvidence(
    scope: TenantScope,
    experimentId: ExperimentId,
    version?: number,
  ): ExperimentEvidenceRecord | undefined;

  /** The full evidence version chain of one experiment (ascending). */
  listEvidenceVersions(scope: TenantScope, experimentId: ExperimentId): readonly ExperimentEvidenceRecord[];

  /** One outcome record version (latest, or exact) — cross-tenant ≡ unknown. */
  getOutcome(
    scope: TenantScope,
    experimentId: ExperimentId,
    version?: number,
  ): ExperimentOutcomeRecord | undefined;

  /**
   * Resolve one outcome observation id to its projection (the LAB-018
   * boundary), or `null` when unknown in this tenant scope. READ ONLY.
   */
  getOutcomeObservation(
    scope: TenantScope,
    observationId: ExperimentObservationId,
  ): ExperimentOutcomeObservation | null;

  /** Every binding-attempt audit record of one tenant, in append order (§30 exact-tenant reads). */
  listBindingAudits(scope: TenantScope): readonly RealExperimentBindingAuditRecord[];

  /**
   * Verify one experiment record version's bit-for-bit integrity (recompute
   * the digest). `null` when unknown in this tenant scope.
   */
  verifyExperimentIntegrity(
    scope: TenantScope,
    experimentId: ExperimentId,
    version: number,
  ): ExperimentIntegrityReport | null;
}
