/**
 * Shared fixtures for the W9-C format-flow node:test suites (STUDIO-009
 * reaction + STUDIO-012 video podcast). Test-support code only — compiled
 * with the package but never exported from the package index (same pattern
 * as podcast-flow-fixtures.ts).
 *
 * Everything composes over {@link composeFormatFlowScenario}: ONE shared
 * REAL rights authority behind the runtime's §15 gates and the W8-C editing
 * session's contributor gate, ONE shared artifact factory (engine-store +
 * derived-grant aware) behind the runtime and the editing stack.
 */

import assert from "node:assert/strict";

import { ANSWER_CONCLUDE, ANSWER_ELABORATE, createInMemoryScriptGraphGenerator, intentRecordFixture } from "./in-memory-script-graph-generator.js";
import { composeFormatFlowScenario, FLOW_ORGANIZATION_REF } from "./compose-format-flows.js";

export { composeFormatFlowScenario };
import { EDITING_ENGINE_RESOURCE_LIMITS, EDITING_PRINCIPAL, EDITING_STACK_TENANT, EDITING_TRANSFORM_APPLICATION } from "./editing-fixtures.js";
import { INTERVIEWER_AGENT_BODY_ID } from "../runtime/interviewer/interviewer-agent-body.js";
import { createAdaptiveSequencer } from "../runtime/script-graph/adaptive-sequencer.js";
import { createReactionFlow } from "../runtime/reaction/reaction-flow.js";
import { createVideoPodcastFlow } from "../runtime/podcast/video-podcast-flow.js";
import type { StudioFormatPlugin } from "../contracts/studio-format.js";
import type { FormatFlowScenario } from "./compose-format-flows.js";
import type { RealParticipantAuthorities } from "./real-participant-authorities.js";
import type { ReactionProductionPlan, ReactionSourcePlan } from "../runtime/reaction/reaction-plan.js";
import type { ReactionParticipantPlan } from "../runtime/reaction/reaction-plan.js";
import type { VideoPodcastProductionPlan } from "../runtime/podcast/video-podcast-plan.js";
import type { VideoPodcastParticipantPlan } from "../runtime/podcast/video-podcast-plan.js";
import type { JoinParticipantRequest } from "../runtime/intake-types.js";
import type { IntentRecord, ScriptGraphVersionRef } from "../contracts/script-graph.js";
import type { CompositionOperationDeclaration } from "../contracts/editing-composition.js";
import type { PodcastInterviewRound } from "../runtime/podcast/audio-podcast-flow.js";
import type {
  ConsentRef,
  IdentityRef,
  SessionParticipantId,
  StudioSessionId,
  TenantId,
  Timestamp,
  Version,
} from "../contracts/refs.js";

export const TENANT: TenantId = EDITING_STACK_TENANT;
export const SUPPLIER = "identity-format-supplier" as IdentityRef;
export const REACTOR_A = "identity-reactor-1" as IdentityRef;
export const REACTOR_B = "identity-reactor-2" as IdentityRef;
export const SPEAKER_A = REACTOR_A;
export const SPEAKER_B = REACTOR_B;
export const OPERATOR = { kind: "studio-operator", identityRef: "identity-format-operator" } as const;

/**
 * The DETERMINISTIC session id the flows' `createSession` will draw first in
 * a fresh composition (the runtime's id factory emits `t-id-0001` as the
 * request id, then `t-id-0002` as the session id). The §15 consent records
 * the fixtures seed are session-subject scoped, so they must target exactly
 * this session — asserted on every flow result.
 */
export const PREDICTED_SESSION_ID = "sess_t-id-0002" as StudioSessionId;

/** The synthetic AVATAR interviewer (§14: video modality, labeled synthetic-generated, generator named). */
export const SYNTHETIC_AVATAR_INTERVIEWER = {
  representation: "avatar",
  provenance: {
    origin: "synthetic-generated",
    generatorCapability: "generate_avatar" as never,
  },
} as const;

/** Seed one REAL participant (identity + membership + session-scoped use+transform consent). */
export function seedParticipant(
  authorities: RealParticipantAuthorities,
  identityRef: IdentityRef,
): readonly ConsentRef[] {
  authorities.ensureIdentity({ tenantId: TENANT, identityRef });
  const capture = authorities.recordSessionConsent({
    tenantId: TENANT,
    identityRef,
    sessionId: PREDICTED_SESSION_ID,
    actions: ["use"],
  });
  const processing = authorities.recordSessionConsent({
    tenantId: TENANT,
    identityRef,
    sessionId: PREDICTED_SESSION_ID,
    actions: ["transform"],
  });
  return [capture, processing];
}

