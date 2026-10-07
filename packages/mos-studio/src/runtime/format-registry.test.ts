import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createFormatRegistry,
  validateFormatPlugin,
} from "./format-registry.js";
import {
  createFormatRegistryWithInitialFormats,
  INITIAL_STUDIO_FORMAT_IDS,
  registerInitialStudioFormats,
} from "./formats/initial-formats.js";
import { createReactionFormatPlugin } from "./formats/reaction.js";
import { createAudioPodcastFormatPlugin } from "./formats/audio-podcast.js";
import { createVideoPodcastFormatPlugin } from "./formats/video-podcast.js";
import type { StudioFormatPlugin } from "../contracts/studio-format.js";
import { capabilityId, capabilityIds } from "./formats/format-plugin-basics.js";
import { composeTestRuntime } from "../testing/compose-runtime-for-tests.js";

test('initial formats: three plugins register cleanly (reaction, audio-podcast, video-podcast)', () => {
  const registry = createFormatRegistry();
  const results = registerInitialStudioFormats(registry);
  assert.equal(results.length, 3);
  for (const result of results) {
    assert.equal(result.ok, true, `initial format registration must succeed: ${JSON.stringify(result)}`);
  }
  assert.deepEqual(
    registry.list().map((entry) => entry.formatId).sort(),
    [...INITIAL_STUDIO_FORMAT_IDS].sort(),
  );
});

test('initial formats: each descriptor carries every StudioFormat required aspect', () => {
  for (const plugin of [
    createReactionFormatPlugin(),
    createAudioPodcastFormatPlugin(),
    createVideoPodcastFormatPlugin(),
  ]) {
    const errors = validateFormatPlugin(plugin);
    assert.deepEqual(errors, [], `${plugin.id} must be a complete plugin`);
    // The 10 required StudioFormat aspects are present and non-vacuous.
    assert.ok(plugin.inputRequirements.acceptedInputs.length > 0);
    assert.ok(plugin.participantModel.minimumParticipants >= 1);
    assert.ok(plugin.participantModel.allowedRoles.length > 0);
    assert.ok(plugin.captureRequirements.audio.devices.length + plugin.captureRequirements.video.devices.length > 0);
    assert.ok(plugin.organizationCompatibility.requiredCapabilities.length > 0);
    assert.ok(plugin.outputContract.finalArtifactTypes.length > 0);
    assert.equal(typeof plugin.validateSessionInput, 'function');
  }
});

test('initial formats: podcasts declare interviewer representations; reaction declares source-ref + capture instead', () => {
  const reaction = createReactionFormatPlugin();
  const audioPodcast = createAudioPodcastFormatPlugin();
  const videoPodcast = createVideoPodcastFormatPlugin();

  // Podcasts: interviewer model per §14 (six representation kinds).
  for (const podcast of [audioPodcast, videoPodcast]) {
    assert.deepEqual(
      [...podcast.interviewerRequirements.supportedRepresentations].sort(),
      ['avatar', 'generated', 'hybrid', 'prerecorded', 'text', 'voice'],
    );
    assert.equal(podcast.interviewerRequirements.requiresAdaptiveQuestionGraph, true);
    assert.equal(podcast.interviewerRequirements.requiresHumanParticipant, true);
  }

  // Reaction: no interviewer; a human reactor + source intake + capture.
  assert.deepEqual(reaction.interviewerRequirements.supportedRepresentations, []);
  assert.equal(reaction.interviewerRequirements.requiresHumanParticipant, true);
  assert.deepEqual(reaction.inputRequirements.acceptedInputs, ['intent-with-source-material', 'complete-script']);
  assert.equal(reaction.inputRequirements.requiresRightsClearedSources, true);
  assert.equal(reaction.captureRequirements.audio.required, true);
  assert.equal(reaction.captureRequirements.video.required, true);
});

test('reaction format: exposes organization decision points and hard-codes NO layout/timing (§16)', () => {
  const reaction = createReactionFormatPlugin();
  const points = reaction.organizationDecisionPoints ?? [];
  const pointIds = points.map((point) => point.pointId);

  // The decision points exist and are owned by the organization.
  assert.ok(pointIds.includes('reaction-layout'), 'reaction-layout decision point must be exposed');
  assert.ok(pointIds.includes('reaction-timing'), 'reaction-timing decision point must be exposed');
  for (const point of points) {
    assert.equal(point.decidedBy, 'organization');
    assert.ok(point.description.length > 0);
  }

  // §16's concrete choices are production-program variables: the descriptor
  // must NOT encode any of them as values the Studio would apply.
  const serialized = JSON.stringify(reaction);
  const forbidden = /bottom-left|top-right|top-left|bottom-right|picture-in-picture|\bpip\b|source-first|reaction-second|alternating|overlay-first/i;
  assert.equal(
    forbidden.test(serialized),
    false,
    `reaction descriptor must not hard-code layout/timing choices: ${serialized}`,
  );
});

