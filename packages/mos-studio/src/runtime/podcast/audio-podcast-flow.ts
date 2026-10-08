/**
 * The audio-podcast session flow (STUDIO-010 + STUDIO-011).
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
 *    ArtifactFactoryPort, the conversation graph (question/answer nodes from
 *    the adaptive loop), the edit graph (organization-driven edit decisions
 *    RECORDED as refs — the org decides, the studio records), the final
 *    audio artifact, then `beginProcessing`/`completeProcessing`;
 * 6. `submitReview` (accept) → the packaged StudioArtifactPackage with
 *    transcript refs + conversation-graph ref + edit-graph ref and the full
 *    provenance chain.
 *
 * DISCLOSED stand-ins (same-wave dependency pattern): the capture runs on
 * the disclosed in-memory capture source double; the organization's real
 * transcription/mixing execution is STUDIO-008 — this flow derives the
 * transcripts and the final audio artifact through the studio-side artifact
 * factory port with closed lineage (§6), and the edit decisions arrive as
 * caller-supplied recorded data standing in for the organization's decision
 * output. The orchestration, gates, graphs and packaging are real studio
 * logic and survive the future bindings unchanged.
 */

import type {
  AnswerRef,
  ConversationGraphId,
  EditGraphId,
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
import type { EditGraphError, PodcastEditGraph, RecordedEditDecision } from "../../contracts/podcast-graphs.js";
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
import type { AdaptiveSequencerPort } from "../../ports/adaptive-sequencer.js";
import type { InterviewerAgentPort } from "../../ports/interviewer-agent.js";
import type { InterviewerAgentBindingPort } from "../../ports/interviewer-agent-binding.js";
import type { ScriptGraphStore } from "../script-graph/script-graph-store.js";
import { createInterviewerSession, type InterviewerSession, type InterviewerSessionDeps } from "../interviewer/interviewer-session.js";
import { buildConversationGraph } from "./conversation-graph.js";
import { recordEditDecisions } from "./edit-graph.js";
import { validateStudioMoneyAmount } from "../money.js";
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
  /** Organization edit decisions to record (org decides; caller stands in — disclosed). */
  readonly editDecisions: readonly Omit<RecordedEditDecision, "decidedByOrganization">[];
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
  readonly editGraph: PodcastEditGraph;
  readonly transcriptRefs: readonly TranscriptRef[];
  readonly finalAudioArtifact: StudioArtifactRef;
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
  | { readonly kind: "final-artifact-creation-failed"; readonly reason: string }
  | { readonly kind: "edit-graph-failed"; readonly error: EditGraphError }
  | {
      /** W10-B: the declared processing cost is malformed (never silently recorded). */
      readonly kind: "invalid-processing-cost";
      readonly reason: string;
    }
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
  readonly store: ScriptGraphStore;
  readonly sequencer: AdaptiveSequencerPort;
  readonly agentBinding: InterviewerAgentBindingPort;
  readonly agent: InterviewerAgentPort;
  /** The audio-podcast format plugin the session runs under (decision points, version). */
  readonly formatPlugin: StudioFormatPlugin;
  readonly clock: () => Timestamp;
  readonly nextInterviewSessionId: () => string;
  readonly nextConversationGraphId: () => string;
  readonly nextEditGraphId: () => string;
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

  async function buildTranscripts(
    tenantId: TenantId,
    rawArtifacts: readonly StudioArtifactRef[],
    interview: InterviewerSessionSummary,
  ): Promise<readonly TranscriptRef[]> {
    const transcripts: TranscriptRef[] = [];
    for (const raw of rawArtifacts) {
      const created = await deps.artifactFactory.createArtifact({
        tenantId,
        type: "text",
        stage: "intermediate",
        creationMethod: "organization-transform",
        storageRef: `mos-studio:transcript:${raw.artifactId}` as never,
        content: new TextEncoder().encode(
          `transcript|${String(interview.sessionId)}|${interview.presentations.map((p) => p.questionText).join(" // ")}`,
        ),
        rightsRef: raw.rightsRef,
        provenanceRef: raw.provenanceRef,
        parents: [raw],
      });
      if (!created.ok) {
        fail({ kind: "transcript-creation-failed", reason: JSON.stringify(created.error) });
      }
      transcripts.push(Object.freeze({ artifact: created.artifact, language: "en", diarized: true }));
    }
    return transcripts;
  }

  async function buildFinalAudioArtifact(
    tenantId: TenantId,
    transcripts: readonly TranscriptRef[],
    rawArtifacts: readonly StudioArtifactRef[],
    storageKey: string,
  ): Promise<StudioArtifactRef> {
    const parents = [...transcripts.map((t) => t.artifact), ...rawArtifacts];
    const context = transcripts[0]?.artifact ?? rawArtifacts[0];
    if (parents.length === 0 || context === undefined) {
      fail({ kind: "final-artifact-creation-failed", reason: "no captured material to compose into the final audio artifact" });
    }
    const created = await deps.artifactFactory.createArtifact({
      tenantId,
      type: "audio",
      stage: "final",
      creationMethod: "composition",
      storageRef: `mos-studio:final-audio:${storageKey}` as never,
      content: new TextEncoder().encode(`final-audio|${parents.map((p) => p.artifactId).join("+")}`),
      rightsRef: context.rightsRef,
      provenanceRef: context.provenanceRef,
      parents,
    });
    if (!created.ok) {
      fail({ kind: "final-artifact-creation-failed", reason: JSON.stringify(created.error) });
    }
    return created.artifact;
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
    const rawArtifacts: StudioArtifactRef[] = [];
    for (const round of plan.rounds) {
      const presented = await interview.presentCurrentQuestion();
      if (!presented.ok) {
        fail({ kind: "interview-round-failed", error: presented.error });
      }
      rawArtifacts.push(await captureRound(sessionId, plan, round));
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
    // Processing: transcripts → conversation graph → edit graph → final audio.
    const transcripts = await buildTranscripts(plan.tenantId, rawArtifacts, interviewSummary);
    const conversationGraphId = deps.nextConversationGraphId() as ConversationGraphId;
    const conversationGraph = buildConversationGraph({
      interview: interviewSummary,
      derivedFrom: transcripts,
      graphId: conversationGraphId,
      version: 1,
      builtAt: deps.clock(),
    });
    const sessionView = deps.runtime.getSession(sessionId);
    if (sessionView === undefined || sessionView.organization === null) {
      fail({ kind: "processing-failed", error: { kind: "organization-not-loaded", sessionId } });
    }
    const editRecorded = recordEditDecisions({
      formatPlugin,
      conversationNodeIds: conversationGraph.nodes.map((node) => node.nodeId),
      decidedByOrganization: sessionView.organization.organization,
      decisions: plan.editDecisions,
      graphId: deps.nextEditGraphId() as EditGraphId,
      version: 1,
      recordedAt: deps.clock(),
    });
    if (!editRecorded.ok) {
      fail({ kind: "edit-graph-failed", error: editRecorded.error });
    }
    const finalAudio = await buildFinalAudioArtifact(
      plan.tenantId,
      transcripts,
      rawArtifacts,
      String(conversationGraphId),
    );
    const begin = await deps.runtime.beginProcessing(sessionId);
    if (!begin.ok) {
      fail({ kind: "processing-failed", error: begin.error });
    }
    const complete = await deps.runtime.completeProcessing(sessionId, {
      intermediateArtifacts: transcripts.map((t) => t.artifact),
      finalArtifacts: [finalAudio],
      transcriptRefs: transcripts,
      conversationGraphRef: {
        graphId: conversationGraph.graphId,
        version: conversationGraph.version,
        derivedFrom: transcripts,
      },
      editGraphRef: {
        graphId: editRecorded.graph.graphId,
        version: editRecorded.graph.version,
        otioInterchange: editRecorded.graph.otioInterchange,
      },
      additionalCost: plan.processingCost,
      processingSeconds: plan.processingSeconds,
    });
    if (!complete.ok) {
      fail({ kind: "processing-failed", error: complete.error });
    }
    const accepted = await deps.runtime.submitReview(sessionId, {
      targetArtifactId: finalAudio.artifactId,
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
      editGraph: editRecorded.graph,
      transcriptRefs: transcripts,
      finalAudioArtifact: finalAudio,
      package: accepted.value.package,
    };
  }
}
