/**
 * The reaction flow contracts (STUDIO-009; §16 reaction production): the
 * production PLAN, the RESULT and the typed ERROR surface. Split from
 * `reaction-flow.ts` (file-length policy).
 *
 * The plan carries: the reacted-to SOURCE/reference material (rights-gated —
 * §27), the reaction participants (real humans through §15 multi-account
 * consent gates, or synthetic-labeled one-person personas), the capture
 * rounds, and the organization's reaction-composition choices at the §16
 * declared decision points (the ORG decides; the caller stands in for the
 * org's decision output — the W3-C/W8-C disclosed discipline).
 */

import type {
  ConsentRef,
  IdentityRef,
  ProvenanceRef,
  RightsRef,
  SessionParticipantId,
  TenantId,
} from "../../contracts/refs.js";
import type { MoneyAmount } from "../../contracts/refs.js";
import type { OrganizationEditChoice } from "../../contracts/editing-composition.js";
import type { StudioDecisionActor } from "../../contracts/treatment.js";
import type { JoinParticipantRequest } from "../intake-types.js";
import type { StudioRuntimeError } from "../errors.js";
import type {
  StudioArtifactPackage,
  StudioArtifactRef,
  TranscriptRef,
} from "../../contracts/studio-artifact-package.js";
import type {
  EditingCompositionFailure,
  EditingSessionRecord,
  EditingSessionResult,
} from "../../contracts/editing-composition.js";
import type { StudioSessionId } from "../../contracts/refs.js";
import type { StudioSessionView } from "../session-state.js";

/** The reacted-to source/reference material (rights-gated, §16/§27). */
export interface ReactionSourcePlan {
  /** Stable artifact id of the acquired input (non-blank). */
  readonly artifactId: string;
  readonly type: "video" | "audio" | "image" | "text" | "timeline";
  /** Object/media storage ref of the source bytes (never inline, AGENTS.md Media). */
  readonly storageRef: string;
  /** §27: whether the source's rights context clears it for this production. */
  readonly rightsCleared: boolean;
  readonly rightsRef: string;
  readonly provenanceRef: string;
  /** Consent records covering the source's contribution to the output (§15/§27). */
  readonly consentRefs?: readonly ConsentRef[];
}

/** One reaction participant (the reactor) + capture settings. */
export interface ReactionParticipantPlan {
  readonly join: JoinParticipantRequest;
  readonly capture: {
    readonly rightsRef: RightsRef;
    readonly provenanceRef: ProvenanceRef;
    /** Audio capture source (default: the studio microphone). */
    readonly audioSourceId?: string;
    /** Video capture source (default: the studio camera). */
    readonly videoSourceId?: string;
  };
  /**
   * REAL human reactor (§15 multi-account consent gates) or SYNTHETIC
   * reactor persona (one-person synthetic-labeled variant): the label drives
   * the §16 entry-intermediate provenance — synthetic reactors are recorded
   * `engine-generated` with the generating capability named.
   */
  readonly reactorKind: "human" | "synthetic";
  /** Required for synthetic reactors: the generating capability (§14 disclosure). */
  readonly syntheticGenerator?: { readonly capability: string };
}

/** The reaction production plan. */
export interface ReactionProductionPlan {
  readonly tenantId: TenantId;
  readonly supplierIdentityRef: IdentityRef;
  readonly intent: string;
  /** Caller-supplied versioned organization (must be reaction-compatible). */
  readonly organizationRef: { readonly id: string; readonly version: number };
  /** The reacted-to source material (at least one, rights-gated). */
  readonly sources: readonly ReactionSourcePlan[];
  /** One participant = one-person mode; several = multi-account (§15). */
  readonly participants: readonly ReactionParticipantPlan[];
  /** Reaction capture rounds: each round records one audio + one video take. */
  readonly rounds: readonly { readonly participantId: SessionParticipantId }[];
  /**
   * The organization's reaction-composition decisions at the §16 declared
   * points (reaction-layout / reaction-timing / source-presentation). The ORG
   * decides; the caller stands in for the org's decision output (disclosed —
   * the W3-C/W8-C discipline). Supplied as a BUILDER over the artifact
   * universe the editing session will compose over: the flow invokes it once
   * the sources are imported and the §16 entry intermediates exist, so every
   * composition operation can cite exact artifact versions.
   */
  readonly compositionChoices: (inputs: {
    readonly sources: readonly StudioArtifactRef[];
    /** Entry intermediates in take order: [audio₍₀₎, video₍₀₎, audio₍₁₎, video₍₁₎, …]. */
    readonly entryArtifacts: readonly StudioArtifactRef[];
  }) => readonly Omit<OrganizationEditChoice, "decidedAt">[];
  readonly operator: StudioDecisionActor;
  readonly processingCost?: MoneyAmount;
  readonly processingSeconds?: number;
}

// ---------------------------------------------------------------------------
// The result
// ---------------------------------------------------------------------------

/** What the reaction flow returns on success. */
export interface ReactionFlowResult {
  readonly sessionId: StudioSessionId;
  readonly session: StudioSessionView;
  /** The imported source artifact versions (the §6 acquired inputs). */
  readonly sources: readonly StudioArtifactRef[];
  /** The raw reaction takes, in capture order (audio + video interleaved). */
  readonly rawTakes: readonly StudioArtifactRef[];
  /** The §16 entry intermediates (raw capture entering the organization). */
  readonly entryArtifacts: readonly StudioArtifactRef[];
  readonly transcriptRefs: readonly TranscriptRef[];
  /** The W8-C editing session: record + recorded edit graph + new package. */
  readonly editing: EditingSessionResult;
  /** The composed final artifact (the editing session's final assembly). */
  readonly finalArtifact: StudioArtifactRef;
  readonly package: StudioArtifactPackage;
}

/** Every failure the reaction flow can return (explicit, never thrown). */
export type ReactionFlowError =
  | { readonly kind: "format-not-reaction"; readonly formatId: string }
  | { readonly kind: "source-rights-not-cleared"; readonly sourceRef: string }
  | { readonly kind: "sources-empty" }
  | { readonly kind: "session-create-failed"; readonly error: StudioRuntimeError }
  | { readonly kind: "organization-load-failed"; readonly error: StudioRuntimeError }
  | { readonly kind: "participant-join-failed"; readonly participantId: string; readonly error: StudioRuntimeError }
  | { readonly kind: "source-import-failed"; readonly sourceRef: string; readonly error: StudioRuntimeError }
  | {
      readonly kind: "capture-failed";
      readonly participantId: string;
      readonly error: StudioRuntimeError | import("../capture/studio-capture-session.js").StudioCaptureTakeError;
    }
  | { readonly kind: "entry-versioning-failed"; readonly reason: string }
  | { readonly kind: "transcript-creation-failed"; readonly reason: string }
  | {
      readonly kind: "editing-session-failed";
      /** The typed editing failure verbatim (undeclared points, consent gates, engine failures). */
      readonly failure: EditingCompositionFailure;
      /** The §30 editing session record when the composing had started (null for validation failures). */
      readonly record: EditingSessionRecord | null;
    }
  | { readonly kind: "no-final-candidate" }
  | { readonly kind: "processing-failed"; readonly error: StudioRuntimeError }
  | { readonly kind: "review-failed"; readonly error: StudioRuntimeError }
  | { readonly kind: "flow-internal-error"; readonly reason: string };

/** Ok/failure pair of the reaction flow. */
export type ReactionFlowOutcome =
  | { readonly ok: true; readonly value: ReactionFlowResult }
  | { readonly ok: false; readonly error: ReactionFlowError };