/** The source rights holder (the identity whose consent covers the source's contribution). */
export const SOURCE_HOLDER = "identity-source-holder-1" as IdentityRef;

/** Seed the source rights holder + one session-scoped consent covering the source. */
export function seedSourceConsent(authorities: RealParticipantAuthorities): ConsentRef {
  authorities.ensureIdentity({ tenantId: TENANT, identityRef: SOURCE_HOLDER });
  return authorities.recordSessionConsent({
    tenantId: TENANT,
    identityRef: SOURCE_HOLDER,
    sessionId: PREDICTED_SESSION_ID,
    actions: ["use", "transform"],
  });
}

/** The standard rights-cleared reaction SOURCE plan (the reacted-to video). */
export function reactionSourcePlan(
  sourceConsentRef: ConsentRef,
  overrides: Partial<ReactionSourcePlan> = {},
): ReactionSourcePlan {
  return {
    artifactId: "source-video-1",
    type: "video",
    storageRef: "storage:format-flows/source-video-1",
    rightsCleared: true,
    rightsRef: "rights-source-video-1",
    provenanceRef: "provenance-source-video-1",
    consentRefs: [sourceConsentRef],
    ...overrides,
  };
}

/** One reaction participant plan entry (real human by default). */
export function reactionParticipantPlan(
  participantId: string,
  identityRef: IdentityRef,
  consentRefs: readonly ConsentRef[],
  account: string,
  overrides: Partial<ReactionParticipantPlan> = {},
): ReactionParticipantPlan {
  return {
    join: joinRequest(participantId, identityRef, consentRefs, account),
    capture: {
      rightsRef: `rights-${account}` as never,
      provenanceRef: `provenance-${account}` as never,
    },
    reactorKind: "human",
    ...overrides,
  };
}

/** One video-podcast participant plan entry (camera + microphone declared). */
export function videoParticipantPlan(
  participantId: string,
  identityRef: IdentityRef,
  consentRefs: readonly ConsentRef[],
  account: string,
  overrides: Partial<VideoPodcastParticipantPlan> = {},
): VideoPodcastParticipantPlan {
  return {
    join: joinRequest(participantId, identityRef, consentRefs, account),
    capture: {
      rightsRef: `rights-${account}` as never,
      provenanceRef: `provenance-${account}` as never,
      videoSourceId: "cam-hd-720",
    },
    ...overrides,
  };
}

function joinRequest(
  participantId: string,
  identityRef: IdentityRef,
  consentRefs: readonly ConsentRef[],
  account: string,
): JoinParticipantRequest {
  return {
    participantId: participantId as never,
    identityRef,
    accountBoundary: { accountId: account as never, deviceRef: `${account}-dev-1` as never },
    roles: ["subject"],
    grantedActions: ["capture", "review"],
    grant: { grantedBy: SUPPLIER },
    consent: { consentRefs: [...consentRefs] },
  };
}

// ---------------------------------------------------------------------------
// The organization's §16 reaction-composition choices (the ORG decides; the
// caller stands in for the org's decision output — disclosed)
// ---------------------------------------------------------------------------

/** One composition operation declaration (closed edit-kind vocabulary). */
function operation(
  operationId: string,
  kind: CompositionOperationDeclaration["kind"],
  inputArtifactRefs: CompositionOperationDeclaration["inputArtifactRefs"],
  parameters: Record<string, unknown>,
): CompositionOperationDeclaration {
  return { operationId, kind, inputArtifactRefs, parameters };
}

/**
 * The organization's reaction-composition decisions at the three §16
 * declared points — a BUILDER over the flow's artifact universe (the ORG
 * decides; the caller stands in for the org's decision output — disclosed).
 * Entry order per round is [audio₍ᵢ₎, video₍ᵢ₎].
 */
