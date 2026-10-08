/**
 * The video-podcast session flow (STUDIO-012; §14 + the video format's
 * capture requirements).
 *
 * Completes the W3-C structure on the SAME architecture as the audio-podcast
 * flow (createSession → loadOrganization → join → adaptive interview with
 * capture rounds → transcripts → graphs → final composition → package), with
 * the video format's additions:
 * 1. FORMAT VALIDATION: the flow only runs the video-podcast plugin, and the
 *    plugin must declare MANDATORY video capture — every participant's plan
 *    MUST declare a video capture source; AUDIO-ONLY plans are rejected with
 *    the typed failure `video-capture-required` (the format's video capture
 *    requirements are enforced, never bypassed);
 * 2. VIDEO CAPTURE ROUNDS: each interview round records the answering
 *    participant's VIDEO take AND audio take (both media are declared
 *    required by the format; the runtime's device-requirement validation
 *    gates each open — an insufficient camera is a typed capture failure);
 * 3. the interviewer representation must be one the format declares
 *    (video modality: avatar/prerecorded/generated/hybrid are the visual
 *    kinds — the flow cites the format's declared list, never its own);
 * 4. TRANSCRIPTS via the studio-side ArtifactFactoryPort (audio takes →
 *    text intermediates) and the CONVERSATION GRAPH from the adaptive loop
 *    (§14 provenance labels travel end-to-end);
 * 5. FINAL VIDEO COMPOSITION through the W8-C EditingCompositionPort: the
 *    organization's edit choices at the video-podcast's DECLARED decision
 *    points (participant-framing / podcast-edit-points / podcast-edit-pacing)
 *    compose the raw takes + transcripts through the W7-B Editor Pawn (the
 *    ORG decides, the studio records; undeclared points are typed failures);
 * 6. `completeProcessing` + `submitReview` (accept) → the packaged
 *    StudioArtifactPackage with ALL required fields + full provenance.
 *
 * DISCLOSED stand-ins (same-wave dependency pattern): the org's edit choices
 * arrive as caller-supplied recorded data standing in for the organization's
 * decision output (the W3-C/W8-C discipline); capture runs on the disclosed
 * in-memory capture source double.
 */

import type {
  MoneyAmount,
  StudioSessionId,
  Timestamp,
} from "../../contracts/refs.js";
import type {
  EditingCompositionFailure,
  EditingSessionInput,
  EditingSessionRecord,
  EditingSessionResult,
} from "../../contracts/editing-composition.js";
import type {
  StudioArtifactPackage,
  StudioArtifactRef,
  TranscriptRef,
} from "../../contracts/studio-artifact-package.js";
import type { StudioFormatPlugin } from "../../contracts/studio-format.js";
import type { StudioRuntime } from "../studio-runtime.js";
import type { StudioRuntimeError } from "../errors.js";
import type { StudioSessionView } from "../session-state.js";
import type { StudioArtifactFactoryPort } from "../../ports/artifact-factory.js";
import type { EditingCompositionPort } from "../../ports/editing-composition.port.js";
import type { StudioOrganizationRef } from "../../contracts/organization-loading.js";
import type {
  InterviewerSessionError,
  InterviewerSessionSummary,
} from "../../contracts/interviewer-session.js";
import type { IdentityRef } from "../../contracts/refs.js";
import type { PodcastConversationGraph } from "../../contracts/podcast-graphs.js";
import type { ResourceLimits } from "@mos/contracts";
import type { PawnExecutionActor, TransformApplicationCitation } from "@mos/production";
import type { VideoPodcastProductionPlan } from "./video-podcast-plan.js";
import { captureVideoAudioRound, buildVideoTranscripts } from "./video-capture-rounds.js";
import { sumStudioMoney, validateStudioMoneyAmount } from "../money.js";
import { cloneThenFreezeFormatPlugin } from "../ownership-support.js";
import type { AdaptiveSequencerPort } from "../../ports/adaptive-sequencer.js";
import type { InterviewerAgentPort } from "../../ports/interviewer-agent.js";
import type { InterviewerAgentBindingPort } from "../../ports/interviewer-agent-binding.js";
import type { ScriptGraphStore } from "../script-graph/script-graph-store.js";
import { createInterviewerSession, type InterviewerSession, type InterviewerSessionDeps } from "../interviewer/interviewer-session.js";
import { buildConversationGraph } from "./conversation-graph.js";

