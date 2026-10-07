/**
 * "audio-podcast" format descriptor (STUDIO-002 initial formats; §14).
 *
 * Audio podcast production: interviewer plus one or more human participants
 * recorded as audio only. The interviewer can be any of the six declared
 * representation kinds (voice, text, avatar, prerecorded, generated, hybrid)
 * with mandatory synthetic/generated provenance labeling; adaptive follow-up
 * questions come from a declared question/branch graph.
 */

import type { StudioFormatId, StudioFormatPlugin } from "../../contracts/studio-format.js";
import { capabilityId, capabilityIds, validateIntakeAsDeclared } from "./format-plugin-basics.js";

/** Audio podcast format version (contract evolution counter). */
export const AUDIO_PODCAST_FORMAT_VERSION = 1;

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
    validateSessionInput: (input: unknown) => validateIntakeAsDeclared(plugin, input),
  };
  return plugin;
}
