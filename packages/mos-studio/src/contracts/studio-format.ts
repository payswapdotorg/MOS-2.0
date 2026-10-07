/**
 * Pluggable Studio format contracts.
 *
 * STUDIO-001 interface spike — TYPES ONLY (no runtime implementation).
 *
 * Contract mapping (spec/contracts/core-contracts-v2.0.yaml):
 *   StudioFormat.required = [id, version, inputRequirements, participantModel,
 *     captureRequirements, interviewerRequirements, organizationCompatibility,
 *     outputContract, provenanceRequirements, evaluationHooks]
 *
 * Basis: spec/mos-architecture-v2.0.md §13 (one runtime with pluggable
 * formats; initial formats: reaction, audio podcast, video podcast),
 * architecture policy specialRules.studio (`formatsMustBePluggable: true`),
 * frozen manifest studioFormats: [reaction, audio-podcast, video-podcast],
 * §14 (accepted studio inputs: complete script, question list, intent,
 * intent + source material).
 *
 * A format is a DECLARATION (data). A format PLUGIN is the executable
 * contract that validates inputs and drives a session for that format
 * inside the single Studio runtime. There is exactly one runtime — formats
 * never bring their own engines, providers or workflow machinery
 * (dependency matrix: studio is forbidden workflow/experiment/publisher
 * authority).
 *
 * Backlog: STUDIO-002 (Pluggable Format Framework), STUDIO-009/010/011/012
 * (reaction/podcast/audio/video formats) implement against these types.
 */

import type { CapabilityId, ContractVersion, SessionParticipantRole } from "./refs.js";
import type { FormatCaptureRequirements } from "./capture.js";
import type { InterviewerRequirements } from "./interviewer.js";
import type { StudioArtifactType } from "./studio-artifact-package.js";

/** Initial format ids (frozen manifest `studioFormats`). Literal union by design. */
export type InitialStudioFormatId = "reaction" | "audio-podcast" | "video-podcast";

/**
 * Any format id. Pluggability means new ids can appear beyond the initial
 * three; the string-extension keeps the literal union's autocomplete while
 * remaining open. Unknown ids must fail explicit validation — never guess.
 */
export type StudioFormatId = InitialStudioFormatId | (string & Record<never, never>);

/** Versioned format reference carried by sessions and production requests. */
export interface StudioFormatVersion {
  readonly formatId: StudioFormatId;
  readonly version: ContractVersion;
}

/** What a format accepts as session input (§14). */
export type StudioInputKind =
  | "complete-script"
  | "question-list"
  | "intent"
  | "intent-with-source-material";

/** Input requirements declared by a format. */
export interface FormatInputRequirements {
  readonly acceptedInputs: readonly StudioInputKind[];
  /** Whether source/reference artifacts must be rights-cleared before intake (§27). */
  readonly requiresRightsClearedSources: boolean;
  /** Whether intent-only sessions must produce a versioned script/question graph with provenance (§14). */
  readonly generatesScriptFromIntent: boolean;
}

/** Participant model declared by a format. */
export interface FormatParticipantModel {
  readonly minimumParticipants: number;
  readonly maximumParticipants: number;
  readonly allowedRoles: readonly SessionParticipantRole[];
  /** Whether multi-account capture (§15) is supported by this format. */
  readonly supportsMultiAccount: boolean;
}

/**
 * Organization compatibility declared by a format: what a loaded
 * organization must provide to execute this format. Checked explicitly at
 * load time (see organization-loading.ts) — an incompatible organization is
 * a loud failure, never a silent substitution.
 */
export interface OrganizationCompatibility {
  /** Capabilities the organization must declare (e.g. compose_reaction, render_timeline). */
  readonly requiredCapabilities: readonly CapabilityId[];
  /** Minimum organization version the format can execute with. */
  readonly minimumOrganizationVersion?: ContractVersion;
  /** Whether the organization may substitute declared equivalent capabilities. */
  readonly allowsCapabilitySubstitution: boolean;
}

/** Output contract declared by a format. */
export interface FormatOutputContract {
  /** Artifact types the format's final candidates may take. */
  readonly finalArtifactTypes: readonly StudioArtifactType[];
  /** Whether a single session may produce multiple final candidates. */
  readonly allowsMultipleFinalCandidates: boolean;
  /** Reference to acceptance criteria the final candidates must satisfy (evaluated per §19). */
  readonly acceptanceCriteriaRef?: string;
}

/** Provenance requirements declared by a format (§14, §27, §30). */
export interface FormatProvenanceRequirements {
  /** Synthetic/generated material must be labeled with generation capability/engine versions. */
  readonly requiresSyntheticDisclosure: boolean;
  /** Every raw human capture must carry consent refs before processing. */
  readonly requiresConsentRefsOnRawCapture: boolean;
  /** Every produced artifact must record the engine/capability versions used. */
  readonly requiresEngineVersionRecording: boolean;
}

/** Points in the session pipeline where evaluation hooks run. */
export type StudioEvaluationHookStage =
  | "post-capture"
  | "post-processing"
  | "final-candidate"
  | "pre-package";

