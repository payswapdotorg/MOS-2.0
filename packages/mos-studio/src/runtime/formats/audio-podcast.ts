/**
 * "audio-podcast" format descriptor (STUDIO-002 + STUDIO-010; §14).
 *
 * Audio podcast production: interviewer plus one or more human participants
 * recorded as audio only. The interviewer can be any of the six declared
 * representation kinds (voice, text, avatar, prerecorded, generated, hybrid)
 * with mandatory synthetic/generated provenance labeling; adaptive follow-up
 * questions come from a declared question/branch graph (STUDIO-003/004).
 *
 * STUDIO-010 (version 2): the descriptor now declares the PODCAST EDIT
 * decision points the loaded organization owns (§16-style): edit
 * points/pacing/segment inclusion are production-program variables decided
 * by the organization and RECORDED by the studio into the edit graph
 * (STUDIO-011) — the format never encodes concrete edit choices.
 */

import type { StudioFormatId, StudioFormatPlugin } from "../../contracts/studio-format.js";
import { capabilityId, capabilityIds, validateIntakeAsDeclared } from "./format-plugin-basics.js";

/** Audio podcast format version (contract evolution counter). */
export const AUDIO_PODCAST_FORMAT_VERSION = 2;

/** The audio-podcast format plugin descriptor. */
export function createAudioPodcastFormatPlugin(): StudioFormatPlugin {
  const plugin: StudioFormatPlugin = {
    id: "audio-podcast" as StudioFormatId,
    version: AUDIO_PODCAST_FORMAT_VERSION,
    inputRequirements: {
      acceptedInputs: ["complete-script", "question-list", "intent", "intent-with-source-material"],
      requiresRightsClearedSources: true,
      generatesScriptFromIntent: true,
    },
    participantModel: {
      minimumParticipants: 1,
      maximumParticipants: 8,
      allowedRoles: ["interviewer", "subject", "operator", "observer"],
      supportsMultiAccount: true,
    },
    captureRequirements: {
      audio: {
        required: true,
        devices: [
          { deviceClass: "microphone", mediaKind: "audio", sampleRateHz: 44_100, channelCount: 1 },
        ],
        maxTakeSeconds: 10_800,
      },
      video: {
        required: false,
        devices: [],
      },
      allowsMediaImport: true,
    },
    interviewerRequirements: {
      supportedRepresentations: ["voice", "text", "avatar", "prerecorded", "generated", "hybrid"],
      requiresAdaptiveQuestionGraph: true,
      requiresHumanParticipant: true,
      requiresSyntheticDisclosure: true,
    },
    organizationCompatibility: {
      requiredCapabilities: capabilityIds(["transcribe_audio", "mix_audio"]),
      allowsCapabilitySubstitution: false,
    },
    outputContract: {
      finalArtifactTypes: ["audio", "text"],
      allowsMultipleFinalCandidates: true,
    },
    provenanceRequirements: {
      requiresSyntheticDisclosure: true,
      requiresConsentRefsOnRawCapture: true,
      requiresEngineVersionRecording: true,
    },
    evaluationHooks: {
      hooks: [
        { stage: "post-capture", evaluatorCapability: capabilityId("evaluate_content"), blocking: false },
        { stage: "pre-package", evaluatorCapability: capabilityId("evaluate_content"), blocking: true },
      ],
    },
    organizationDecisionPoints: [
      {
        pointId: "podcast-edit-points",
        description:
          "Which conversation segments are kept, trimmed, cut or reordered in the edit graph (the organization decides; the studio records).",
        decidedBy: "organization",
      },
      {
        pointId: "podcast-edit-pacing",
        description:
          "Pacing of the edited conversation (segment ordering and emphasis) as production-program variables.",
        decidedBy: "organization",
      },
    ],
    validateSessionInput: (input: unknown) => validateIntakeAsDeclared(plugin, input),
  };
  return plugin;
}
