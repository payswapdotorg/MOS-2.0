/**
 * "video-podcast" format descriptor (STUDIO-002 initial formats; §14).
 *
 * Video podcast production: same interview model as audio-podcast, with
 * mandatory video capture (camera per participant) and a composition stage
 * in the loaded organization. Layout/camera arrangement choices remain
 * organization decisions (exposed as decision points, mirroring the reaction
 * rule of §16 — the Studio never hard-codes composition).
 */

import type { StudioFormatPlugin } from "../../contracts/studio-format.js";
import { capabilityId, capabilityIds, validateIntakeAsDeclared } from "./format-plugin-basics.js";

/** Video podcast format version (contract evolution counter). */
export const VIDEO_PODCAST_FORMAT_VERSION = 1;

/** The video-podcast format plugin descriptor. */
export function createVideoPodcastFormatPlugin(): StudioFormatPlugin {
  const plugin: StudioFormatPlugin = {
    id: "video-podcast",
    version: VIDEO_PODCAST_FORMAT_VERSION,
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
        required: true,
        devices: [
          { deviceClass: "camera", mediaKind: "video", resolutionMin: "1280x720", frameRateMin: 24 },
        ],
        maxTakeSeconds: 10_800,
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
      requiredCapabilities: capabilityIds(["transcribe_audio", "mix_audio", "compose_video"]),
      allowsCapabilitySubstitution: false,
    },
    outputContract: {
      finalArtifactTypes: ["video", "timeline", "text"],
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
        pointId: "participant-framing",
        description:
          "How each captured participant stream is framed and composed into the video output (spatial arrangement).",
        decidedBy: "organization",
      },
    ],
    validateSessionInput: (input: unknown) => validateIntakeAsDeclared(plugin, input),
  };
  return plugin;
}
