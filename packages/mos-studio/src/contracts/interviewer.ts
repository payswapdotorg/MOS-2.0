/**
 * Interviewer representation contracts for one-person Studio formats.
 *
 * STUDIO-001 interface spike — TYPES ONLY (no runtime implementation).
 *
 * Basis: spec/mos-architecture-v2.0.md §14 (script and interview system):
 * - the interviewer for one-person podcasts can be voice, voice+text,
 *   avatar, prerecorded, generated or hybrid;
 * - adaptive follow-up questions are selected from a declared question /
 *   branch graph based on answers;
 * - generated interviewer material RETAINS synthetic/generated provenance.
 *
 * Architecture-lock #20 and the frozen manifest require the six
 * representation kinds; AGENTS.md ("Safety") forbids deceptive attribution,
 * so synthetic material is labeled at the type level (`synthetic-generated`
 * origin is a mandatory, non-optional field on every representation whose
 * material was not performed by a human).
 *
 * Backlog: STUDIO-004 (Adaptive Interviewer) implements against these types.
 */

import type {
  ArtifactId,
  CapabilityId,
  ConsentRef,
  EngineRef,
  RightsRef,
  ContractVersion,
} from "./refs.js";

/** The six interviewer representation kinds (architecture-lock #20). */
export type InterviewerRepresentationKind =
  | "voice"
  | "text"
  | "avatar"
  | "prerecorded"
  | "generated"
  | "hybrid";

/** Where the interviewer's material originates — mandatory label (§14). */
export type InterviewerMaterialOrigin =
  | "human-performed"
  | "synthetic-generated"
  | "mixed";

/**
 * Provenance label for interviewer material. Synthetic/generated material
 * MUST declare `origin: "synthetic-generated" | "mixed"` plus the generating
 * capability/engine so attribution stays truthful end-to-end (§14, §27,
 * §30 observability).
 */
export interface InterviewerProvenance {
  readonly origin: InterviewerMaterialOrigin;
  /** Capability that generated the material, when synthetic (e.g. generate_voice). */
  readonly generatorCapability?: CapabilityId;
  /** Engine version recorded when synthetic material was produced (§30). */
  readonly generatorEngine?: EngineRef;
  /** Engine output version link for reproducibility. */
  readonly generatorOutputVersion?: ContractVersion;
  /** Consent/rights backing when a human performed the material. */
  readonly humanConsentRefs?: readonly ConsentRef[];
}

/** Voice-delivered interviewer (e.g. synthesized or recorded voice asking questions). */
export interface VoiceInterviewerRepresentation {
  readonly representation: "voice";
  readonly provenance: InterviewerProvenance;
}

/** Text-only interviewer (questions appear as text; answers may be spoken). */
export interface TextInterviewerRepresentation {
  readonly representation: "text";
  readonly provenance: InterviewerProvenance;
}

/** On-screen avatar asking the questions (visual persona is synthetic by construction). */
export interface AvatarInterviewerRepresentation {
  readonly representation: "avatar";
  readonly provenance: InterviewerProvenance;
}

/**
 * Prerecorded interviewer: complete question material captured earlier by a
 * human. References a stored artifact with explicit rights/consent — a
 * public URL never implies rights (§27).
 */
export interface PrerecordedInterviewerRepresentation {
  readonly representation: "prerecorded";
  readonly provenance: InterviewerProvenance;
  readonly sourceArtifact: ArtifactId;
  readonly rightsRef: RightsRef;
  readonly consentRefs: readonly ConsentRef[];
}

/**
 * Generated interviewer: the interviewer persona AND its material are
 * produced by engines at runtime. Synthetic labeling is mandatory.
 */
export interface GeneratedInterviewerRepresentation {
  readonly representation: "generated";
  readonly provenance: InterviewerProvenance;
  /** Declared generation capabilities required (e.g. generate_questions, generate_voice, animate_avatar). */
  readonly requiredCapabilities: readonly CapabilityId[];
}

/**
 * Hybrid interviewer: several representation components combined (e.g.
 * prerecorded core questions + generated adaptive follow-ups). Each
 * component carries its own provenance label.
 */
export interface HybridInterviewerRepresentation {
  readonly representation: "hybrid";
  readonly components: readonly InterviewerRepresentationComponent[];
}

/**
 * Discriminated union of all interviewer representations. Consumers must
 * narrow on `representation` — never assume a single modality.
 */
export type InterviewerRepresentation =
  | VoiceInterviewerRepresentation
  | TextInterviewerRepresentation
  | AvatarInterviewerRepresentation
  | PrerecordedInterviewerRepresentation
  | GeneratedInterviewerRepresentation
  | HybridInterviewerRepresentation;

/** One component of a hybrid representation. */
export type InterviewerRepresentationComponent = Exclude<
  InterviewerRepresentation,
  HybridInterviewerRepresentation
>;

/** Node id inside a declared adaptive question/branch graph. */
export type QuestionGraphNodeId = string;

/**
 * Reference to a declared adaptive question/branch graph (§14). Follow-up
 * questions are selected from this graph based on the participant's
 * answers; the graph itself is a versioned artifact owned outside the
 * Studio session.
 */
export interface AdaptiveQuestionGraphRef {
  readonly graphId: string;
  readonly version: ContractVersion;
}

/**
 * Requirements a {@link ./studio-format.ts!StudioFormat StudioFormat} places
 * on interviewer support (which representations the format can drive, and
 * whether adaptive questioning is required).
 */
export interface InterviewerRequirements {
  readonly supportedRepresentations: readonly InterviewerRepresentationKind[];
  readonly requiresAdaptiveQuestionGraph: boolean;
  /** Whether at least one human-performed representation is required (fully-generated interviews disallowed). */
  readonly requiresHumanParticipant: boolean;
  /** Whether synthetic interviewer material must carry explicit disclosure to viewers. */
  readonly requiresSyntheticDisclosure: boolean;
}
