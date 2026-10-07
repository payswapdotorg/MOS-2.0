/**
 * Shared reference primitives for the MOS Content Studio contracts.
 *
 * RECONCILE-C (Wave 2): this module is now a THIN RE-EXPORT LAYER over
 * `@mos/contracts` (CORE-001, the canonical authority for the frozen
 * core-contracts vocabulary). The W0-C spike mirrored these branded ids and
 * opaque cross-authority references locally; the true duplicates are replaced
 * by canonical imports so a `@mos/contracts` reference and a studio reference
 * are the SAME compile-time type (nominal brands unify at the source).
 *
 * Studio-SPECIFIC references that the canonical contracts do not define
 * (capture devices, session participants, participation grants, studio-local
 * graph ids, delay/return-contract refs) remain local below. Money stays a
 * studio-local decimal-string shape (contracts' `MoneyAmount` uses a numeric
 * `amount`; reconciling the cost-accounting story is a later-wave concern) —
 * documented, deliberate, and test-pinned.
 */

import type { AgentOrganization, Branded } from "@mos/contracts";

// ---------------------------------------------------------------------------
// Canonical shared vocabulary (TRUE duplicates of the W0-C mirror — imported)
// ---------------------------------------------------------------------------

export type {
  // Record identifiers
  ArtifactId,
  CapabilityId,
  EngineId,
  ProductionRequestId,
  StudioArtifactPackageId,
  StudioFormatId,
  StudioSessionId,
  Version,
  // Opaque cross-authority references
  AccountRef,
  AuthorizationRef,
  ConsentRef,
  ContentDigest,
  EvaluatorRef,
  IdentityRef,
  LabCandidateRef,
  ProvenanceRef,
  RightsRef,
  StorageRef,
  StrategyRef,
  TenantId,
  Timestamp,
  TransformGraphRef,
  WorkspaceId,
} from "@mos/contracts";

// Canonical aliases under their studio names (same referent, canonical brand):
// an AgentOrganization record id (indexed off the canonical contract record),
// a HumanProductionTask record id, and an Engine record id. Studio monotonic
// counters keep the plain-number `ContractVersion` below (documented studio
// extension).
export type StudioOrganizationId = AgentOrganization["id"];
export type { HumanProductionTaskId as HumanProductionTaskRef } from "@mos/contracts";
export type { EngineId as EngineRef } from "@mos/contracts";

// ---------------------------------------------------------------------------
// Studio-specific references (no canonical equivalent — stay local)
// ---------------------------------------------------------------------------

declare const mosRefBrand: unique symbol;

/**
 * Branded opaque reference (studio-local kinds only). `T` is the underlying
 * scalar; `B` is the reference kind used only by the type checker.
 */
export type MosRef<T, B extends string> = T & { readonly [mosRefBrand]: B };

/** Reference to a capture device bound to one participant account boundary. */
export type DeviceRef = MosRef<string, "DeviceRef">;

/** Reference to a participant inside a single Studio session. */
export type SessionParticipantId = MosRef<string, "SessionParticipantId">;

/** Reference to a participation grant issued for one session participant. */
export type ParticipationGrantId = MosRef<string, "ParticipationGrantId">;

/** Reference to a rights/policy violation record used by rejections. */
export type RightsPolicyViolationRef = MosRef<string, "RightsPolicyViolationRef">;

/** Reference to acceptance criteria owned by the `production` module. */
export type AcceptanceCriteriaRef = MosRef<string, "AcceptanceCriteriaRef">;

/** Reference to a delay policy owned by the `production` module (§18). */
export type DelayPolicyRef = MosRef<string, "DelayPolicyRef">;

/** Reference to the return contract of a ProductionRequest (§13 Lab mode). */
export type ReturnContractRef = MosRef<string, "ReturnContractRef">;

/** Reference to a conversation graph derived from session transcripts. */
export type ConversationGraphId = MosRef<string, "ConversationGraphId">;

/** Reference to an edit graph (editorial decisions/timeline) for a session. */
export type EditGraphId = MosRef<string, "EditGraphId">;

/** Reference to a versioned script/question graph (§14, STUDIO-003). */
export type ScriptGraphId = MosRef<string, "ScriptGraphId">;

/** Reference to an immutable intent record (§14, STUDIO-003). */
export type IntentRecordId = MosRef<string, "IntentRecordId">;

/** Reference to one recorded answer inside an interview (§14, STUDIO-003). */
export type AnswerRef = MosRef<string, "AnswerRef">;

/** Reference to one adaptive interviewer session (§14, STUDIO-004). */
export type InterviewerSessionId = MosRef<string, "InterviewerSessionId">;

/**
 * Monetary amount; `amount` is a decimal string to avoid float drift.
 * Studio-local shape (canonical `MoneyAmount` in `@mos/contracts` uses a
 * numeric amount) — reconciled when cost accounting leaves the studio seam.
 */
export interface MoneyAmount {
  readonly currency: string;
  readonly amount: string;
}

/** Duration in seconds. */
export type DurationSeconds = number;

/**
 * Immutable, monotonic aggregate version counter (studio-local, plain number:
 * the runtime bumps it with arithmetic). The canonical branded `Version` is
 * imported where canonical descriptors require it.
 */
export type ContractVersion = number;

/**
 * Role a participant holds in a Studio session (§15 multi-account sessions;
 * §14 one-person podcasts need an interviewer role). Shared between the
 * session and format contracts.
 */
export type SessionParticipantRole = "interviewer" | "subject" | "operator" | "observer";

/** Compile-time-only brand helper re-exported for studio-local kinds. */
export type { Branded };
