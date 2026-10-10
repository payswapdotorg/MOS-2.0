/**
 * BRIDGE-003 — the binding request and its typed failure model.
 *
 * The caller frame of the §24 chain's final assembly: the DECLARED
 * citations the binding resolves (lab candidate, mission, policy set,
 * rights frame, production search result + selected candidate,
 * distribution publication, measurement window). Every ref must resolve
 * to an EXACT version of the underlying authority record; unresolvable
 * refs are typed failures, NEVER fabrication.
 *
 * Caller-shape failures append NO record (the W8-A discipline: nothing
 * attributable happened). Attributable gate denials (policy, rights)
 * append EXACTLY ONE audit record with verbatim authority attribution and
 * create ZERO experiment state (the failure values carry the audit
 * record).
 */

import type {
  ConsentRef,
  IdentityRef,
  MissionRef,
  RightsRef,
  TenantScope,
  Timestamp,
} from "@mos/contracts";
import type {
  ProductionProgramSearchResult,
  RankedCandidateProgram,
} from "@mos/production";

import type { LabCandidateCitation } from "./lab-candidate-seam.js";
import type { ExperimentPolicyRuleVersionRef } from "./authority-seams.js";
import type { ExperimentId } from "./ids.js";
import type { RealExperimentRecord, RealExperimentBindingAuditRecord } from "./experiment-record.js";

// ---------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------

/**
 * One real-experiment binding request. The production citation is the
 * REAL `@mos/production` search output (the selected candidate MUST be
 * the result's OWN `ranked` entry — a lookalike object is rejected
 * fail-closed; the no-op baseline is the search's own synthesized
 * comparison entry and is not experiment-bindable). The distribution
 * citation names the platform-confirmed publication whose artifact must
 * match the caller's declared `expectedArtifact` EXACTLY (the REAL
 * distribution record is the authority for what was distributed — §27
 * discipline adapted: the caller's citation must match reality, never
 * define it).
 */
export interface RealExperimentBindingRequest {
  /** Tenant/workspace scope (§31 — the experiment is tenant-scoped). */
  readonly scope: TenantScope;
  /** §30 actor — the principal binding the candidate into a real experiment. */
  readonly actor: IdentityRef;
  /** The DECLARED citation of the selected LAB-017 benchmark candidate. */
  readonly labCandidate: LabCandidateCitation;
  /** EXACT mission record version the linkage cites (never "latest"). */
  readonly mission: {
    readonly missionRef: MissionRef;
    readonly missionVersion: number;
  };
  /**
   * Policy rules to consult at the real-experiment-approval gate: exact
   * versions, in citation order (the caller's declared citation set; the
   * gate never discovers rules on its own).
   */
  readonly policy: readonly ExperimentPolicyRuleVersionRef[];
  /** The declared rights frame the experiment's distribution runs under. */
  readonly rightsFrame: {
    readonly rightsRefs: readonly RightsRef[];
    readonly consentRefs: readonly ConsentRef[];
  };
  /** The production citation: the REAL search result + the selected entry. */
  readonly production: {
    readonly searchResult: ProductionProgramSearchResult;
    readonly selected: RankedCandidateProgram;
  };
  /** The distribution citation: the platform-confirmed publication + expected artifact. */
  readonly distribution: {
    readonly publicationId: string;
    readonly expectedArtifact: { readonly artifactId: string; readonly version: number };
  };
  /** The declared measurement window + real-world context labels. */
  readonly measurement: {
    readonly windowStart: Timestamp;
    readonly windowEnd: Timestamp;
    readonly niche: string;
    readonly regime: string;
  };
}

// ---------------------------------------------------------------------------
// The typed failure model (result union — the MOS domain convention)
// ---------------------------------------------------------------------------

/**
 * Caller-shape/citation failures append NO record (nothing attributable
 * happened — no authority denied anything). Attributable gate denials
 * append EXACTLY ONE audit record (the §30-attributable attempt with the
 * authority's denial VERBATIM) and create ZERO experiment state; the
 * failure value carries the audit record.
 */
export type RealExperimentBindingFailure =
  // — request shape validation (nothing recorded) —
  | { readonly kind: "invalid-binding-request"; readonly reason: string }
  // — lab candidate resolution (nothing recorded) —
  | { readonly kind: "lab-candidate-unresolved"; readonly reason: string }
  | { readonly kind: "lab-candidate-not-counterfactual"; readonly reason: string }
  // — mission linkage (nothing recorded) —
  | { readonly kind: "mission-unresolved"; readonly reason: string }
  | { readonly kind: "mission-not-active"; readonly reason: string }
  // — production citation (nothing recorded) —
  | { readonly kind: "malformed-production-candidate"; readonly reason: string }
  | { readonly kind: "unversioned-production-candidate"; readonly reason: string }
  | { readonly kind: "candidate-not-in-result"; readonly reason: string }
  | { readonly kind: "no-op-baseline-not-experiment-bindable"; readonly reason: string }
  | { readonly kind: "production-tenant-mismatch"; readonly reason: string }
  // — distribution binding (nothing recorded) —
  | { readonly kind: "distribution-publication-unresolved"; readonly reason: string }
  | { readonly kind: "distribution-artifact-mismatch"; readonly reason: string }
  // — durable enqueue (nothing recorded — a composition/queue defect, fail loud) —
  | { readonly kind: "job-enqueue-failed"; readonly reason: string }
  // — store rejection (defense in depth) —
  | { readonly kind: "experiment-store-rejection"; readonly reason: string }
  // — attributable gate denials (ONE audit record appended; ZERO experiment state) —
  | {
      readonly kind: "policy-gate-denied";
      readonly stage: "policy-gate";
      readonly reason: string;
      readonly audit: RealExperimentBindingAuditRecord;
    }
  | {
      readonly kind: "rights-gate-denied";
      readonly stage: "rights-gate";
      readonly reason: string;
      readonly audit: RealExperimentBindingAuditRecord;
    };

/** Ok/failure pair of the binding attempt. */
export type RealExperimentBindingOutcome =
  | {
      readonly ok: true;
      readonly value: {
        /** The minted experiment record (v1, status `created`). */
        readonly experiment: RealExperimentRecord;
        /** The id of the experiment chain (the binding/evidence/outcome chain key). */
        readonly experimentId: ExperimentId;
        /** The durable job the measurement segment rides (REAL queue citation). */
        readonly jobId: string;
      };
    }
  | { readonly ok: false; readonly error: RealExperimentBindingFailure };