/** What the video-podcast flow returns on success. */
export interface VideoPodcastFlowResult {
  readonly sessionId: StudioSessionId;
  readonly session: StudioSessionView;
  readonly interview: InterviewerSessionSummary;
  readonly conversationGraph: PodcastConversationGraph;
  /** The raw takes, in capture order (video + audio interleaved per round). */
  readonly rawTakes: readonly StudioArtifactRef[];
  readonly transcriptRefs: readonly TranscriptRef[];
  /** The W8-C editing session: record + recorded edit graph + new package. */
  readonly editing: EditingSessionResult;
  /** The composed final video artifact (the editing session's final assembly). */
  readonly finalArtifact: StudioArtifactRef;
  readonly package: StudioArtifactPackage;
}

/** Every failure the video-podcast flow can return (explicit, never thrown). */
export type VideoPodcastFlowError =
  | { readonly kind: "format-not-video-podcast"; readonly formatId: string }
  | {
      /** The plugin does not declare the mandatory video capture requirement. */
      readonly kind: "format-does-not-require-video";
      readonly formatId: string;
    }
  | {
      /** An audio-only plan is rejected: the video format requires video capture. */
      readonly kind: "video-capture-required";
      readonly participantId: string;
    }
  | {
      /** The interviewer representation is not one the format declares. */
      readonly kind: "interviewer-representation-not-supported";
      readonly representationKind: string;
      readonly supportedRepresentations: readonly string[];
    }
  | { readonly kind: "session-create-failed"; readonly error: StudioRuntimeError }
  | { readonly kind: "organization-load-failed"; readonly error: StudioRuntimeError }
  | { readonly kind: "participant-join-failed"; readonly participantId: string; readonly error: StudioRuntimeError }
  | { readonly kind: "interview-setup-failed"; readonly error: InterviewerSessionError }
  | { readonly kind: "interview-round-failed"; readonly error: InterviewerSessionError }
  | { readonly kind: "interview-incomplete"; readonly remainingQuestionNodeId: string }
  | {
      readonly kind: "capture-failed";
      readonly participantId: string;
      readonly error: StudioRuntimeError | import("../capture/studio-capture-session.js").StudioCaptureTakeError;
    }
  | { readonly kind: "transcript-creation-failed"; readonly reason: string }
  | {
      readonly kind: "editing-session-failed";
      readonly failure: EditingCompositionFailure;
      readonly record: EditingSessionRecord | null;
    }
  | { readonly kind: "no-final-candidate" }
  | {
      /** W10-B: the declared processing cost is malformed (never silently summed). */
      readonly kind: "invalid-processing-cost";
      readonly reason: string;
    }
  | { readonly kind: "processing-failed"; readonly error: StudioRuntimeError }
  | { readonly kind: "review-failed"; readonly error: StudioRuntimeError }
  | { readonly kind: "flow-internal-error"; readonly reason: string };

/** Ok/failure pair of the video-podcast flow. */
export type VideoPodcastFlowOutcome =
  | { readonly ok: true; readonly value: VideoPodcastFlowResult }
  | { readonly ok: false; readonly error: VideoPodcastFlowError };

/** Dependencies of {@link createVideoPodcastFlow}. */
export interface VideoPodcastFlowDeps {
  readonly runtime: StudioRuntime;
  readonly artifactFactory: StudioArtifactFactoryPort;
  /** The W8-C editing/composition surface the final video composes through. */
  readonly editing: EditingCompositionPort;
  /** The video-podcast format plugin the session runs under. */
  readonly formatPlugin: StudioFormatPlugin;
  /** The organization whose Editor Pawn composes the final video. */
  readonly editingOrganization: StudioOrganizationRef;
  /** §30 actor of the editing session (also the rights grantee of the pawn executions). */
  readonly editingActor: PawnExecutionActor;
  /** The transform application the video composition cites (exact version). */
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
  constructor(readonly flowError: VideoPodcastFlowError) {
    super(JSON.stringify(flowError));
  }
}

