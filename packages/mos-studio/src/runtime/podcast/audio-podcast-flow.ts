/**
 * The audio-podcast session flow (STUDIO-010 + STUDIO-011; STUDIO-013
 * migrated the final composition onto the W8-C editing surface).
 *
 * Full orchestration of one audio-podcast production inside the single
 * Studio runtime:
 * 1. `createSession(format='audio-podcast')` from the standalone intent;
 * 2. `loadOrganization` (the caller-supplied versioned organization; the
 *    format's compatibility verdict gates it);
 * 3. `joinParticipant` per participant — through the REAL identity/rights
 *    authorities (§15 consent gates bite here in multi-account mode);
 * 4. the ADAPTIVE INTERVIEW (STUDIO-004): the interviewer agent instance is
 *    bound through the REAL @mos/agent-runtime, presents each
 *    sequencer-selected question, one CAPTURE ROUND per question/answer
 *    (STUDIO-005 audio capture), the typed answer advances the declared
 *    branch graph until the interview reaches its terminal node;
 * 5. PROCESSING: transcript artifact refs through the studio-side
 *    ArtifactFactoryPort and the conversation graph (question/answer nodes
 *    from the adaptive loop, §14 labels end-to-end);
 * 6. THE FINAL AUDIO COMPOSITION through the W8-C EditingCompositionPort
 *    (STUDIO-013 — the flow's own edit-graph recorder is GONE; there is ONE
 *    composition surface and ONE edit-graph record shape for every format):
 *    the organization's edit choices at the audio-podcast's DECLARED decision
 *    points (podcast-edit-points / podcast-edit-pacing) compose the raw
 *    takes + transcripts through the W7-B Editor Pawn with engine invocations
 *    through the REAL engines runner seam (the ORG decides, the studio
 *    records; undeclared points are typed failures);
 * 7. `completeProcessing` (the composed final + every intermediate + the
 *    transcripts + the recorded edit-graph ref + the conversation-graph ref)
 *    and `submitReview` (accept) → the packaged StudioArtifactPackage —
 *    composed through the canonical packaging authority (STUDIO-013), so
 *    every contract-required field is complete by construction.
 *
 * DISCLOSED stand-ins (same-wave dependency pattern): the capture runs on
 * the disclosed in-memory capture source double; the org's edit choices
 * arrive as caller-supplied recorded data standing in for the organization's
 * decision output (the W3-C/W8-C discipline — the recorder, validation,
 * versioning and execution are real).
 */

import type {
  AnswerRef,
  IdentityRef,
  MoneyAmount,
  ProvenanceRef,
  RightsRef,
  SessionParticipantId,
  StudioSessionId,
  TenantId,
  Timestamp,
} from "../../contracts/refs.js";
import type { ScriptGraphVersionRef } from "../../contracts/script-graph.js";
import type {
  InterviewerAgentBodyInput,
  InterviewerSessionError,
  InterviewerSessionSummary,
} from "../../contracts/interviewer-session.js";
import type { InterviewerRepresentation } from "../../contracts/interviewer.js";
import type {
  EditingCompositionFailure,
  EditingSessionInput,
  EditingSessionRecord,
  EditingSessionResult,
  OrganizationEditChoice,
} from "../../contracts/editing-composition.js";
import type { PodcastConversationGraph } from "../../contracts/podcast-graphs.js";
import type {
  StudioArtifactPackage,
  StudioArtifactRef,
  TranscriptRef,
} from "../../contracts/studio-artifact-package.js";
import type { StudioDecisionActor } from "../../contracts/treatment.js";
import type { StudioFormatPlugin } from "../../contracts/studio-format.js";
import type { StudioRuntime } from "../studio-runtime.js";
import type { StudioRuntimeError } from "../errors.js";
import type { StudioSessionView } from "../session-state.js";
import type { JoinParticipantRequest } from "../intake-types.js";
import type { StudioArtifactFactoryPort } from "../../ports/artifact-factory.js";
import type { EditingCompositionPort } from "../../ports/editing-composition.port.js";
import type { StudioOrganizationRef } from "../../contracts/organization-loading.js";
import type { ResourceLimits } from "@mos/contracts";
import type { PawnExecutionActor, TransformApplicationCitation } from "@mos/production";
import type { AdaptiveSequencerPort } from "../../ports/adaptive-sequencer.js";
import type { InterviewerAgentPort } from "../../ports/interviewer-agent.js";
import type { InterviewerAgentBindingPort } from "../../ports/interviewer-agent-binding.js";
import type { ScriptGraphStore } from "../script-graph/script-graph-store.js";
import { createInterviewerSession, type InterviewerSession, type InterviewerSessionDeps } from "../interviewer/interviewer-session.js";
import { buildConversationGraph } from "./conversation-graph.js";
import { buildAudioTranscripts } from "./audio-podcast-transcripts.js";
import { validateStudioMoneyAmount, sumStudioMoney } from "../money.js";
import { cloneThenFreezeFormatPlugin } from "../ownership-support.js";

