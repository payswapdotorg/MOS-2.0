/**
 * Shared opaque reference primitives for the MOS Content Studio contracts.
 *
 * STUDIO-001 interface spike — TYPES ONLY. This module contains no runtime
 * code, no constants and no side effects.
 *
 * Rationale (spec/mos-architecture-v2.0.md §5, §32; AGENTS.md "MOS
 * boundaries"): the Studio references entities owned by other MOS
 * authorities (production requests, agent organizations, artifacts, rights,
 * consent, capabilities, engines). Each cross-authority reference is an
 * opaque branded string so that a session id can never be accidentally used
 * where an organization ref is required. The branding is purely type-level
 * (erased at compile time); it is not runtime data.
 *
 * These are studio-local mirror aliases. When `@mos/contracts` lands
 * (Wave 1), the canonical shared aliases are imported from there instead;
 * nothing in this package is a second business authority.
 */

declare const mosRefBrand: unique symbol;

/**
 * Branded opaque reference. `T` is the underlying scalar carried over the
 * wire; `B` is the reference kind used only by the type checker.
 */
export type MosRef<T, B extends string> = T & { readonly [mosRefBrand]: B };

/** Reference to a {@link ./studio-session.ts!StudioSession StudioSession}. */
export type StudioSessionId = MosRef<string, "StudioSessionId">;

/** Reference to a {@link ./studio-artifact-package.ts!StudioArtifactPackage StudioArtifactPackage}. */
export type StudioArtifactPackageId = MosRef<string, "StudioArtifactPackageId">;

/** Reference to a versioned Agent Organization loaded into a Studio session. */
export type StudioOrganizationId = MosRef<string, "StudioOrganizationId">;

/** Reference to a ProductionRequest owned by the `production` module. */
export type ProductionRequestId = MosRef<string, "ProductionRequestId">;

/** Reference to a Production Strategy owned by the `production` module. */
export type StrategyRef = MosRef<string, "StrategyRef">;

/** Reference to a Transform Graph owned by the `production` module. */
export type TransformGraphRef = MosRef<string, "TransformGraphRef">;

/** Reference to an Artifact owned by the `content` module. */
export type ArtifactId = MosRef<string, "ArtifactId">;

/** Reference to a MOS identity owned by the `identity` module. */
export type IdentityRef = MosRef<string, "IdentityRef">;

/** Reference to a MOS account boundary (identity → account is 1:N, never merged). */
export type AccountRef = MosRef<string, "AccountRef">;

/** Reference to a capture device bound to one participant account boundary. */
export type DeviceRef = MosRef<string, "DeviceRef">;

/** Reference to a participant inside a single Studio session. */
export type SessionParticipantId = MosRef<string, "SessionParticipantId">;

/** Reference to a participation grant issued for one session participant. */
export type ParticipationGrantId = MosRef<string, "ParticipationGrantId">;

/** Reference to a consent record owned by the `rights` module. */
export type ConsentRef = MosRef<string, "ConsentRef">;

/** Reference to a provenance record owned by the `rights` module. */
export type ProvenanceRef = MosRef<string, "ProvenanceRef">;

/** Reference to a rights context owned by the `rights` module. */
export type RightsRef = MosRef<string, "RightsRef">;

/** Reference to a rights/policy violation record used by rejections. */
export type RightsPolicyViolationRef = MosRef<string, "RightsPolicyViolationRef">;

/** Reference to a capability requirement owned by the `capabilities` module. */
export type CapabilityId = MosRef<string, "CapabilityId">;

/** Reference to an engine registered in the `engines` module registry. */
export type EngineRef = MosRef<string, "EngineRef">;

/** Reference to a Human Production Task owned by the `production` module. */
export type HumanProductionTaskRef = MosRef<string, "HumanProductionTaskRef">;

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

/** Reference to a Lab production candidate that selected an organization. */
export type LabCandidateRef = MosRef<string, "LabCandidateRef">;

/** Reference into object/media storage. Per AGENTS.md ("Media") and §6 of the
 * architecture, large media never travels over control-plane RPC; only this
 * storage reference does.
 */
export type StorageRef = MosRef<string, "StorageRef">;

/** Content digest of a stored artifact (e.g. multihash string). */
export type ContentDigest = MosRef<string, "ContentDigest">;

/** Tenant/workspace scope required on every mutable MOS artifact (§31). */
export type TenantId = MosRef<string, "TenantId">;

/** ISO-8601 UTC timestamp. */
export type Timestamp = string;

/** Monetary amount; `amount` is a decimal string to avoid float drift. */
export interface MoneyAmount {
  readonly currency: string;
  readonly amount: string;
}

/** Duration in seconds. */
export type DurationSeconds = number;

/** Immutable, monotonic aggregate version counter. */
export type ContractVersion = number;

/**
 * Role a participant holds in a Studio session (§15 multi-account sessions;
 * §14 one-person podcasts need an interviewer role). Shared between the
 * session and format contracts.
 */
export type SessionParticipantRole = "interviewer" | "subject" | "operator" | "observer";
