/**
 * The video-podcast production PLAN contracts (STUDIO-012). Split from
 * `video-podcast-flow.ts` (file-length policy).
 *
 * Mirrors the W3-C audio-podcast plan (same adaptive-interview architecture,
 * §14) with the video-podcast format's additions: every participant's capture
 * settings MUST declare a VIDEO capture source (audio-only plans are rejected
 * by the flow — the video format's capture requirements are enforced), and
 * the organization's edit choices compose the final video through the W8-C
 * editing surface.
 */

import type {
  IdentityRef,
  MoneyAmount,
  ProvenanceRef,
  RightsRef,
  TenantId,
} from "../../contracts/refs.js";
import type { OrganizationEditChoice } from "../../contracts/editing-composition.js";
import type { StudioArtifactRef } from "../../contracts/studio-artifact-package.js";
import type { StudioDecisionActor } from "../../contracts/treatment.js";
import type { JoinParticipantRequest } from "../intake-types.js";
import type { ScriptGraphVersionRef } from "../../contracts/script-graph.js";
import type { InterviewerRepresentation } from "../../contracts/interviewer.js";
import type { InterviewerAgentBodyInput } from "../../contracts/interviewer-session.js";
import type { PodcastInterviewRound } from "./audio-podcast-flow.js";

/** One video-podcast participant plan entry (join request + capture settings). */
export interface VideoPodcastParticipantPlan {
  readonly join: JoinParticipantRequest;
  readonly capture: {
    readonly rightsRef: RightsRef;
    readonly provenanceRef: ProvenanceRef;
    /**
     * REQUIRED video capture source: the video-podcast format declares video
     * capture mandatory — a plan without a video source is an audio-only
     * input and the flow REJECTS it (typed failure `video-capture-required`).
     */
    readonly videoSourceId?: string;
    /** Audio capture source (default: the studio microphone). */
    readonly audioSourceId?: string;
  };
}

/** The video-podcast production plan. */
export interface VideoPodcastProductionPlan {
  readonly tenantId: TenantId;
  /** The standalone user who initiates the session (§13 entry mode). */
  readonly supplierIdentityRef: IdentityRef;
  readonly intent: string;
  /** Caller-supplied versioned organization (must be video-podcast compatible). */
  readonly organizationRef: { readonly id: string; readonly version: number };
  /** One participant = one-person mode; several = multi-account (§15). */
  readonly participants: readonly VideoPodcastParticipantPlan[];
  /** EXACT script-graph version the interview follows. */
  readonly scriptGraph: ScriptGraphVersionRef;
  /** The adaptive interviewer (STUDIO-004 binding; a video-modality representation). */
  readonly interviewer: {
    readonly representation: InterviewerRepresentation;
    readonly agentBody: InterviewerAgentBodyInput;
  };
  /** The typed answers driving the adaptive loop, in interview order. */
  readonly rounds: readonly PodcastInterviewRound[];
  /**
   * The organization's edit decisions at the video-podcast's declared points
   * (participant-framing / podcast-edit-points / podcast-edit-pacing): the ORG
   * decides; the caller stands in for the org's decision output (disclosed —
   * the W3-C/W8-C discipline). Supplied as a BUILDER over the artifact
   * universe the editing session will compose over: the flow invokes it once
   * the capture rounds and transcripts exist, so every composition operation
   * can cite exact artifact versions.
   */
  readonly editChoices: (inputs: {
    /** Raw takes in capture order: [video₍₀₎, audio₍₀₎, video₍₁₎, audio₍₁₎, …]. */
    readonly rawTakes: readonly StudioArtifactRef[];
    readonly transcripts: readonly StudioArtifactRef[];
  }) => readonly Omit<OrganizationEditChoice, "decidedAt">[];
  /** The review decision actor (accept). */
  readonly operator: StudioDecisionActor;
  readonly processingCost?: MoneyAmount;
  readonly processingSeconds?: number;
}
