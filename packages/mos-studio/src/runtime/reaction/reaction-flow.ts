/**
 * The reaction session flow (STUDIO-009; §16 reaction production).
 *
 * Full orchestration of one reaction production inside the single Studio
 * runtime on the STUDIO-002 format framework:
 * 1. `createSession(format='reaction')` from the standalone intent with the
 *    reacted-to SOURCE material — the source rights context gates the whole
 *    flow (§27: uncleared sources are TYPED failures at the flow gate, at the
 *    format's intake validation and at the runtime import — never silent);
 * 2. `loadOrganization` (the reaction format's compatibility verdict gates
 *    compose_reaction + render_timeline);
 * 3. `joinParticipant` per reactor — through the REAL §15 identity/rights
 *    authorities (multi-account consent gates bite at join, at every capture
 *    open and again inside the editing session);
 * 4. `importSourceArtifact` — the §6 acquired-input stage: the rights-cleared
 *    source enters the session draft as a parentless RAW artifact;
 * 5. CAPTURE ROUNDS (STUDIO-005): per round the reactor records one AUDIO
 *    take and one VIDEO take (the reaction format requires both media);
 * 6. §16 ENTRY: every raw reaction take is versioned into the loaded
 *    organization as an INTERMEDIATE artifact ("raw reaction capture enters
 *    the selected organization as an intermediate artifact" — §16 verbatim);
 *    synthetic reactor personas are labeled `engine-generated` with the
 *    generating capability named (§14-style disclosure);
 * 7. TRANSCRIPTS of the spoken reaction (audio takes → text intermediates);
 * 8. THE ORG'S REACTION-COMPOSITION DECISIONS (§16 decision points
 *    reaction-layout / reaction-timing / source-presentation): the ORG
 *    decides, the studio records — the choices run through the W8-C
 *    EditingCompositionPort, which validates them against the format's
 *    DECLARED points (undeclared points are typed failures), gates the §15
 *    contributors on processing consent, and composes source + reaction
 *    capture through the W7-B Editor Pawn with engine invocations through
 *    the REAL engines runner seam;
 * 9. `completeProcessing` (the composed final + every intermediate + the
 *    transcripts + the W8-C edit-graph ref) and `submitReview` (accept) →
 *    the packaged StudioArtifactPackage with ALL required fields.
 *
 * DISCLOSED stand-ins (same-wave dependency pattern): the org's
 * reaction-composition choices arrive as caller-supplied recorded data
 * standing in for the organization's decision output (the W3-C/W8-C
 * discipline — the recorder, validation, versioning and execution are real);
 * capture runs on the disclosed in-memory capture source double.
 */

import type {
  MoneyAmount,
  ProvenanceRef,
  StudioSessionId,
  TenantId,
  Timestamp,
} from "../../contracts/refs.js";
import type { EditingSessionInput } from "../../contracts/editing-composition.js";
import type {
  ReactionFlowError,
  ReactionFlowOutcome,
  ReactionFlowResult,
  ReactionParticipantPlan,
  ReactionProductionPlan,
} from "./reaction-plan.js";
import type { StudioArtifactRef, TranscriptRef } from "../../contracts/studio-artifact-package.js";
import type { StudioFormatPlugin } from "../../contracts/studio-format.js";
import type { StudioRuntime } from "../studio-runtime.js";
import type { StudioSessionView } from "../session-state.js";
import type { StudioArtifactFactoryPort } from "../../ports/artifact-factory.js";
import type { EditingCompositionPort } from "../../ports/editing-composition.port.js";
import type { StudioOrganizationRef } from "../../contracts/organization-loading.js";
import type { ResourceLimits } from "@mos/contracts";
import type { PawnExecutionActor, TransformApplicationCitation } from "@mos/production";
import { sumStudioMoney } from "../money.js";

// ---------------------------------------------------------------------------
// The flow
// ---------------------------------------------------------------------------