/** One capture/interview round: the answer given after a presented question. */
export interface PodcastInterviewRound {
  /** The participant who answers (and whose capture round this is). */
  readonly participantId: SessionParticipantId;
  readonly answerRef: AnswerRef;
  readonly answerText?: string;
}

/** One participant plan: the join request plus capture settings. */
export interface PodcastParticipantPlan {
  readonly join: JoinParticipantRequest;
  /** Capture refs for this participant's takes (required for capture rounds). */
  readonly capture: {
    readonly rightsRef: RightsRef;
    readonly provenanceRef: ProvenanceRef;
    readonly sourceId?: string;
  };
}

/** The audio-podcast production plan. */
export interface AudioPodcastProductionPlan {
  readonly tenantId: TenantId;
  /** The standalone user who initiates the session (§13 entry mode). */
  readonly supplierIdentityRef: IdentityRef;
  readonly intent: string;
  /** Caller-supplied versioned organization (must be audio-podcast compatible). */
  readonly organizationRef: { readonly id: string; readonly version: number };
  /** One participant = one-person mode; several = multi-account (§15). */
  readonly participants: readonly PodcastParticipantPlan[];
  /** EXACT script-graph version the interview follows. */
  readonly scriptGraph: ScriptGraphVersionRef;
  readonly interviewer: {
    readonly representation: InterviewerRepresentation;
    readonly agentBody: InterviewerAgentBodyInput;
  };
  /** The typed answers driving the adaptive loop, in interview order. */
  readonly rounds: readonly PodcastInterviewRound[];
  /**
   * The organization's edit decisions at the audio-podcast's DECLARED points
   * (podcast-edit-points / podcast-edit-pacing): the ORG decides; the caller
   * stands in for the org's decision output (disclosed — the W3-C/W8-C
   * discipline). Supplied as a BUILDER over the artifact universe the editing
   * session will compose over: the flow invokes it once the capture rounds
   * and transcripts exist, so every composition operation can cite exact
   * artifact versions.
   */
  readonly editChoices: (inputs: {
    /** Raw audio takes in capture order. */
    readonly rawTakes: readonly StudioArtifactRef[];
    readonly transcripts: readonly StudioArtifactRef[];
  }) => readonly Omit<OrganizationEditChoice, "decidedAt">[];
  /** The review decision actor (accept). */
  readonly operator: StudioDecisionActor;
  readonly processingCost?: MoneyAmount;
  readonly processingSeconds?: number;
}

/** What the flow returns on success. */
export interface AudioPodcastFlowResult {
  readonly sessionId: StudioSessionId;
  readonly session: StudioSessionView;
  readonly interview: InterviewerSessionSummary;
  readonly conversationGraph: PodcastConversationGraph;
  /** The raw audio takes, in capture order. */
  readonly rawTakes: readonly StudioArtifactRef[];
  readonly transcriptRefs: readonly TranscriptRef[];
  /** The W8-C editing session: record + recorded edit graph + new package version. */
  readonly editing: EditingSessionResult;
  /** The composed final audio artifact (the editing session's final assembly). */
  readonly finalArtifact: StudioArtifactRef;
  readonly package: StudioArtifactPackage;
}

/** Every failure the flow can return (explicit, never thrown). */
export type AudioPodcastFlowError =
  | { readonly kind: "format-not-audio-podcast"; readonly formatId: string }
  | { readonly kind: "session-create-failed"; readonly error: StudioRuntimeError }
  | { readonly kind: "organization-load-failed"; readonly error: StudioRuntimeError }
  | { readonly kind: "participant-join-failed"; readonly participantId: string; readonly error: StudioRuntimeError }
  | { readonly kind: "interview-setup-failed"; readonly error: InterviewerSessionError }
  | { readonly kind: "interview-round-failed"; readonly error: InterviewerSessionError }
  | { readonly kind: "interview-incomplete"; readonly remainingQuestionNodeId: string }
  | { readonly kind: "capture-failed"; readonly error: StudioRuntimeError | { readonly kind: string; readonly reason?: string } }
  | { readonly kind: "transcript-creation-failed"; readonly reason: string }
  | {
      /** W10-B: the declared processing cost is malformed (never silently recorded). */
      readonly kind: "invalid-processing-cost";
      readonly reason: string;
    }
  | {
      readonly kind: "editing-session-failed";
      readonly failure: EditingCompositionFailure;
      readonly record: EditingSessionRecord | null;
    }
  | { readonly kind: "no-final-candidate" }
  | { readonly kind: "processing-failed"; readonly error: StudioRuntimeError }
  | { readonly kind: "review-failed"; readonly error: StudioRuntimeError }
  | { readonly kind: "flow-internal-error"; readonly reason: string };

