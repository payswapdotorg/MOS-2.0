/**
 * "reaction" format descriptor (STUDIO-002 initial formats; §16).
 *
 * Reaction production: one or more humans react to a rights-cleared SOURCE
 * artifact; raw reaction capture enters the loaded organization as an
 * intermediate artifact and the organization's production program composes
 * the final output.
 *
 * ARCHITECTURE RULE (§16): the reaction format deliberately does NOT declare
 * any concrete layout or timing — bottom-left picture-in-picture,
 * source-first ordering, alternating segments, timing of overlays and every
 * other learned composition choice is a PRODUCTION-PROGRAM VARIABLE owned by
 * the loaded organization. This descriptor exposes those open decisions as
 * {@link OrganizationDecisionPoint}s (`decidedBy: "organization"`) and the
 * Studio runtime has no authority over their values.
 */

import type { StudioFormatPlugin } from "../../contracts/studio-format.js";
import { capabilityId, capabilityIds, validateIntakeAsDeclared } from "./format-plugin-basics.js";

/** Reaction format version (contract evolution counter). */
export const REACTION_FORMAT_VERSION = 1;

/** The reaction format plugin descriptor. */
export function createReactionFormatPlugin(): StudioFormatPlugin {
  const plugin: StudioFormatPlugin = {
    id: "reaction",
    version: REACTION_FORMAT_VERSION,
    inputRequirements: {
      // A reaction needs something to react to: source material must be part
      // of the intake; a complete script may replace a free-form intent.
      acceptedInputs: ["intent-with-source-material", "complete-script"],
      requiresRightsClearedSources: true,
      generatesScriptFromIntent: true,
    },
    participantModel: {
      minimumParticipants: 1,
      maximumParticipants: 8,
      allowedRoles: ["subject", "operator", "observer"],
      supportsMultiAccount: true,
    },
    captureRequirements: {
      audio: {
        required: true,
        devices: [
          { deviceClass: "microphone", mediaKind: "audio", sampleRateHz: 16_000, channelCount: 1 },
        ],
        maxTakeSeconds: 7_200,
      },
      video: {
        required: true,
        devices: [
          { deviceClass: "camera", mediaKind: "video", resolutionMin: "640x360", frameRateMin: 24 },
          { deviceClass: "screen-capture", mediaKind: "video", resolutionMin: "640x360", frameRateMin: 15 },
        ],
        maxTakeSeconds: 7_200,
      },
      allowsMediaImport: true,
    },
    interviewerRequirements: {
      // Reaction has no interviewer representation; a human reactor is required.
      supportedRepresentations: [],
      requiresAdaptiveQuestionGraph: false,
      requiresHumanParticipant: true,
      requiresSyntheticDisclosure: true,
    },
    organizationCompatibility: {
      requiredCapabilities: capabilityIds(["compose_reaction", "render_timeline"]),
      allowsCapabilitySubstitution: false,
    },
    outputContract: {
      finalArtifactTypes: ["video", "timeline"],
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
        pointId: "reaction-layout",
        description:
          "Spatial composition of the source stream and the reaction stream in the final output (placement and arrangement).",
        decidedBy: "organization",
      },
      {
        pointId: "reaction-timing",
        description:
          "Temporal composition of source and reaction segments (ordering, alternation and overlay timing).",
        decidedBy: "organization",
      },
      {
        pointId: "source-presentation",
        description:
          "How the source artifact is presented to the reacting participant and in the output (presentation form and emphasis).",
        decidedBy: "organization",
      },
    ],
    validateSessionInput: (input: unknown) => validateIntakeAsDeclared(plugin, input),
  };
  return plugin;
}