/** Dependencies of {@link createReactionFlow}. */
export interface ReactionFlowDeps {
  readonly runtime: StudioRuntime;
  readonly artifactFactory: StudioArtifactFactoryPort;
  /** The W8-C editing/composition surface the reaction composes through. */
  readonly editing: EditingCompositionPort;
  /** The reaction format plugin the session runs under (§16 decision points). */
  readonly formatPlugin: StudioFormatPlugin;
  /**
   * The organization whose Editor Pawn composes the reaction (the loaded
   * session organization at the production composition root; the disclosed
   * test seam registers the same org as a pawn organization).
   */
  readonly editingOrganization: StudioOrganizationRef;
  /** §30 actor of the editing session (also the rights grantee of the pawn executions). */
  readonly editingActor: PawnExecutionActor;
  /** The transform application the reaction composition cites (exact version). */
  readonly transformApplication: TransformApplicationCitation;
  /** Explicit engine resource grant (§11: no implicit quotas). */
  readonly engineResourceLimits: ResourceLimits;
  /** Determinism seed of the deterministic composition operations. */
  readonly seed: number;
  readonly clock: () => Timestamp;
}

/** Internal control-flow carrier (caught by the flow runner, never escaped). */
class FlowFailure extends Error {
  constructor(readonly flowError: ReactionFlowError) {
    super(JSON.stringify(flowError));
  }
}

function fail(error: ReactionFlowError): never {
  throw new FlowFailure(error);
}

