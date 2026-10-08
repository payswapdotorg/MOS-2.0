import assert from "node:assert/strict";
import { test } from "node:test";

import { createAudioPodcastFormatPlugin } from "../formats/audio-podcast.js";
import { createVideoPodcastFormatPlugin } from "../formats/video-podcast.js";
import { INTERVIEWER_AGENT_BODY_ID } from "../interviewer/interviewer-agent-body.js";
import { ANSWER_CONCLUDE, ANSWER_ELABORATE } from "../../testing/in-memory-script-graph-generator.js";
import {
  OPERATOR,
  PREDICTED_SESSION_ID,
  SPEAKER_A,
  SUPPLIER,
  SYNTHETIC_AVATAR_INTERVIEWER,
  composeFormatFlowScenario,
  onePersonVideoPlan,
  videoEditChoices,
  videoParticipantPlan,
  videoPodcastFlowWithFormat,
} from "../../testing/format-flow-fixtures.js";
import type { VideoPodcastProductionPlan } from "./video-podcast-plan.js";
import type { VideoPodcastParticipantPlan } from "./video-podcast-plan.js";
import type { StudioFormatPlugin } from "../../contracts/studio-format.js";
import type { OrganizationEditChoice } from "../../contracts/editing-composition.js";
import type { InterviewerRepresentation } from "../../contracts/interviewer.js";
import type { Version } from "../../contracts/refs.js";

// ---------------------------------------------------------------------------
// STUDIO-012 fail-closed discipline: the video format's capture requirements
// are ENFORCED (audio-only plans rejected, plugins that do not declare
// mandatory video refused, the runtime's device gate surfacing an insufficient
// camera as a typed capture failure), the interviewer representation must be
// one the format declares, and the org-decision + §15 consent gates bite
// through the W8-C editing surface.
// ---------------------------------------------------------------------------

test("STUDIO-012 fail-closed: an AUDIO-ONLY plan is rejected — video capture is mandatory", async () => {
  const scenario = composeFormatFlowScenario();
  const base = await onePersonVideoPlan(scenario);
  // Strip the participant's video source: the plan becomes audio-only.
  const audioOnly: VideoPodcastParticipantPlan = {
    ...base.participants[0]!,
    capture: { ...base.participants[0]!.capture, videoSourceId: undefined },
  };
  const plan: VideoPodcastProductionPlan = { ...base, participants: [audioOnly] };
  const result = await scenario.videoPodcastFlow.run(plan);
  assert.ok(!result.ok, "the flow must fail closed on an audio-only plan");
  assert.deepEqual(result.error, { kind: "video-capture-required", participantId: "participant-1" });
  // NOTHING ran: no session exists under the predicted id, no engine job ran.
  assert.equal(scenario.runtime.getSession(PREDICTED_SESSION_ID), undefined);
  assert.equal(scenario.editingStack.jobEvents.events.length, 0, "no engine job ever ran");
});

test("STUDIO-012 fail-closed: the flow refuses a plugin that does not declare MANDATORY video capture", async () => {
  const scenario = composeFormatFlowScenario();
  const plugin = createVideoPodcastFormatPlugin();
  const optionalVideo: StudioFormatPlugin = {
    ...plugin,
    captureRequirements: {
      ...plugin.captureRequirements,
      video: { ...plugin.captureRequirements.video, required: false },
    },
  };
  const flow = videoPodcastFlowWithFormat(scenario, optionalVideo);
  const plan = await onePersonVideoPlan(scenario);
  const result = await flow.run(plan);
  assert.ok(!result.ok, "a plugin without the mandatory-video declaration must be refused");
  assert.deepEqual(result.error, { kind: "format-does-not-require-video", formatId: "video-podcast" });
  assert.equal(scenario.editingStack.jobEvents.events.length, 0, "no engine job ever ran");
});

test("STUDIO-012 fail-closed: the flow refuses to run a non-video-podcast format plugin", async () => {
  const scenario = composeFormatFlowScenario();
  const flow = videoPodcastFlowWithFormat(scenario, createAudioPodcastFormatPlugin());
  const plan = await onePersonVideoPlan(scenario);
  const result = await flow.run(plan);
  assert.ok(!result.ok);
  assert.deepEqual(result.error, { kind: "format-not-video-podcast", formatId: "audio-podcast" });
});

test("STUDIO-012 fail-closed: an interviewer representation the format does not declare is rejected", async () => {
  const scenario = composeFormatFlowScenario();
  const plugin = createVideoPodcastFormatPlugin();
  // A custom plugin declaring ONLY the avatar representation (its own declared
  // list — the flow cites the plugin's list, never a studio-side hard-code).
  const avatarOnly: StudioFormatPlugin = {
    ...plugin,
    interviewerRequirements: {
      ...plugin.interviewerRequirements,
      supportedRepresentations: ["avatar"],
    },
  };
  const flow = videoPodcastFlowWithFormat(scenario, avatarOnly);
  const voiceInterviewer: InterviewerRepresentation = {
    representation: "voice",
    provenance: { origin: "synthetic-generated", generatorCapability: "generate_voice" as never },
  };
  const base = await onePersonVideoPlan(scenario);
  const plan: VideoPodcastProductionPlan = {
    ...base,
    interviewer: { ...base.interviewer, representation: voiceInterviewer },
  };
  const result = await flow.run(plan);
  assert.ok(!result.ok, "the voice representation must be rejected against the avatar-only plugin");
  assert.deepEqual(result.error, {
    kind: "interviewer-representation-not-supported",
    representationKind: "voice",
    supportedRepresentations: ["avatar"],
  });
  // NOTHING ran: no session exists under the predicted id.
  assert.equal(scenario.runtime.getSession(PREDICTED_SESSION_ID), undefined);
});