/** Ok/failure pair of the flow. */
export type AudioPodcastFlowOutcome =
  | { readonly ok: true; readonly value: AudioPodcastFlowResult }
  | { readonly ok: false; readonly error: AudioPodcastFlowError };

/** Dependencies of {@link createAudioPodcastFlow}. */
export interface AudioPodcastFlowDeps {
  readonly runtime: StudioRuntime;
  readonly artifactFactory: StudioArtifactFactoryPort;
  /** The W8-C editing/composition surface the final audio composes through (STUDIO-013). */
  readonly editing: EditingCompositionPort;
  /** The audio-podcast format plugin the session runs under (decision points, version). */
  readonly formatPlugin: StudioFormatPlugin;
  /** The organization whose Editor Pawn composes the final audio. */
  readonly editingOrganization: StudioOrganizationRef;
  /** §30 actor of the editing session (also the rights grantee of the pawn executions). */
  readonly editingActor: PawnExecutionActor;
  /** The transform application the audio composition cites (exact version). */
  readonly transformApplication: TransformApplicationCitation;
  /** Explicit engine resource grant (§11: no implicit quotas). */
  readonly engineResourceLimits: ResourceLimits;
  /** Determinism seed of the deterministic composition operations. */
  readonly seed: number;
  readonly store: ScriptGraphStore;
  readonly sequencer: AdaptiveSequencerPort;
  readonly agentBinding: InterviewerAgentBindingPort;
  readonly agent: InterviewerAgentPort;
  readonly clock: () => Timestamp;
  readonly nextInterviewSessionId: () => string;
  readonly nextConversationGraphId: () => string;
}

/** Internal control-flow carrier (caught by the flow runner, never escaped). */
class FlowFailure extends Error {
  constructor(readonly flowError: AudioPodcastFlowError) {
    super(JSON.stringify(flowError));
  }
}

function fail(error: AudioPodcastFlowError): never {
  throw new FlowFailure(error);
}

