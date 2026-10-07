/**
 * Studio artifact package contracts — raw / intermediate / final artifacts.
 *
 * STUDIO-001 interface spike — TYPES ONLY (no runtime implementation).
 *
 * Contract mapping (spec/contracts/core-contracts-v2.0.yaml):
 *   StudioArtifactPackage.required = [id, version, sessionRef, rawArtifacts,
 *     intermediateArtifacts, finalArtifacts, transcriptRefs,
 *     conversationGraphRef, editGraphRef, provenance, consent, evaluation,
 *     cost, duration]
 *   ArtifactRef.required = [artifactId, version, tenantId, digest, type,
 *     storageRef, rightsRef, provenanceRef]
 *
 * Basis: spec/mos-architecture-v2.0.md §6 (artifact graph: reference →
 * acquired input → raw capture → transform → intermediate → composition →
 * final candidate; raw human capture is never silently final; lineage is
 * immutable), §16 (raw reaction capture enters the organization as an
 * INTERMEDIATE artifact), §12 (OpenTimelineIO is the editorial interchange
 * layer — never the MOS authority), §31 (tenant scope on mutable artifacts).
 *
 * Backlog: STUDIO-013 (Artifact Package / Provenance) implements against
 * these types.
 */

import type {
  ArtifactId,
  ConsentRef,
  ContentDigest,
  ContractVersion,
  DurationSeconds,
  MoneyAmount,
  ProvenanceRef,
  RightsRef,
  StudioArtifactPackageId,
  StudioSessionId,
  StorageRef,
  TenantId,
  Timestamp,
  ConversationGraphId,
  EditGraphId,
} from "./refs.js";

/**
 * Artifact stage in the Studio pipeline. The distinction is load-bearing:
 * - `raw`: captured/imported human or engine output BEFORE the organization
 *   treats it (§6). Raw human output is never silently treated as final
 *   (WORKER-CONTRACT Studio rules: "raw human output is intermediate").
 * - `intermediate`: output of a transform/composition step inside the loaded
 *   organization — including the raw capture once it has entered the
 *   organization's production program (§16).
 * - `final`: candidate outputs satisfying the format output contract,
 *   assembled into the package for evaluation/hand-off. The Studio still
 *   never publishes them directly (§13, `noDirectPublication`).
 */
export type StudioArtifactStage = "raw" | "intermediate" | "final";

/** Coarse artifact media/type classification used by format output contracts. */
export type StudioArtifactType = "audio" | "video" | "image" | "text" | "timeline" | "graph";

/** How an artifact came to exist (§6 artifact metadata: creation method). */
export type StudioArtifactCreationMethod =
  | "human-capture"
  | "human-import"
  | "engine-generated"
  | "organization-transform"
  | "composition";

/**
 * Studio-side artifact reference. Field-for-field superset of the frozen
 * `ArtifactRef` core contract (artifactId, version, tenantId, digest, type,
 * storageRef, rightsRef, provenanceRef) plus the Studio stage, lineage
 * parents and creation method required by §6.
 */
export interface StudioArtifactRef {
  readonly artifactId: ArtifactId;
  readonly version: ContractVersion;
  readonly tenantId: TenantId;
  readonly digest: ContentDigest;
  readonly type: StudioArtifactType;
  readonly storageRef: StorageRef;
  readonly rightsRef: RightsRef;
  readonly provenanceRef: ProvenanceRef;
  /** Pipeline stage of THIS version (raw/intermediate/final). */
  readonly stage: StudioArtifactStage;
  /** Parent artifact versions (immutable lineage, §6; empty only for pure raw capture). */
  readonly parentArtifactRefs: readonly StudioArtifactRef[];
  readonly creationMethod: StudioArtifactCreationMethod;
}

/**
 * Reference to a session transcript. Transcripts are derived artifacts with
 * their own provenance (which engine transcribed, which version).
 */
