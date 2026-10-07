/**
 * StudioSession, StudioArtifactPackage and StudioFormat contracts (CORE-001).
 *
 * Contract mapping (spec/contracts/core-contracts-v2.0.yaml):
 *   StudioSession.required = [id, version, productionRequestRef,
 *     formatVersion, organizationRef, participants, lifecycle,
 *     artifactPackageRef]
 *   StudioArtifactPackage.required = [id, version, sessionRef, rawArtifacts,
 *     intermediateArtifacts, finalArtifacts, transcriptRefs,
 *     conversationGraphRef, editGraphRef, provenance, consent, evaluation,
 *     cost, duration]
 *   StudioFormat.required = [id, version, inputRequirements, participantModel,
 *     captureRequirements, interviewerRequirements,
 *     organizationCompatibility, outputContract, provenanceRequirements,
 *     evaluationHooks]
 *
 * Basis: spec/mos-architecture-v2.0.md §13 (Content Studio: one runtime,
 * pluggable formats, initial formats reaction/audio-podcast/video-podcast,
 * standalone sessions, Lab requests, arbitrary compatible organizations,
 * never publishes directly), §14 (script and interview system: one-person
 * adaptive interviewer), §15 (multi-account sessions: separate
 * identity/account-boundary/authorization/participation-grant/consent),
 * §16 (raw reaction capture is an intermediate artifact), §19 (output
 * evaluation; quality rejection distinct from rights/policy rejection;
 * every treatment creates a new immutable version), §12 (edit graphs are
 * MOS-owned; OpenTimelineIO is interchange only).
 *
 * Field vocabulary aligned with the @mos/studio interface spike (W0-C)
 * where the frozen YAML left shapes open, to minimize Wave-1 reconciliation.
 * The studio module (@mos/studio runtime, STUDIO-001+) implements against
 * these types.
 */

import type {
  AccountRef,
  AgentOrganizationId,
  AuthorizationRef,
  ConsentRef,
  ConversationGraphRef,
  EditGraphRef,
  EvaluatorRef,
  IdentityRef,
  JsonSchemaObject,
  Milliseconds,
  MoneyAmount,
  ProductionRequestId,
  ProvenanceRef,
  StudioArtifactPackageId,
  StudioFormatId,
  StudioSessionId,
  Timestamp,
  Version,
} from "./value-types.js";

import type { ArtifactRef } from "./artifact.js";

// ---------------------------------------------------------------------------
// StudioFormat (pluggable formats — formatsMustBePluggable)
// ---------------------------------------------------------------------------

/** Capture requirements one format imposes on a session. */
export interface CaptureRequirements {
  readonly audio: boolean;
  readonly video: boolean;
  readonly screenCapture: boolean;
}

/** Interviewer requirements one format imposes (spec §14 one-person adaptive interviewer). */
export interface InterviewerRequirements {
  readonly interviewerRequired: boolean;
  readonly adaptiveQuestioning: boolean;
}

/** One evaluation hook a format requires to run on outputs. */
export interface EvaluationHook {
  readonly hookId: string;
  readonly evaluator: EvaluatorRef;
}

/**
 * A pluggable studio format (reaction, audio podcast, video podcast, ...).
 * Formats declare what they need (inputs, participants, capture,
 * interviewer), which organizations they are compatible with, what they
 * output, which provenance labeling they require, and which evaluation
 * hooks run on their outputs.
 */
export interface StudioFormat {
  readonly id: StudioFormatId;
  readonly version: Version;
  readonly inputRequirements: JsonSchemaObject;
  readonly participantModel: JsonSchemaObject;
  readonly captureRequirements: CaptureRequirements;
  readonly interviewerRequirements: InterviewerRequirements;
  /** Compatibility constraints on loadable agent organizations (versioned). */
  readonly organizationCompatibility: JsonSchemaObject;
  /** Output contract final artifacts must satisfy. */
  readonly outputContract: JsonSchemaObject;
  /** Provenance labeling requirements (e.g. synthetic/generated labeling). */
  readonly provenanceRequirements: readonly string[];
  readonly evaluationHooks: readonly EvaluationHook[];
}

