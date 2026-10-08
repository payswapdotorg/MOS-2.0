/**
 * "video-podcast" format descriptor (STUDIO-002 + STUDIO-010; §14).
 *
 * Video podcast production: same interview model as audio-podcast, with
 * mandatory video capture (camera per participant) and a composition stage
 * in the loaded organization. Layout/camera arrangement choices remain
 * organization decisions (exposed as decision points, mirroring the reaction
 * rule of §16 — the Studio never hard-codes composition).
 *
 * STUDIO-010 (version 2): aligned with the audio-podcast descriptor — the
 * same podcast edit decision points (§16-style) plus participant framing;
 * the video capture/processing PATH is STUDIO-012 (structure only here).
 */

import type { StudioFormatId, StudioFormatPlugin } from "../../contracts/studio-format.js";
import { capabilityId, capabilityIds, validateIntakeAsDeclared } from "./format-plugin-basics.js";
import { deepFreezeValue } from "../ownership-support.js";

/** Video podcast format version (contract evolution counter). */
export const VIDEO_PODCAST_FORMAT_VERSION = 2;

/**
 * The video-podcast format plugin descriptor (W10-B: returned DEEPLY FROZEN —
 * the validator closes over this same frozen object, so the declared
 * aspects the runtime's gates read can never be mutated after the fact).
 */
export function createVideoPodcastFormatPlugin(): StudioFormatPlugin {
  const plugin: StudioFormatPlugin = {
    id: "video-podcast" as StudioFormatId,
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
  return deepFreezeValue(plugin);
}
