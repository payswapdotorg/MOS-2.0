import assert from "node:assert/strict";
import { test } from "node:test";

import { createAudioPodcastFormatPlugin, AUDIO_PODCAST_FORMAT_VERSION } from "./audio-podcast.js";
import { createVideoPodcastFormatPlugin, VIDEO_PODCAST_FORMAT_VERSION } from "./video-podcast.js";
import { validateFormatPlugin } from "../format-registry.js";
import { createFormatRegistryWithInitialFormats } from "./initial-formats.js";
import type { SessionIntakeForValidation } from "../../contracts/studio-format.js";

// ---------------------------------------------------------------------------
// STUDIO-010: the podcast format plugins — full descriptors registered in
// the FormatRegistry (input requirements, participant model, capture
// requirements, interviewer requirements, organization compatibility,
// output contract, provenance requirements, evaluation hooks, §16-style
// organization edit decision points).
// ---------------------------------------------------------------------------

test("audio-podcast plugin: complete descriptor registered in the FormatRegistry", () => {
  const plugin = createAudioPodcastFormatPlugin();
  assert.equal(plugin.id, "audio-podcast");
  assert.equal(plugin.version, AUDIO_PODCAST_FORMAT_VERSION);
  assert.deepEqual(validateFormatPlugin(plugin), [], "the audio-podcast plugin must be complete");

  // Registered with the initial formats — resolvable by id + version.
  const registry = createFormatRegistryWithInitialFormats();
  const resolved = registry.resolve(plugin.id, plugin.version);
  assert.ok(resolved.ok, `the audio-podcast plugin must be registered and resolvable: ${JSON.stringify(resolved)}`);
  assert.equal(resolved.plugin.version, plugin.version);
  assert.equal(resolved.plugin.id, plugin.id);

  // §14 input requirements: complete script, question list, intent,
  // intent + source material — and intent-only sessions generate the graph.
  assert.deepEqual(plugin.inputRequirements.acceptedInputs, [
    "complete-script",
    "question-list",
    "intent",
    "intent-with-source-material",
  ]);
  assert.equal(plugin.inputRequirements.requiresRightsClearedSources, true);
  assert.equal(plugin.inputRequirements.generatesScriptFromIntent, true);

  // Participant model: one-person OR multi-account (§15).
  assert.equal(plugin.participantModel.minimumParticipants, 1);
  assert.equal(plugin.participantModel.supportsMultiAccount, true);

  // Capture: audio REQUIRED (video optional — STUDIO-011 is audio-only).
  assert.equal(plugin.captureRequirements.audio.required, true);
  assert.equal(plugin.captureRequirements.video.required, false);

  // Interviewer requirements: six representations + adaptive graph (§14).
  assert.deepEqual([...plugin.interviewerRequirements.supportedRepresentations].sort(), [
    "avatar",
    "generated",
    "hybrid",
    "prerecorded",
    "text",
    "voice",
  ]);
  assert.equal(plugin.interviewerRequirements.requiresAdaptiveQuestionGraph, true);
  assert.equal(plugin.interviewerRequirements.requiresSyntheticDisclosure, true);

  // Organization compatibility + output contract + provenance + evaluation.
  assert.deepEqual(plugin.organizationCompatibility.requiredCapabilities.map(String).sort(), [
    "mix_audio",
    "transcribe_audio",
  ]);
  assert.deepEqual(plugin.outputContract.finalArtifactTypes, ["audio", "text"]);
  assert.equal(plugin.provenanceRequirements.requiresConsentRefsOnRawCapture, true);
  assert.ok(plugin.evaluationHooks.hooks.length >= 2);
});

test("audio-podcast plugin: organization edit decision points declared, concrete edit choices NOT hard-coded (§16-style)", () => {
  const plugin = createAudioPodcastFormatPlugin();
  const points = plugin.organizationDecisionPoints ?? [];
  const pointIds = points.map((point) => point.pointId);
  assert.ok(pointIds.includes("podcast-edit-points"), "the edit-points decision must be exposed");
  assert.ok(pointIds.includes("podcast-edit-pacing"), "the edit-pacing decision must be exposed");
  for (const point of points) {
    assert.equal(point.decidedBy, "organization", "edit decisions belong to the organization");
    assert.ok(point.description.length > 0);
  }
  // The descriptor declares the POINTS, never concrete edit choices.
  const serialized = JSON.stringify(plugin);
  assert.equal(/"(keep|trim|cut|reorder)"/.test(serialized), false, "the format must not encode edit decisions");
});

test("audio-podcast plugin: session intake validation (accepted inputs, rights, participants, script graph)", () => {
  const plugin = createAudioPodcastFormatPlugin();
  const intake = (overrides: Partial<SessionIntakeForValidation>): SessionIntakeForValidation => ({
    inputKind: "question-list",
    sourceArtifacts: [],
    participantCount: 1,
    hasScriptOrQuestionGraph: true,
    ...overrides,
  });

  assert.deepEqual(plugin.validateSessionInput(intake({})), { ok: true });
  assert.deepEqual(plugin.validateSessionInput(intake({ inputKind: "complete-script" })), { ok: true });
  // Intent-only intake: fine BECAUSE the format generates the script graph.
  assert.deepEqual(
    plugin.validateSessionInput(intake({ inputKind: "intent", hasScriptOrQuestionGraph: false })),
    { ok: true },
  );
  // Participant count outside the model bounds is rejected.
  const tooMany = plugin.validateSessionInput(intake({ participantCount: 9 }));
  assert.ok(!tooMany.ok);
  assert.deepEqual(tooMany.reasons.map((r) => r.kind), ["participant-count-out-of-range"]);
  // Rights-uncleared sources are rejected (§27).
  const uncleared = plugin.validateSessionInput(
    intake({
      inputKind: "intent-with-source-material",
      sourceArtifacts: [{ artifactId: "src-1", rightsCleared: false }],
    }),
  );
  assert.ok(!uncleared.ok);
  assert.deepEqual(uncleared.reasons.map((r) => r.kind), ["source-rights-not-cleared"]);
});

test("video-podcast plugin: same interview model, mandatory video capture (structure for STUDIO-012)", () => {
  const plugin = createVideoPodcastFormatPlugin();
  assert.equal(plugin.version, VIDEO_PODCAST_FORMAT_VERSION);
  assert.deepEqual(validateFormatPlugin(plugin), [], "the video-podcast plugin must be complete");
  assert.equal(plugin.captureRequirements.audio.required, true);
  assert.equal(plugin.captureRequirements.video.required, true);
  assert.ok(
    plugin.captureRequirements.video.devices.length > 0,
    "video capture must declare its camera requirement",
  );
  // Podcast edit decision points are shared with audio-podcast; framing is video-specific.
  const pointIds = (plugin.organizationDecisionPoints ?? []).map((point) => point.pointId);
  assert.ok(pointIds.includes("participant-framing"));
  assert.ok(pointIds.includes("podcast-edit-points"));
  // The registry carries both podcast formats alongside reaction.
  const registry = createFormatRegistryWithInitialFormats();
  assert.deepEqual(
    registry.list().map((entry) => entry.formatId).sort(),
    ["audio-podcast", "reaction", "video-podcast"],
  );
});