test('pluggability: a custom format plugin is accepted at runtime and drives a session end-to-end', async () => {
  const registry = createFormatRegistryWithInitialFormats();
  const customPlugin: StudioFormatPlugin = {
    id: 'test-cast',
    version: 2,
    inputRequirements: {
      acceptedInputs: ['intent'],
      requiresRightsClearedSources: false,
      generatesScriptFromIntent: true,
    },
    participantModel: {
      minimumParticipants: 1,
      maximumParticipants: 2,
      allowedRoles: ['subject', 'operator'],
      supportsMultiAccount: false,
    },
    captureRequirements: {
      audio: { required: true, devices: [{ deviceClass: 'microphone', mediaKind: 'audio', sampleRateHz: 8000 }] },
      video: { required: false, devices: [] },
      allowsMediaImport: false,
    },
    interviewerRequirements: {
      supportedRepresentations: ['text'],
      requiresAdaptiveQuestionGraph: false,
      requiresHumanParticipant: true,
      requiresSyntheticDisclosure: false,
    },
    organizationCompatibility: {
      requiredCapabilities: capabilityIds(['evaluate_content']),
      allowsCapabilitySubstitution: false,
    },
    outputContract: {
      finalArtifactTypes: ['audio'],
      allowsMultipleFinalCandidates: false,
    },
    provenanceRequirements: {
      requiresSyntheticDisclosure: false,
      requiresConsentRefsOnRawCapture: true,
      requiresEngineVersionRecording: false,
    },
    evaluationHooks: {
      hooks: [{ stage: 'pre-package', evaluatorCapability: capabilityId('evaluate_content'), blocking: true }],
    },
    validateSessionInput: (input: unknown) => {
      const candidate = input as { inputKind?: string } | null;
      if (candidate?.inputKind !== 'intent') {
        return { ok: false, reasons: [{ kind: 'unsupported-input-kind', inputKind: 'intent' }] };
      }
      return { ok: true };
    },
  };
  const registration = registry.register(customPlugin);
  assert.equal(registration.ok, true, `custom format must be accepted: ${JSON.stringify(registration)}`);
  assert.equal(registry.list().length, 4);

  // The custom format actually resolves and the runtime accepts it —
  // pluggability is live, not compile-time. The runtime is composed with the
  // SAME registry instance the plugin was registered into at runtime.
  const resolved = registry.resolve('test-cast', 2);
  assert.equal(resolved.ok, true);
  const { runtime } = composeTestRuntime({ formatRegistry: registry });
  const created = await runtime.createSession({
    kind: 'standalone-intent',
    intent: {
      supplier: { kind: 'standalone-user', identityRef: 'identity-user-1' as never },
      tenantId: 'tenant-custom' as never,
      format: { formatId: 'test-cast', version: 2 },
      inputKind: 'intent',
      intent: 'produce a test cast',
      organizationRef: { id: 'org-test-full', version: 3 },
    },
  });
  assert.equal(created.ok, true, `runtime must accept the custom format: ${JSON.stringify(created)}`);
  assert.equal(created.value.session.formatVersion.formatId, 'test-cast');
  assert.equal(created.value.session.lifecycle.state, 'requested');
});

test('fail-closed: malformed plugins are rejected with enumerated reasons', () => {
  const registry = createFormatRegistry();

  // Missing every declared aspect.
  const missingAspects = registry.register({ id: 'broken', version: 1 });
  assert.equal(missingAspects.ok, false);
  const reasons = missingAspects.reasons as readonly string[];
  for (const aspect of [
    'inputRequirements',
    'participantModel',
    'captureRequirements',
    'interviewerRequirements',
    'organizationCompatibility',
    'outputContract',
    'provenanceRequirements',
    'evaluationHooks',
    'validateSessionInput',
  ]) {
    assert.ok(
      reasons.some((reason) => reason.startsWith(`${aspect}:`)),
      `rejection must enumerate the missing aspect ${aspect}`,
    );
  }

  // Specific shape violations.
  const base = createReactionFormatPlugin();
  const badModel = registry.register({
    ...base,
    id: 'broken-model',
    participantModel: { ...base.participantModel, minimumParticipants: 5, maximumParticipants: 2 },
  });
  assert.equal(badModel.ok, false);
  assert.ok((badModel.reasons as readonly string[]).some((r) => r.includes('maximumParticipants')));

  const badInputKind = registry.register({
    ...base,
    id: 'broken-input',
    inputRequirements: { ...base.inputRequirements, acceptedInputs: ['telepathy' as never] },
  });
  assert.equal(badInputKind.ok, false);
  assert.ok((badInputKind.reasons as readonly string[]).some((r) => r.includes('unknown entry "telepathy"')));

  const badDecisionPoint = registry.register({
    ...base,
    id: 'broken-decision',
    organizationDecisionPoints: [{ pointId: 'layout', description: 'x', decidedBy: 'studio' as never }],
  });
  assert.equal(badDecisionPoint.ok, false);
  assert.ok((badDecisionPoint.reasons as readonly string[]).some((r) => r.includes('decidedBy: must be "organization"')));

  // Not an object at all.
  assert.equal(registry.register(null).ok, false);
  assert.equal(registry.register(undefined).ok, false);
});

test('fail-closed: duplicate format id+version is rejected; other versions coexist', () => {
  const registry = createFormatRegistry();
  registerInitialStudioFormats(registry);
  const duplicate = registry.register(createReactionFormatPlugin());
  assert.equal(duplicate.ok, false);
  assert.ok((duplicate.reasons as readonly string[]).some((r) => r.includes('duplicate format version')));

  // A new version of an existing id is a new registration, not a duplicate.
  const reactionV2 = { ...createReactionFormatPlugin(), version: 2 };
  const upgraded = registry.register(reactionV2);
  assert.equal(upgraded.ok, true);
  const latest = registry.resolve('reaction');
  assert.ok(latest.ok && latest.plugin.version === 2);
  const pinnedV1 = registry.resolve('reaction', 1);
  assert.ok(pinnedV1.ok && pinnedV1.plugin.version === 1);
});

test('resolution: unknown formats and versions fail explicitly (never a fallback)', () => {
  const registry = createFormatRegistryWithInitialFormats();
  const unknown = registry.resolve('does-not-exist');
  assert.ok(!unknown.ok && unknown.error.kind === 'format-not-registered');

  const wrongVersion = registry.resolve('reaction', 99);
  assert.ok(!wrongVersion.ok && wrongVersion.error.kind === 'format-version-not-registered');
  assert.deepEqual(wrongVersion.error.availableVersions, [1]);
});