// ---------------------------------------------------------------------------
// StudioSession
// ---------------------------------------------------------------------------

/**
 * One participant in a studio session. Multi-account discipline (spec §15):
 * identity, account boundary, authorization, and consent are SEPARATE
 * references — accounts are never merged and consent is per-account.
 */
export interface SessionParticipant {
  readonly participantId: string;
  readonly identityRef: IdentityRef;
  readonly accountRef: AccountRef;
  readonly authorizationRef: AuthorizationRef;
  readonly consentRef: ConsentRef;
  /** Participant role in the session (e.g. "interviewer", "subject", "operator"). */
  readonly role: string;
}

/** Session lifecycle states (append-only transitions; terminal states are closed/abandoned/failed). */
export type StudioSessionLifecycleState =
  | "requested"
  | "loading"
  | "capturing"
  | "processing"
  | "review"
  | "packaged"
  | "closed"
  | "abandoned"
  | "failed";

/** One append-only lifecycle transition. */
export interface SessionStateTransition {
  readonly from: StudioSessionLifecycleState;
  readonly to: StudioSessionLifecycleState;
  readonly at: Timestamp;
}

/** Session lifecycle: current state plus the append-only transition history. */
export interface StudioSessionLifecycle {
  readonly state: StudioSessionLifecycleState;
  readonly transitions: readonly SessionStateTransition[];
}

/**
 * The interactive AI+human production environment session. The session
 * references the production request it actuates, the resolved format
 * version, the explicitly loaded (versioned) organization, its
 * participants, its lifecycle, and the artifact package it produces.
 */
export interface StudioSession {
  readonly id: StudioSessionId;
  readonly version: Version;
  readonly productionRequestRef: ProductionRequestId;
  /** Version of the studio format this session runs (format id comes from the request). */
  readonly formatVersion: Version;
  readonly organizationRef: AgentOrganizationId;
  readonly participants: readonly SessionParticipant[];
  readonly lifecycle: StudioSessionLifecycle;
  readonly artifactPackageRef: StudioArtifactPackageId;
}

// ---------------------------------------------------------------------------
// StudioArtifactPackage
// ---------------------------------------------------------------------------

/** Verdict of the studio output evaluation (spec §19). */
export type StudioEvaluationVerdict =
  | "accepted"
  | "quality-rejected"
  | "strategy-rejected"
  | "rights-rejected"
  | "pending";

/** Evaluation summary attached to a studio artifact package. */
export interface StudioEvaluation {
  readonly verdict: StudioEvaluationVerdict;
  readonly evaluator: EvaluatorRef;
}

/**
 * The artifact package produced by a session: raw captures, intermediates
 * (raw human output becomes intermediate once the organization treats it —
 * §16), final candidates, transcript references, conversation and edit
 * graph references, provenance, per-participant consent, evaluation
 * summary, cost and duration. Raw human capture is never silently final.
 */
export interface StudioArtifactPackage {
  readonly id: StudioArtifactPackageId;
  readonly version: Version;
  readonly sessionRef: StudioSessionId;
  readonly rawArtifacts: readonly ArtifactRef[];
  readonly intermediateArtifacts: readonly ArtifactRef[];
  readonly finalArtifacts: readonly ArtifactRef[];
  readonly transcriptRefs: readonly ArtifactRef[];
  readonly conversationGraphRef: ConversationGraphRef;
  readonly editGraphRef: EditGraphRef;
  readonly provenance: ProvenanceRef;
  /** Consent per participating account (multi-account discipline, §15). */
  readonly consent: readonly ConsentRef[];
  readonly evaluation: StudioEvaluation;
  readonly cost: MoneyAmount;
  readonly duration: Milliseconds;
}