/** Create the reaction flow driver (one public method). */
export function createReactionFlow(deps: ReactionFlowDeps) {
  return {
    /** Run the full reaction session flow for one production plan. */
    async run(plan: ReactionProductionPlan): Promise<ReactionFlowOutcome> {
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

  /** One capture round: the reactor's audio take + video take (STUDIO-005). */
  async function captureRound(
    sessionId: StudioSessionId,
    participant: ReactionParticipantPlan,
  ): Promise<{ readonly audio: StudioArtifactRef; readonly video: StudioArtifactRef }> {
    const openedAudio = await deps.runtime.openCapture(sessionId, {
      participantId: participant.join.participantId,
      mediaKind: "audio",
      deviceClass: "microphone",
      sourceId: participant.capture.audioSourceId ?? "mic-studio-48k",
      rightsRef: participant.capture.rightsRef,
      provenanceRef: participant.capture.provenanceRef,
    });
    if (!openedAudio.ok) {
      fail({ kind: "capture-failed", participantId: String(participant.join.participantId), error: openedAudio.error });
    }
    const openedVideo = await deps.runtime.openCapture(sessionId, {
      participantId: participant.join.participantId,
      mediaKind: "video",
      deviceClass: "camera",
      sourceId: participant.capture.videoSourceId ?? "cam-hd-720",
      rightsRef: participant.capture.rightsRef,
      provenanceRef: participant.capture.provenanceRef,
    });
    if (!openedVideo.ok) {
      fail({ kind: "capture-failed", participantId: String(participant.join.participantId), error: openedVideo.error });
    }
    await openedAudio.value.start();
    const sealedAudio = await openedAudio.value.stop();
    if (!sealedAudio.ok) {
      fail({ kind: "capture-failed", participantId: String(participant.join.participantId), error: sealedAudio.error });
    }
    await openedVideo.value.start();
    const sealedVideo = await openedVideo.value.stop();
    if (!sealedVideo.ok) {
      fail({ kind: "capture-failed", participantId: String(participant.join.participantId), error: sealedVideo.error });
    }
    return { audio: sealedAudio.take.artifact, video: sealedVideo.take.artifact };
  }

  /** §16: version one raw take into the organization as an intermediate artifact. */
  async function enterOrganization(
    tenantId: TenantId,
    sessionId: StudioSessionId,
    participant: ReactionParticipantPlan,
    take: StudioArtifactRef,
    takeIndex: number,
  ): Promise<StudioArtifactRef> {
    const synthetic = participant.reactorKind === "synthetic";
    if (synthetic && (participant.syntheticGenerator === undefined || participant.syntheticGenerator.capability.trim().length === 0)) {
      fail({
        kind: "entry-versioning-failed",
        reason: "synthetic reactor personas must name their generating capability (§14 disclosure)",
      });
    }
    const created = await deps.artifactFactory.createArtifact({
      tenantId,
      type: take.type,
      stage: "intermediate",
      creationMethod: synthetic ? "engine-generated" : "organization-transform",
      storageRef: `mos-studio:reaction-entry:${String(sessionId)}:${String(take.artifactId)}` as StudioArtifactRef["storageRef"],
      content: new TextEncoder().encode(
        synthetic
          ? `reaction-entry|synthetic|${participant.syntheticGenerator?.capability}|${String(take.artifactId)}|${takeIndex}`
          : `reaction-entry|human|${String(take.artifactId)}|${takeIndex}`,
      ),
      rightsRef: take.rightsRef,
      provenanceRef: (synthetic
        ? `mos-studio:reaction-entry:${String(sessionId)}:synthetic:${participant.syntheticGenerator?.capability}`
        : `mos-studio:reaction-entry:${String(sessionId)}:human:${String(participant.join.participantId)}`) as ProvenanceRef,
      parents: [take],
    });
    if (!created.ok) {
      fail({ kind: "entry-versioning-failed", reason: JSON.stringify(created.error) });
    }
    return created.artifact;
  }

  /** Transcripts of the spoken reaction audio takes. */
  async function buildTranscripts(
    tenantId: TenantId,
    sessionId: StudioSessionId,
    audioTakes: readonly StudioArtifactRef[],
  ): Promise<readonly TranscriptRef[]> {
    const transcripts: TranscriptRef[] = [];
    for (const take of audioTakes) {
      const created = await deps.artifactFactory.createArtifact({
        tenantId,
        type: "text",
        stage: "intermediate",
        creationMethod: "organization-transform",
        storageRef: `mos-studio:reaction-transcript:${String(sessionId)}:${String(take.artifactId)}` as StudioArtifactRef["storageRef"],
        content: new TextEncoder().encode(`reaction-transcript|${String(sessionId)}|${String(take.artifactId)}`),
        rightsRef: take.rightsRef,
        provenanceRef: take.provenanceRef,
        parents: [take],
      });
      if (!created.ok) {
        fail({ kind: "transcript-creation-failed", reason: JSON.stringify(created.error) });
      }
      transcripts.push(Object.freeze({ artifact: created.artifact, language: "en", diarized: true }));
    }
    return transcripts;
  }

  async function runFlow(plan: ReactionProductionPlan): Promise<ReactionFlowResult> {
    if (deps.formatPlugin.id !== "reaction") {
      fail({ kind: "format-not-reaction", formatId: String(deps.formatPlugin.id) });
    }
    // ---- The source rights gate (§16/§27): fail closed BEFORE anything runs. ----
    if (plan.sources.length === 0) {
      fail({ kind: "sources-empty" });
    }
    for (const source of plan.sources) {
      if (!source.rightsCleared) {
        fail({ kind: "source-rights-not-cleared", sourceRef: source.artifactId });
      }
    }
    const created = await deps.runtime.createSession({
      kind: "standalone-intent",
      intent: {
        supplier: { kind: "standalone-user", identityRef: plan.supplierIdentityRef },
        tenantId: plan.tenantId,
        format: { formatId: deps.formatPlugin.id, version: deps.formatPlugin.version },
        inputKind: "intent-with-source-material",
        intent: plan.intent,
        sourceArtifacts: plan.sources.map((source) => ({
          artifactId: source.artifactId as never,
          rightsCleared: source.rightsCleared,
        })),
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
    // ---- The §6 acquired inputs: import every rights-cleared source. ----
    const sources: StudioArtifactRef[] = [];
    for (const source of plan.sources) {
      const imported = await deps.runtime.importSourceArtifact(sessionId, {
        artifactId: source.artifactId as never,
        type: source.type,
        storageRef: source.storageRef as never,
        rightsCleared: source.rightsCleared,
        rightsRef: source.rightsRef as never,
        provenanceRef: source.provenanceRef as never,
        consentRefs: [...(source.consentRefs ?? [])],
      });
      if (!imported.ok) {
        fail({ kind: "source-import-failed", sourceRef: source.artifactId, error: imported.error });
      }
      sources.push(imported.value.source);
    }
    // ---- Capture rounds: audio + video takes per round (STUDIO-005). ----
    const rawTakes: StudioArtifactRef[] = [];
    const audioTakes: StudioArtifactRef[] = [];
    const entryInputs: { readonly participant: ReactionParticipantPlan; readonly take: StudioArtifactRef }[] = [];
    for (const round of plan.rounds) {
      const participant = plan.participants.find((p) => p.join.participantId === round.participantId);
      if (participant === undefined) {
        fail({
          kind: "capture-failed",
          participantId: String(round.participantId),
          error: { kind: "participant-not-found", participantId: round.participantId, sessionId },
        });
      }
      const takes = await captureRound(sessionId, participant);
      rawTakes.push(takes.audio, takes.video);
      audioTakes.push(takes.audio);
      entryInputs.push({ participant, take: takes.audio }, { participant, take: takes.video });
    }
    // ---- §16: raw reaction capture enters the organization as intermediate. ----
    const entryArtifacts: StudioArtifactRef[] = [];
    for (const [index, input] of entryInputs.entries()) {
      entryArtifacts.push(await enterOrganization(plan.tenantId, sessionId, input.participant, input.take, index));
    }
    // ---- Transcripts of the spoken reaction. ----
    const transcripts = await buildTranscripts(plan.tenantId, sessionId, audioTakes);
    // ---- The org's §16 decisions through the W8-C editing surface. ----
    const editingInput: EditingSessionInput = {
      formatPlugin: deps.formatPlugin,
      source: {
        kind: "intermediates",
        sessionRef: sessionId,
        intermediates: [...sources, ...entryArtifacts],
      },
      organization: deps.editingOrganization,
      choices: plan
        .compositionChoices({ sources: Object.freeze([...sources]), entryArtifacts: Object.freeze([...entryArtifacts]) })
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
      fail({
        kind: "editing-session-failed",
        failure: editingOutcome.failure,
        record: editingOutcome.record,
      });
    }
    const editing = editingOutcome.result;
    const finalArtifact = editing.newPackage.finalArtifacts[0];
    if (finalArtifact === undefined) {
      // A no-op editing session is honest — but a reaction package needs a
      // final candidate; the flow fails closed instead of packaging nothing.
      fail({ kind: "no-final-candidate" });
    }
    // ---- Processing + review + packaging through the studio session. ----
    const operationOutputs = editing.editGraph.operations.flatMap((operation) => [...operation.outputArtifactRefs]);
    const editingCost: MoneyAmount = {
      currency: editing.record.cost.currency,
      amount: editing.record.cost.amount.toFixed(2),
    };
    const totalCost = plan.processingCost === undefined ? editingCost : sumStudioMoney(editingCost, plan.processingCost);
    const begin = await deps.runtime.beginProcessing(sessionId);
    if (!begin.ok) {
      fail({ kind: "processing-failed", error: begin.error });
    }
    const complete = await deps.runtime.completeProcessing(sessionId, {
      intermediateArtifacts: [...transcripts.map((transcript) => transcript.artifact), ...entryArtifacts, ...operationOutputs],
      finalArtifacts: [finalArtifact],
      transcriptRefs: transcripts,
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
      sources: Object.freeze([...sources]),
      rawTakes: Object.freeze([...rawTakes]),
      entryArtifacts: Object.freeze([...entryArtifacts]),
      transcriptRefs: Object.freeze([...transcripts]),
      editing,
      finalArtifact,
      package: accepted.value.package,
    };
  }
}
