/**
 * BRIDGE-003 authority seams — the declared gate/read surfaces the binding
 * chain consults, in the §24 order.
 *
 * REGISTRY EXACTNESS: `@mos/missions` and `@mos/production` and
 * `@mos/distribution` and `@mos/jobs` ARE registry dependencies of the
 * experiments module — their REAL types are imported directly here (the
 * `@mos/rights` direct-import precedent in BRIDGE-001's studio bridge).
 * `@mos/policy` and `@mos/rights` are NOT registry dependencies (registry
 * deps: contracts, missions, production, distribution, jobs), so the
 * policy verdict and the rights frame arrive through EXPERIMENTS-OWNED
 * declared gate ports (the W6-C/W8-A declared-seam discipline) — their
 * shapes are compat-pinned against the REAL authority shapes
 * (compat/lab-authority-compat.ts pins the mirror directions) and the
 * REAL runtime twins are wired in the compat battery
 * (compat/experiments-real-stack.test.ts — the MARKETING-001/BRIDGE-001
 * compat pattern, disclosed).
 *
 * GATE ORDER (the BRIDGE-001 pattern applied to this segment): policy →
 * rights — every gate verdict is fail-closed (denial attribution
 * VERBATIM), a denial means ZERO downstream invocations (the
 * invocation-counting spy pin), and every attributable denial appends
 * EXACTLY ONE typed audit record.
 */