/** One declared evaluation hook. */
export interface EvaluationHookDescriptor {
  readonly stage: StudioEvaluationHookStage;
  /** Capability that evaluates at this stage (e.g. evaluate_content). */
  readonly evaluatorCapability: CapabilityId;
  /** Whether the hook is blocking (failure stops the pipeline) or advisory. */
  readonly blocking: boolean;
}

/** Evaluation hooks declared by a format. */
export interface FormatEvaluationHooks {
  readonly hooks: readonly EvaluationHookDescriptor[];
}

/**
 * A Studio format declaration. Field-for-field match of
 * core-contracts-v2.0.yaml StudioFormat required fields.
 */
export interface StudioFormat {
  readonly id: StudioFormatId;
  readonly version: ContractVersion;
  readonly inputRequirements: FormatInputRequirements;
  readonly participantModel: FormatParticipantModel;
  readonly captureRequirements: FormatCaptureRequirements;
  readonly interviewerRequirements: InterviewerRequirements;
  readonly organizationCompatibility: OrganizationCompatibility;
  readonly outputContract: FormatOutputContract;
  readonly provenanceRequirements: FormatProvenanceRequirements;
  readonly evaluationHooks: FormatEvaluationHooks;
}

/** Why a session input failed format validation. */
export type FormatInputRejectionReason =
  | { readonly kind: "unsupported-input-kind"; readonly inputKind: StudioInputKind }
  | { readonly kind: "source-rights-not-cleared"; readonly sourceRef: string }
  | { readonly kind: "participant-count-out-of-range"; readonly participantCount: number }
  | { readonly kind: "missing-script-or-question-graph" }
  | { readonly kind: "format-not-registered"; readonly formatId: StudioFormatId };

/** Result of plugin input validation. */
export type FormatInputValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: readonly FormatInputRejectionReason[] };

/**
 * Canonical session-intake shape the runtime hands to
 * {@link StudioFormatPlugin.validateSessionInput}. The parameter stays
 * `unknown` on the plug-in contract (custom plug-ins may validate richer
 * shapes); built-in descriptors narrow to this type.
 *
 * `participantCount` is optional: when the planned count is known at intake
 * (ProductionRequest human tasks, standalone plan) it is validated
 * immediately; otherwise the runtime enforces the model bounds at join
 * (maximum) and processing start (minimum).
 */
export interface SessionIntakeForValidation {
  readonly inputKind: StudioInputKind;
  readonly sourceArtifacts: readonly {
    readonly artifactId: string;
    readonly rightsCleared: boolean;
  }[];
  readonly participantCount?: number;
  /** Whether a script or question graph is already available (vs. intent-only). */
  readonly hasScriptOrQuestionGraph: boolean;
}

/**
 * An organization decision point exposed by a format (§16 reaction
 * production: layout/timing choices are production-program variables decided
 * by the loaded organization, NOT universal Studio hard-codes).
 *
 * A format descriptor exposes the decision POINTS it leaves open; it never
 * encodes a concrete choice for them. `decidedBy` is fixed to
 * `"organization"` — the Studio runtime has no authority over these values.
 */
export interface OrganizationDecisionPoint {
  /** Stable id of the open decision (e.g. "reaction-layout", "reaction-timing"). */
  readonly pointId: string;
  /** What is being decided, phrased generically (no concrete layout/timing values). */
  readonly description: string;
  /** Authority marker: always "organization" (§16). */
  readonly decidedBy: "organization";
}

/**
 * The format plug-in contract. One implementation per format id/version,
 * loaded by the single Studio runtime. A plug-in carries EVERY required
 * aspect of the {@link StudioFormat} contract (id/version, input
 * requirements, participant model, capture requirements, interviewer
 * requirements, organization compatibility, output contract, provenance
 * requirements, evaluation hooks) so registry completeness validation ==
 * StudioFormat completeness. It must NOT import engines, providers, or
 * workflow machinery directly (registry rule `studioToDirectProviderImports:
 * forbidden`; FINAL-TECH-LEAD-HANDOFF OSS path).
 */
export interface StudioFormatPlugin {
  readonly id: StudioFormatId;
  readonly version: ContractVersion;
  readonly inputRequirements: FormatInputRequirements;
  readonly participantModel: FormatParticipantModel;
  readonly captureRequirements: FormatCaptureRequirements;
  readonly interviewerRequirements: InterviewerRequirements;
  readonly organizationCompatibility: OrganizationCompatibility;
  readonly outputContract: FormatOutputContract;
  readonly provenanceRequirements: FormatProvenanceRequirements;
  readonly evaluationHooks: FormatEvaluationHooks;
  /**
   * Optional extension facet: organization decision points this format
   * deliberately leaves open (§16). Present on formats whose outputs depend
   * on production-program variables (e.g. reaction layout/timing). Absent on
   * formats with no open organization decisions.
   */
  readonly organizationDecisionPoints?: readonly OrganizationDecisionPoint[];
  /**
   * Validate a session intake against this format. Validation is explicit:
   * every failure is enumerated; there are no silent fallbacks to another
   * format or default shape.
   */
  validateSessionInput(input: unknown): FormatInputValidationResult;
}