test("STUDIO-012 fail-closed: an INSUFFICIENT camera is a typed capture failure (STUDIO-005 device gate)", async () => {
  const scenario = composeFormatFlowScenario();
  const base = await onePersonVideoPlan(scenario);
  // The low-grade camera (640x360 @ 15fps) cannot satisfy the video-podcast
  // format's declared requirement (1280x720 @ >= 24fps).
  const lowCamera: VideoPodcastParticipantPlan = {
    ...base.participants[0]!,
    capture: { ...base.participants[0]!.capture, videoSourceId: "cam-low-360" },
  };
  const plan: VideoPodcastProductionPlan = { ...base, participants: [lowCamera] };
  const result = await scenario.videoPodcastFlow.run(plan);
  assert.ok(!result.ok, "the insufficient camera must fail the flow closed");
  assert.equal(result.error.kind, "capture-failed");
  const error = (result.error as { participantId: string; error: { kind: string; sourceId?: string; reasons?: string[] } }).error;
  assert.equal(error.kind, "capture-source-insufficient");
  assert.equal(error.sourceId, "cam-low-360");
  assert.ok(
    (error.reasons ?? []).some((reason) => reason.includes("resolution")),
    `the device-requirement reasons surface verbatim: ${JSON.stringify(error.reasons)}`,
  );
  // No engine job ran (the composition never started).
  assert.equal(scenario.editingStack.jobEvents.events.length, 0, "no engine job ever ran");
  // And no package exists (the flow failed before review).
  const view = scenario.runtime.getSession(PREDICTED_SESSION_ID);
  assert.ok(view !== undefined, "the session exists (capturing, mid-flight)");
  assert.equal(view.packages.length, 0);
});

test("STUDIO-012 org-decision discipline: a choice at an UNDECLARED edit point is rejected (no §30 record)", async () => {
  const scenario = composeFormatFlowScenario();
  const base = await onePersonVideoPlan(scenario);
  const undeclared: Omit<OrganizationEditChoice, "decidedAt">[] = [
    {
      choiceId: "choice-bogus",
      decisionPointId: "participant-framing-plus-audio-ducking",
      selectedOption: "made-up-point",
      operations: [],
    },
  ];
  const plan: VideoPodcastProductionPlan = {
    ...base,
    editChoices: () => undeclared.map((choice) => ({ ...choice, operations: [...choice.operations] })),
  };
  const result = await scenario.videoPodcastFlow.run(plan);
  assert.ok(!result.ok, "the flow must fail closed on an undeclared decision point");
  assert.equal(result.error.kind, "editing-session-failed");
  const failure = (result.error as { failure: { kind: string; decisionPointId?: string; declaredPointIds?: string[] } }).failure;
  assert.equal(failure.kind, "choice-point-not-declared");
  assert.equal(failure.decisionPointId, "participant-framing-plus-audio-ducking");
  assert.deepEqual(failure.declaredPointIds, ["participant-framing", "podcast-edit-points", "podcast-edit-pacing"]);
  // Validation failures record NOTHING (no production action ran).
  assert.equal((result.error as { record: unknown }).record, null);
  assert.equal(scenario.editingStack.jobEvents.events.length, 0, "no engine job ever ran");
  const view = scenario.runtime.getSession(PREDICTED_SESSION_ID);
  assert.ok(view !== undefined);
  assert.equal(view.packages.length, 0);
});

test("STUDIO-012 §15 consent gate: a speaker WITHOUT processing consent blocks the editing session", async () => {
  const scenario = composeFormatFlowScenario();
  // Capture consent only: the join + capture gates pass, but the editing
  // session's contributor gate requires processing (transform) consent.
  scenario.authorities.ensureIdentity({ tenantId: scenario.tenantId, identityRef: SPEAKER_A });
  const captureOnly = scenario.authorities.recordSessionConsent({
    tenantId: scenario.tenantId,
    identityRef: SPEAKER_A,
    sessionId: PREDICTED_SESSION_ID,
    actions: ["use"],
  });
  const plan: VideoPodcastProductionPlan = {
    tenantId: scenario.tenantId,
    supplierIdentityRef: SUPPLIER,
    intent: "A one-person video podcast without processing consent",
    organizationRef: { id: "org-studio-format-flows", version: 1 },
    participants: [videoParticipantPlan("participant-1", SPEAKER_A, [captureOnly], "account-A")],
    scriptGraph: (await onePersonVideoPlan(scenario)).scriptGraph,
    interviewer: {
      representation: SYNTHETIC_AVATAR_INTERVIEWER,
      agentBody: { bodyId: INTERVIEWER_AGENT_BODY_ID, bodyVersion: 1 as Version },
    },
    rounds: [
      { participantId: "participant-1" as never, answerRef: ANSWER_ELABORATE, answerText: "I got into it slowly" },
      { participantId: "participant-1" as never, answerRef: ANSWER_ELABORATE, answerText: "The community mattered most" },
      { participantId: "participant-1" as never, answerRef: ANSWER_CONCLUDE, answerText: "That is a wrap" },
    ],
    editChoices: videoEditChoices(),
    operator: OPERATOR,
  };
  const result = await scenario.videoPodcastFlow.run(plan);
  assert.ok(!result.ok, "the missing processing consent must fail the flow");
  assert.equal(result.error.kind, "editing-session-failed");
  const failure = (result.error as { failure: { kind: string; participantIdentityRef?: string } }).failure;
  assert.equal(failure.kind, "consent-not-covering-processing");
  assert.equal(failure.participantIdentityRef, String(SPEAKER_A));
  assert.equal((result.error as { record: unknown }).record, null, "no §30 record — validation failure");
});