export interface TranscriptRef {
  readonly artifact: StudioArtifactRef;
  /** Language tag of the transcript (BCP-47). */
  readonly language: string;
  /** Whether speaker diarization was applied. */
  readonly diarized: boolean;
}

/** Reference to the conversation graph derived from session transcripts. */
export interface ConversationGraphRef {
  readonly graphId: ConversationGraphId;
  readonly version: ContractVersion;
  readonly derivedFrom: readonly TranscriptRef[];
}

/**
 * Reference to the edit graph (editorial decisions/cuts/timeline) for a
 * session. Per §12, cut/timeline information may interoperate through
 * OpenTimelineIO, but the edit graph itself remains a MOS-owned structure —
 * OTIO is an interchange layer, never the authority.
 */
export interface EditGraphRef {
  readonly graphId: EditGraphId;
  readonly version: ContractVersion;
  /** Whether an OpenTimelineIO interchange export exists for this edit graph. */
  readonly otioInterchange: boolean;
}

/** Provenance summary over the whole package. */
export interface StudioArtifactPackageProvenance {
  /** Provenance records covering every artifact version in the package. */
  readonly provenanceRefs: readonly ProvenanceRef[];
  /** True only when every artifact's full parent lineage is recorded (§6). */
  readonly lineageComplete: boolean;
  /** True when any packaged material is synthetic/generated (must stay disclosed). */
  readonly containsSyntheticMaterial: boolean;
}

/** Consent summary over the whole package. */
export interface StudioArtifactPackageConsent {
  /** Consent records from every contributing participant (§15, §27). */
  readonly participantConsentRefs: readonly ConsentRef[];
  /** True only when every raw artifact is covered by at least one consent record. */
  readonly allRawArtifactsCovered: boolean;
}

/** Evaluation state of the package at a point in time (§19). */
export interface StudioArtifactPackageEvaluation {
  readonly status: "pending" | "evaluated";
  /** Distinct outcome kinds — quality rejection is never conflated with rights/policy rejection. */
  readonly outcome:
    | "accepted"
    | "quality-rejected"
    | "rights-policy-rejected"
    | "treatment-requested"
    | "not-applicable";
  /** Reference to the evaluation record when one exists. */
  readonly evaluationRef?: string;
}

/** Cost summary for producing the package. */
export interface StudioArtifactPackageCost {
  readonly total: MoneyAmount;
  /** Optional per-capability cost lines (capability → amount). */
  readonly byCapability?: ReadonlyArray<{
    readonly capability: string;
    readonly amount: MoneyAmount;
  }>;
}

/** Duration summary for producing the package. */
export interface StudioArtifactPackageDuration {
  readonly captureSeconds: DurationSeconds;
  readonly processingSeconds: DurationSeconds;
  readonly totalWallClockSeconds: DurationSeconds;
}

/**
 * The Studio output of one session: every artifact produced, at every stage,
 * with immutable lineage, consent, provenance, evaluation, cost and timing.
 *
 * Field-for-field match of core-contracts-v2.0.yaml StudioArtifactPackage
 * required fields.
 */
export interface StudioArtifactPackage {
  readonly id: StudioArtifactPackageId;
  readonly version: ContractVersion;
  readonly sessionRef: StudioSessionId;
  readonly rawArtifacts: readonly StudioArtifactRef[];
  readonly intermediateArtifacts: readonly StudioArtifactRef[];
  readonly finalArtifacts: readonly StudioArtifactRef[];
  readonly transcriptRefs: readonly TranscriptRef[];
  readonly conversationGraphRef: ConversationGraphRef;
  readonly editGraphRef: EditGraphRef;
  readonly provenance: StudioArtifactPackageProvenance;
  readonly consent: StudioArtifactPackageConsent;
  readonly evaluation: StudioArtifactPackageEvaluation;
  readonly cost: StudioArtifactPackageCost;
  readonly duration: StudioArtifactPackageDuration;
  readonly createdAt: Timestamp;
}