function fail(error: VideoPodcastFlowError): never {
  throw new FlowFailure(error);
}

/** Create the video-podcast flow driver (one public method). */
export function createVideoPodcastFlow(deps: VideoPodcastFlowDeps) {
  // W10-B ownership: the flow gates read a PRIVATE frozen copy of the
  // format plugin — a caller mutating its retained plugin object after flow
  // creation cannot weaken the declared requirements this flow enforces.
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
    /** Run the full video-podcast session flow for one production plan. */
    async run(plan: VideoPodcastProductionPlan): Promise<VideoPodcastFlowOutcome> {
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

  async function runFlow(plan: VideoPodcastProductionPlan): Promise<VideoPodcastFlowResult> {
    // ---- Format-plugin validation: video-podcast + mandatory video capture. ----
    if (formatPlugin.id !== "video-podcast") {
      fail({ kind: "format-not-video-podcast", formatId: String(formatPlugin.id) });
    }
    if (formatPlugin.captureRequirements.video.required !== true) {
      fail({ kind: "format-does-not-require-video", formatId: String(formatPlugin.id) });
    }
    // ---- W10-B money integrity: the declared processing cost is validated
    // fail-closed TYPED before ANY session exists (a hostile cost never
    // silently sums and never crashes the flow after capture already ran). ----
    if (plan.processingCost !== undefined) {
      const moneyFault = validateStudioMoneyAmount(plan.processingCost);
      if (moneyFault !== null) {
        fail({ kind: "invalid-processing-cost", reason: moneyFault });
      }
    }
    // AUDIO-ONLY plans are rejected: every participant must declare video capture.
    for (const participant of plan.participants) {
      if (participant.capture.videoSourceId === undefined || participant.capture.videoSourceId.trim().length === 0) {
        fail({ kind: "video-capture-required", participantId: String(participant.join.participantId) });
      }
    }
    // The interviewer representation must be one the format declares (§14).
    const supportedRepresentations = formatPlugin.interviewerRequirements.supportedRepresentations as readonly string[];
    if (!supportedRepresentations.includes(plan.interviewer.representation.representation)) {
      fail({
        kind: "interviewer-representation-not-supported",
        representationKind: plan.interviewer.representation.representation,
        supportedRepresentations,
      });
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
    // ---- The adaptive interview (STUDIO-004) with video capture rounds. ----
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
    const audioTakes: StudioArtifactRef[] = [];
    for (const round of plan.rounds) {
      const participant = plan.participants.find((p) => p.join.participantId === round.participantId);
      if (participant === undefined) {
        fail({
          kind: "capture-failed",
          participantId: String(round.participantId),
          error: { kind: "participant-not-found", participantId: round.participantId, sessionId },
        });
      }
      const presented = await interview.presentCurrentQuestion();
      if (!presented.ok) {
        fail({ kind: "interview-round-failed", error: presented.error });
      }
      const takes = await captureVideoAudioRound(deps.runtime, sessionId, participant);
      if (!takes.ok) {
        fail({ kind: "capture-failed", participantId: takes.participantId, error: takes.error });
      }
      rawTakes.push(takes.video, takes.audio);
      audioTakes.push(takes.audio);
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
    const transcriptOutcome = await buildVideoTranscripts(
      deps.artifactFactory,
      plan.tenantId,
      sessionId,
      audioTakes,
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
    // ---- Final video composition through the W8-C editing surface. ----
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
      fail({ kind: "no-final-candidate" });
    }
    // ---- Processing + review + packaging through the studio session. ----
    const operationOutputs = editing.editGraph.operations.flatMap((operation) => [...operation.outputArtifactRefs]);
    const editingCost: MoneyAmount = {
      currency: editing.record.cost.currency,
      amount: editing.record.cost.amount.toFixed(2),
    };
    // The plan's declared processing cost lands in the package cost together
    // with the editing session's engine cost (never silently dropped — the
    // W9-C fix). W10-B: currency confusion fails closed TYPED here (costs
    // never sum across currencies); the amount shape was validated up front.
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