/** Create the audio-podcast flow driver (one public method). */
export function createAudioPodcastFlow(deps: AudioPodcastFlowDeps) {
  // W10-B ownership: the flow reads a PRIVATE frozen copy of the format
  // plugin — a caller mutating its retained plugin object after flow
  // creation cannot rewrite the declared decision points the org's edits
  // are validated against.
  const formatPlugin = cloneThenFreezeFormatPlugin(deps.formatPlugin);
  const interviewerDeps: InterviewerSessionDeps = {
    store: deps.store,
    sequencer: deps.sequencer,
    agentBinding: deps.agentBinding,
    agent: deps.agent,
    clock: deps.clock,
    nextSessionId: deps.nextInterviewSessionId,
  };

  return {
    /** Run the full audio-podcast session flow for one production plan. */
    async run(plan: AudioPodcastProductionPlan): Promise<AudioPodcastFlowOutcome> {
      try {
        return { ok: true, value: await runFlow(plan) };
      } catch (error) {
        if (error instanceof FlowFailure) {
          return { ok: false, error: error.flowError };
        }
        return { ok: false, error: { kind: "flow-internal-error", reason: String(error) } };
      }
    },
  };

  async function captureRound(
    sessionId: StudioSessionId,
    plan: AudioPodcastProductionPlan,
    round: PodcastInterviewRound,
  ): Promise<StudioArtifactRef> {
    const participant = plan.participants.find((p) => p.join.participantId === round.participantId);
    if (participant === undefined) {
      fail({ kind: "capture-failed", error: { kind: "participant-not-in-plan", reason: String(round.participantId) } });
    }
    const opened = await deps.runtime.openCapture(sessionId, {
      participantId: round.participantId,
      mediaKind: "audio",
      deviceClass: "microphone",
      sourceId: participant.capture.sourceId ?? "mic-studio-48k",
      rightsRef: participant.capture.rightsRef,
      provenanceRef: participant.capture.provenanceRef,
    });
    if (!opened.ok) {
      fail({ kind: "capture-failed", error: opened.error });
    }
    await opened.value.start();
    const sealed = await opened.value.stop();
    if (!sealed.ok) {
      fail({ kind: "capture-failed", error: sealed.error });
    }
    return sealed.take.artifact;
  }

  async function runFlow(plan: AudioPodcastProductionPlan): Promise<AudioPodcastFlowResult> {
    if (formatPlugin.id !== "audio-podcast") {
      fail({ kind: "format-not-audio-podcast", formatId: String(formatPlugin.id) });
    }
    // ---- W10-B money integrity: the declared processing cost is validated
    // fail-closed TYPED before ANY session exists (the audio flow carries the
    // declared cost straight into the session's cost lines through its own
    // recorder — a hostile cost never silently lands in the package total). ----
    if (plan.processingCost !== undefined) {
      const moneyFault = validateStudioMoneyAmount(plan.processingCost);
      if (moneyFault !== null) {
        fail({ kind: "invalid-processing-cost", reason: moneyFault });
      }
    }
    const created = await deps.runtime.createSession({
      kind: "standalone-intent",
      intent: {
        supplier: { kind: "standalone-user", identityRef: plan.supplierIdentityRef },
        tenantId: plan.tenantId,
        format: { formatId: formatPlugin.id, version: formatPlugin.version },
        inputKind: "question-list",
        intent: plan.intent,
        organizationRef: plan.organizationRef,
        plannedParticipants: plan.participants.length,
      },
    });
    if (!created.ok) {
      fail({ kind: "session-create-failed", error: created.error });
    }
    const sessionId = created.value.session.id;
    const loaded = await deps.runtime.loadOrganization(sessionId);
    if (!loaded.ok) {
      fail({ kind: "organization-load-failed", error: loaded.error });
    }
    for (const participant of plan.participants) {
      const joined = await deps.runtime.joinParticipant(sessionId, participant.join);
      if (!joined.ok) {
        fail({
          kind: "participant-join-failed",
          participantId: String(participant.join.participantId),
          error: joined.error,
        });
      }
    }
    // The adaptive interview (STUDIO-004) with one capture round per answer.
    const interviewCreated = await createInterviewerSession(
      {
        tenantId: plan.tenantId,
        sessionId,
        graph: plan.scriptGraph,
        representation: plan.interviewer.representation,
        agentBody: plan.interviewer.agentBody,
      },
      interviewerDeps,
    );
    if (!interviewCreated.ok) {
      fail({ kind: "interview-setup-failed", error: interviewCreated.error });
    }
    const interview: InterviewerSession = interviewCreated.value;
    const rawTakes: StudioArtifactRef[] = [];
    for (const round of plan.rounds) {
      const presented = await interview.presentCurrentQuestion();
      if (!presented.ok) {
        fail({ kind: "interview-round-failed", error: presented.error });
      }
      rawTakes.push(await captureRound(sessionId, plan, round));
      const answered = await interview.recordAnswer({
        answerRef: round.answerRef,
        answerText: round.answerText,
        answeredBy: plan.participants.find((p) => p.join.participantId === round.participantId)
          ?.join.identityRef as IdentityRef,
      });
      if (!answered.ok) {
        fail({ kind: "interview-round-failed", error: answered.error });
      }
    }
    // The plan's rounds must carry the interview to its terminal node.
    if (!interview.getSummary().terminal) {
      const probe = await interview.presentCurrentQuestion();
      if (probe.ok) {
        fail({ kind: "interview-incomplete", remainingQuestionNodeId: probe.value.questionNodeId });
      }
      if (probe.error.kind !== "interview-complete") {
        fail({ kind: "interview-round-failed", error: probe.error });
      }
    }
    const completed = await interview.complete();
    if (!completed.ok) {
      fail({ kind: "interview-round-failed", error: completed.error });
    }
    const interviewSummary = completed.value;
    // ---- Transcripts + the conversation graph (§14 labels end-to-end). ----
    const transcriptOutcome = await buildAudioTranscripts(
      deps.artifactFactory,
      plan.tenantId,
      sessionId,
      rawTakes,
      interviewSummary,
    );
    if (!transcriptOutcome.ok) {
      fail({ kind: "transcript-creation-failed", reason: transcriptOutcome.reason });
    }
    const transcripts = transcriptOutcome.transcripts;
    const conversationGraph = buildConversationGraph({
      interview: interviewSummary,
      derivedFrom: transcripts,
      graphId: deps.nextConversationGraphId() as PodcastConversationGraph["graphId"],
      version: 1,
      builtAt: deps.clock(),
    });
    // ---- The final audio composition through the W8-C editing surface ----
    // (STUDIO-013: ONE composition surface + ONE edit-graph record shape for
    // every format — the flow's own recorder is gone).
    const editingInput: EditingSessionInput = {
      formatPlugin,
      source: {
        kind: "intermediates",
        sessionRef: sessionId,
        intermediates: [...rawTakes, ...transcripts.map((transcript) => transcript.artifact)],
      },
      organization: deps.editingOrganization,
      choices: plan
        .editChoices({
          rawTakes: Object.freeze([...rawTakes]),
          transcripts: Object.freeze(transcripts.map((transcript) => transcript.artifact)),
        })
        .map((choice) => ({ ...choice, decidedAt: deps.clock() })),
      actor: deps.editingActor,
      seed: deps.seed,
      transformApplication: deps.transformApplication,
      engineResourceLimits: deps.engineResourceLimits,
      contributors: plan.participants.map((participant) => ({
        participantIdentityRef: participant.join.identityRef,
        consentRefs: [...participant.join.consent.consentRefs],
      })),
    };
    const editingOutcome = await deps.editing.runEditingSession({ tenantId: plan.tenantId }, editingInput);
    if (!editingOutcome.ok) {
      fail({ kind: "editing-session-failed", failure: editingOutcome.failure, record: editingOutcome.record });
    }
    const editing = editingOutcome.result;
    const finalArtifact = editing.newPackage.finalArtifacts[0];
    if (finalArtifact === undefined) {
      // A no-op editing session is honest — but a podcast package needs a
      // final candidate; the flow fails closed instead of packaging nothing.
      fail({ kind: "no-final-candidate" });
    }
    // ---- Processing + review + packaging through the studio session ----
    const operationOutputs = editing.editGraph.operations.flatMap((operation) => [...operation.outputArtifactRefs]);
    const editingCost: MoneyAmount = {
      currency: editing.record.cost.currency,
      amount: editing.record.cost.amount.toFixed(2),
    };
    // The plan's declared processing cost lands in the package cost together
    // with the editing session's engine cost (never silently dropped — the
    // W9-C fix; the same composition the reaction and video-podcast flows
    // carry). W10-B/W10-RECONCILE: currency confusion fails closed TYPED here
    // (costs never sum across currencies); the amount shape was validated up
    // front. This gate is the §8.5(a) seam the W10-C recorder migration had
    // to keep — without it a foreign-currency declared cost degrades into
    // the flow-internal-error catch-all instead of the typed
    // invalid-processing-cost the W10-B money battery pins on the sibling
    // flows.
    if (plan.processingCost !== undefined && plan.processingCost.currency !== editingCost.currency) {
      fail({
        kind: "invalid-processing-cost",
        reason: `declared processing cost currency "${plan.processingCost.currency}" does not match the editing session cost currency "${editingCost.currency}" — costs never sum across currencies`,
      });
    }
    const totalCost = plan.processingCost === undefined ? editingCost : sumStudioMoney(editingCost, plan.processingCost);
    const begin = await deps.runtime.beginProcessing(sessionId);
    if (!begin.ok) {
      fail({ kind: "processing-failed", error: begin.error });
    }
    const complete = await deps.runtime.completeProcessing(sessionId, {
      intermediateArtifacts: [...transcripts.map((transcript) => transcript.artifact), ...operationOutputs],
      finalArtifacts: [finalArtifact],
      transcriptRefs: transcripts,
      conversationGraphRef: {
        graphId: conversationGraph.graphId,
        version: conversationGraph.version,
        derivedFrom: transcripts,
      },
      editGraphRef: {
        graphId: editing.editGraph.graphId,
        version: editing.editGraph.version,
        otioInterchange: editing.editGraph.otioInterchange,
      },
      additionalCost: totalCost,
      processingSeconds: plan.processingSeconds,
    });
    if (!complete.ok) {
      fail({ kind: "processing-failed", error: complete.error });
    }
    const accepted = await deps.runtime.submitReview(sessionId, {
      targetArtifactId: finalArtifact.artifactId,
      outcome: "accept",
      decidedBy: plan.operator,
    });
    if (!accepted.ok) {
      fail({ kind: "review-failed", error: accepted.error });
    }
    if (accepted.value.package === undefined) {
      fail({ kind: "review-failed", error: { kind: "package-not-assembled", sessionId } });
    }
    return {
      sessionId,
      session: deps.runtime.getSession(sessionId) as StudioSessionView,
      interview: interviewSummary,
      conversationGraph,
      rawTakes: Object.freeze([...rawTakes]),
      transcriptRefs: Object.freeze([...transcripts]),
      editing,
      finalArtifact,
      package: accepted.value.package,
    };
  }
}