export function reactionCompositionChoices(): ReactionProductionPlan["compositionChoices"] {
  return ({ sources, entryArtifacts }) => {
    const source = sources[0];
    const entryAudio = entryArtifacts[0];
    const entryVideo = entryArtifacts[1];
    assert.ok(source !== undefined && entryAudio !== undefined && entryVideo !== undefined);
    return [
      {
        choiceId: "choice-reaction-layout",
        decisionPointId: "reaction-layout",
        selectedOption: "org-learned-layout-variant-a",
        operations: [
          operation("reaction-op-overlay", "overlay", [source, entryVideo], { track: "reaction-over-source" }),
        ],
      },
      {
        choiceId: "choice-reaction-timing",
        decisionPointId: "reaction-timing",
        selectedOption: "org-learned-timing-variant-b",
        operations: [
          operation("reaction-op-reorder", "reorder", [source, entryVideo], { order: ["source", "reaction"] }),
        ],
      },
      {
        choiceId: "choice-source-presentation",
        decisionPointId: "source-presentation",
        selectedOption: "org-learned-presentation-variant-c",
        operations: [
          operation("reaction-op-scale", "scale", [source], { fit: "contain" }),
          operation("reaction-op-caption", "caption", [entryAudio], { language: "en" }),
        ],
      },
    ];
  };
}

/** The organization's video-podcast edit choices at the three declared points (builder). */
export function videoEditChoices(): VideoPodcastProductionPlan["editChoices"] {
  return ({ rawTakes, transcripts }) => {
    const videoA = rawTakes[0];
    const videoB = rawTakes[2];
    const transcriptA = transcripts[0];
    assert.ok(videoA !== undefined && videoB !== undefined && transcriptA !== undefined);
    return [
      {
        choiceId: "choice-framing",
        decisionPointId: "participant-framing",
        selectedOption: "org-learned-framing-side-by-side",
        operations: [
          operation("video-op-overlay", "overlay", [videoA, videoB], { arrangement: "equal-split" }),
        ],
      },
      {
        choiceId: "choice-edit-points",
        decisionPointId: "podcast-edit-points",
        selectedOption: "org-learned-edit-keep-tighten",
        operations: [
          operation("video-op-trim", "trim", [videoA], { leadIn: 0.5 }),
          operation("video-op-cut", "cut", [videoB], { from: 0, to: 20 }),
        ],
      },
      {
        choiceId: "choice-edit-pacing",
        decisionPointId: "podcast-edit-pacing",
        selectedOption: "org-learned-pacing-front-load",
        operations: [
          operation("video-op-reorder", "reorder", [videoA, videoB], { order: ["tightened", "cut"] }),
          operation("video-op-caption", "caption", [transcriptA], { burnIn: true }),
        ],
      },
    ];
  };
}

/** The interview rounds that walk the generated graph to its terminal beat. */
export function terminalRounds(participantIds: readonly SessionParticipantId[]): PodcastInterviewRound[] {
  return [
    { participantId: "participant-1" as SessionParticipantId, answerRef: ANSWER_ELABORATE, answerText: "I got into it slowly" },
    { participantId: participantIds[1] ?? ("participant-1" as SessionParticipantId), answerRef: ANSWER_ELABORATE, answerText: "The community mattered most" },
    { participantId: participantIds[2] ?? ("participant-1" as SessionParticipantId), answerRef: ANSWER_CONCLUDE, answerText: "That is a wrap" },
  ];
}

/** Generate + register the script graph the video interview follows (STUDIO-003). */
export async function scriptGraphFor(scenario: FormatFlowScenario, statement: string): Promise<ScriptGraphVersionRef> {
  const generator = createInMemoryScriptGraphGenerator();
  const intent: IntentRecord = intentRecordFixture({
    statement,
    tenantId: TENANT,
    recordedBy: SUPPLIER,
  });
  const generated = await generator.generateScriptGraph({
    intent,
    formatId: "video-podcast" as never,
  });
  assert.ok(generated.ok, `graph generation must succeed: ${JSON.stringify(generated)}`);
  const registered = scenario.scriptGraphStore.register(generated.draft);
  assert.ok(registered.ok, `graph registration must succeed: ${JSON.stringify(registered)}`);
  return { graphId: registered.value.graph.graphId, version: registered.value.graph.version };
}