import type {
  ConsentRef,
  IdentityRef,
  PolicyRef,
  RightsRef,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from "@mos/contracts";
import type { Mission, MissionId } from "@mos/missions";
import type {
  SocialObservationFilter,
  SocialObservationRecord,
  SocialPublicationRecord,
} from "@mos/distribution";
import type { JobQueuePort } from "@mos/jobs";

// ---------------------------------------------------------------------------
// The Mission segment (registry dep — the REAL repository behind the seam)
// ---------------------------------------------------------------------------

/**
 * The mission authority read seam. 1 public method (policy budget: 12).
 * Satisfied STRUCTURALLY by the REAL `@mos/missions` `MissionRepository`
 * (`getMission` — compat-pinned in the compat battery); the experiments
 * adapter narrows §31 (a record owned by ANOTHER tenant is `null` —
 * cross-tenant ≡ unknown, no existence leaks).
 */
export interface ExperimentMissionSource {
  /**
   * Fetch one mission (latest by default, the EXACT record version when
   * given), or `null` when unknown.
   */
  getMission(id: MissionId, version?: number): Mission | null;
}

/** The versioned mission linkage the binding records (§24 Mission segment). */
export interface ExperimentMissionLinkage {
  readonly missionRef: string;
  /** The EXACT mission record version cited (never "latest"). */
  readonly missionVersion: number;
  /** The mission's independently versioned reward spec (§21). */
  readonly rewardSpecVersion: number;
  /** The mission's lifecycle status at linkage time (echo). */
  readonly missionStatus: string;
  readonly linkedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// The Policy segment (declared gate seam — @mos/policy is NOT a dep)
// ---------------------------------------------------------------------------

/** Policy rule citation: exact version, citation order preserved. */
export interface ExperimentPolicyRuleVersionRef {
  readonly id: PolicyRef;
  readonly version: Version;
}

/** One real-experiment policy check the binding requests. */
export interface ExperimentPolicyCheckRequest {
  readonly scope: TenantScope;
  /** §30 actor — the principal binding the candidate into a real experiment. */
  readonly actor: IdentityRef;
  /** The declared subject (the cited lab candidate's canonical encoding). */
  readonly subjectRef: string;
  /**
   * The caller's DECLARED citation set consulted at this check — exact
   * versions, in citation order (the binding request's own `policy` list;
   * the gate never discovers rules on its own; an empty list fails closed).
   */
  readonly policy: readonly ExperimentPolicyRuleVersionRef[];
}

/**
 * The fail-closed verdict of one real-experiment policy check. `permitted`
 * arises ONLY from the authority's `allowed` verdict; `denied` carries the
 * authority's attribution VERBATIM (approval-required and
 * insufficient-policy both map to denied — the seam has no pending state,
 * the W6-C documented design call).
 */
export interface ExperimentPolicyVerdict {
  readonly decision: "permitted" | "denied";
  /** The authority's own outcome vocabulary, echoed verbatim. */
  readonly outcome: "allowed" | "denied" | "approval-required" | "insufficient-policy";
  /** The authority's denial attribution, VERBATIM (null when permitted). */
  readonly denialReason: string | null;
  /** The canonical policy ref the verdict cites (allowing or denying rule). */
  readonly policyRef: PolicyRef | null;
  /** The authority's §30 evaluation record id (its own audit log entry). */
  readonly evaluationRef: string | null;
}

/** The declared policy-gate seam. 1 public method (policy budget: 12). */
export interface ExperimentPolicyGatePort {
  /** Evaluate one real-experiment policy request — FAIL CLOSED. */
  check(request: ExperimentPolicyCheckRequest): ExperimentPolicyVerdict;
}

// ---------------------------------------------------------------------------
// The Rights segment (declared gate seam — @mos/rights is NOT a dep)
// ---------------------------------------------------------------------------

/** One reference resolution of the declared rights frame. */
export interface ExperimentRightsFrameResolution {
  readonly ref: string;
  readonly kind: "rights-grant" | "consent-record";
  readonly status: "active" | "unresolved" | "revoked" | "expired" | "foreign-tenant";
}

/** The rights frame verdict: per-reference resolutions (verbatim statuses). */
export interface ExperimentRightsFrameVerdict {
  readonly resolutions: readonly ExperimentRightsFrameResolution[];
  /** True only when every declared reference is active in this tenant. */
  readonly frameActive: boolean;
}

/** The declared rights frame the experiment's distribution runs under. */
export interface ExperimentRightsFrameRequest {
  readonly scope: TenantScope;
  /** §30 actor — the grantee the frame is evaluated for. */
  readonly actor: IdentityRef;
  readonly rightsRefs: readonly RightsRef[];
  readonly consentRefs: readonly ConsentRef[];
  /** Evaluation "now" (ISO-8601; expiry is exclusive). */
  readonly now: string;
}

/** The declared rights-gate seam. 1 public method (policy budget: 12). */
export interface ExperimentRightsGatePort {
  /** Resolve the declared rights frame — every ref must be active in-tenant. */
  resolveFrame(request: ExperimentRightsFrameRequest): ExperimentRightsFrameVerdict;
}

// ---------------------------------------------------------------------------
// The Distribution segment (registry dep — the REAL observation surfaces)
// ---------------------------------------------------------------------------

/**
 * The distribution observation source: the REAL `@mos/distribution`
 * platform-said surfaces the binding resolves and the measurement folds.
 * 2 public methods (policy budget: 12). Satisfied by the REAL adapter
 * (src/testing/real-authority-adapters.ts) over a REAL `SocialAdapterPort`
 * instance; the disclosed in-memory double lives with the battery.
 *
 * `getPublication` is an exact-id find over the tenant-scoped append-only
 * publication log (documented: the log is the authority; the adapter only
 * finds, never invents). `listObservations` is the observation log read
 * (platform-said, source-attributed — SOCIAL-001).
 */
export interface DistributionObservationSource {
  /** The platform-confirmed publication of the distributed artifact, or `undefined` when unknown in this tenant. */
  getPublication(
    tenantId: TenantId,
    publicationId: string,
  ): SocialPublicationRecord | undefined;
  /** The tenant-scoped append-only platform-said observation log (ascending order). */
  listObservations(
    tenantId: TenantId,
    filter?: SocialObservationFilter,
  ): readonly SocialObservationRecord[];
}

// ---------------------------------------------------------------------------
// The Workflow/Execution segment (registry dep — the REAL durable queue)
// ---------------------------------------------------------------------------

/**
 * The durable execution seam: the REAL `@mos/jobs` `JobQueuePort` — §26.
 * The experiments authority enqueues the measurement job (idempotent per
 * (tenant, jobKey)), the WORKER claims it through the queue's own leased
 * claim surface, and the authority's `advanceMeasurement` validates the
 * claim and performs the queue-side mutations through the same port. No
 * synchronous-HTTP durable claims exist anywhere on this surface.
 */
export type ExperimentJobQueue = JobQueuePort;