/** Build a one-person reaction production plan (single REAL human reactor). */
export async function onePersonReactionPlan(
  scenario: FormatFlowScenario,
  overrides: Partial<ReactionProductionPlan> = {},
): Promise<ReactionProductionPlan> {
  const consentRefs = seedParticipant(scenario.authorities, REACTOR_A);
  const sourceConsentRef = seedSourceConsent(scenario.authorities);
  return {
    tenantId: TENANT,
    supplierIdentityRef: SUPPLIER,
    intent: "React to this launch trailer",
    organizationRef: { id: String(FLOW_ORGANIZATION_REF.id), version: FLOW_ORGANIZATION_REF.version },
    sources: [reactionSourcePlan(sourceConsentRef)],
    participants: [reactionParticipantPlan("participant-1", REACTOR_A, consentRefs, "account-A")],
    rounds: [
      { participantId: "participant-1" as SessionParticipantId },
      { participantId: "participant-1" as SessionParticipantId },
    ],
    compositionChoices: reactionCompositionChoices(),
    operator: OPERATOR,
    processingCost: { currency: "USD", amount: "0.30" },
    processingSeconds: 45,
    ...overrides,
  };
}

/** Build a one-person video-podcast production plan (single participant + synthetic avatar interviewer). */
export async function onePersonVideoPlan(
  scenario: FormatFlowScenario,
  overrides: Partial<VideoPodcastProductionPlan> = {},
): Promise<VideoPodcastProductionPlan> {
  const graph = await scriptGraphFor(scenario, "Interview me about learning to sail");
  const consentRefs = seedParticipant(scenario.authorities, SPEAKER_A);
  return {
    tenantId: TENANT,
    supplierIdentityRef: SUPPLIER,
    intent: "A one-person video podcast about learning to sail",
    organizationRef: { id: String(FLOW_ORGANIZATION_REF.id), version: FLOW_ORGANIZATION_REF.version },
    participants: [videoParticipantPlan("participant-1", SPEAKER_A, consentRefs, "account-A")],
    scriptGraph: graph,
    interviewer: {
      representation: SYNTHETIC_AVATAR_INTERVIEWER,
      agentBody: { bodyId: INTERVIEWER_AGENT_BODY_ID, bodyVersion: 1 as Version },
    },
    rounds: terminalRounds([]),
    editChoices: videoEditChoices(),
    operator: OPERATOR,
    processingCost: { currency: "USD", amount: "0.55" },
    processingSeconds: 60,
    ...overrides,
  };
}

/** Compose a reaction flow over the scenario's runtime with a CUSTOM format plugin (format-gate tests). */
export function reactionFlowWithFormat(
  scenario: FormatFlowScenario,
  formatPlugin: StudioFormatPlugin,
): ReturnType<typeof createReactionFlow> {
  return createReactionFlow({
    runtime: scenario.runtime,
    artifactFactory: scenario.editingStack.artifactFactory,
    editing: scenario.editingStack.editing,
    formatPlugin,
    editingOrganization: FLOW_ORGANIZATION_REF,
    editingActor: { kind: "identity", principalId: EDITING_PRINCIPAL },
    transformApplication: EDITING_TRANSFORM_APPLICATION,
    engineResourceLimits: { ...EDITING_ENGINE_RESOURCE_LIMITS },
    seed: 7,
    clock: scenario.clock,
  });
}

/** Compose a video-podcast flow over the scenario's runtime with a CUSTOM format plugin (format-gate tests). */
export function videoPodcastFlowWithFormat(
  scenario: FormatFlowScenario,
  formatPlugin: StudioFormatPlugin,
): ReturnType<typeof createVideoPodcastFlow> {
  return createVideoPodcastFlow({
    runtime: scenario.runtime,
    artifactFactory: scenario.editingStack.artifactFactory,
    editing: scenario.editingStack.editing,
    formatPlugin,
    editingOrganization: FLOW_ORGANIZATION_REF,
    editingActor: { kind: "identity", principalId: EDITING_PRINCIPAL },
    transformApplication: EDITING_TRANSFORM_APPLICATION,
    engineResourceLimits: { ...EDITING_ENGINE_RESOURCE_LIMITS },
    seed: 7,
    clock: scenario.clock,
    store: scenario.scriptGraphStore,
    sequencer: createAdaptiveSequencer({ store: scenario.scriptGraphStore }),
    agentBinding: scenario.interviewerStack.agentBinding,
    agent: scenario.interviewerStack.agent,
    nextInterviewSessionId: () => `ivs-video-x-${++videoFlowCounter}`,
    nextConversationGraphId: () => `cgraph-video-x-${++videoGraphCounter}`,
  });
}

let videoFlowCounter = 0;
let videoGraphCounter = 0;

/** Deterministic clock passthrough (the scenario's own clock). */
export function clockOf(scenario: FormatFlowScenario): () => Timestamp {
  return scenario.clock;
}
