/**
 * Intake-side validation helpers of the Studio runtime (STUDIO-001).
 *
 * Pure functions over session records/inputs: processing-output lineage
 * validation (§6 — closed lineage, tenant scope, staged artifacts, output
 * contract), review-rejection consistency (§19 — quality and rights/policy
 * rejections are distinct, never conflated), and capture-role/device
 * derivation from format declarations.
 */

import type {
  CaptureDeviceClass,
  CaptureDeviceRequirement,
  CaptureMediaKind,
  CaptureParticipantRole,
} from "../contracts/capture.js";
import type { StudioFormatPlugin } from "../contracts/studio-format.js";
import type { SessionParticipant } from "../contracts/studio-session.js";
import type { StudioArtifactRef } from "../contracts/studio-artifact-package.js";
import type {
  StudioOutputReviewOutcome,
  StudioRejection,
} from "../contracts/treatment.js";
import type { StudioRuntimeError } from "./errors.js";
import type { StudioProcessingOutput } from "./intake-types.js";
import type { StudioSessionRecord } from "./session-state.js";
import { studioMoneyIssues } from "./money.js";

/**
 * Validate a processing output against the session state and the format's
 * declared output contract. Returns the enumerated violation reasons (empty
 * = valid). Checks: stage consistency, tenant scope (§31), closed lineage
 * (§6 — parents must be known artifacts; parentless intermediates/finals are
 * rejected because raw human output is never silently final §6/§16), final
 * artifact types, and the single-final-candidate constraint.
 */
export function validateProcessingOutput(
  record: StudioSessionRecord,
  output: StudioProcessingOutput,
): string[] {
  const reasons: string[] = [];
  const known = new Set<string>([
    ...record.draft.rawArtifacts.map((a) => a.artifactId),
    ...record.draft.intermediateArtifacts.map((a) => a.artifactId),
    ...record.draft.finalArtifacts.map((a) => a.artifactId),
  ]);
  const check = (artifacts: readonly StudioArtifactRef[], expectedStage: string, label: string): void => {
    for (const artifact of artifacts) {
      if (artifact.stage !== expectedStage) {
        reasons.push(`${label} ${artifact.artifactId}: stage "${artifact.stage}" must be "${expectedStage}"`);
      }
      if (artifact.tenantId !== record.tenantId) {
        reasons.push(`${label} ${artifact.artifactId}: tenant mismatch (§31 tenant scope)`);
      }
      if (artifact.parentArtifactRefs.length === 0) {
        reasons.push(
          `${label} ${artifact.artifactId}: parentless ${expectedStage} artifact — raw human output is never silently final (§6/§16)`,
        );
      }
      for (const parent of artifact.parentArtifactRefs) {
        if (!known.has(parent.artifactId)) {
          reasons.push(`${label} ${artifact.artifactId}: unknown parent ${parent.artifactId} (lineage must be closed, §6)`);
        }
      }
      known.add(artifact.artifactId);
    }
  };
  check(output.intermediateArtifacts, "intermediate", "intermediate");
  check(output.finalArtifacts, "final", "final");
  const allowedTypes = record.formatPlugin.outputContract.finalArtifactTypes;
  for (const artifact of output.finalArtifacts) {
    if (!allowedTypes.includes(artifact.type)) {
      reasons.push(
        `final ${artifact.artifactId}: type "${artifact.type}" not in format output contract [${allowedTypes.join(", ")}]`,
      );
    }
  }
  if (
    !record.formatPlugin.outputContract.allowsMultipleFinalCandidates &&
    record.draft.finalArtifacts.length + output.finalArtifacts.length > 1
  ) {
    reasons.push("format allows a single final candidate only");
  }
  // STUDIO-013 (W9-B D5 finite-number guards at intake): declared cost and
  // processing seconds are validated BEFORE they can poison the packaged
  // totals — NaN/Infinity/negative amounts fail closed here and again at
  // packaging.
  if (output.additionalCost !== undefined) {
    for (const issue of studioMoneyIssues(output.additionalCost)) {
      reasons.push(`additionalCost: ${issue}`);
    }
  }
  if (
    output.processingSeconds !== undefined &&
    (typeof output.processingSeconds !== "number" || !Number.isFinite(output.processingSeconds) || output.processingSeconds < 0)
  ) {
    reasons.push(
      `processingSeconds must be a finite non-negative number (got ${String(output.processingSeconds)})`,
    );
  }
  return reasons;
}

/**
 * Check that a review outcome carries the rejection kind §19 requires:
 * reject-quality/reject-strategy → quality rejection; reject-rights-policy →
 * rights/policy rejection; non-rejection outcomes carry none. The two
 * rejection kinds are never interchangeable.
 */
export function checkRejectionMatchesOutcome(
  outcome: StudioOutputReviewOutcome,
  rejection: StudioRejection | undefined,
): StudioRuntimeError | undefined {
  const mismatch = (expected: string, actual: string): StudioRuntimeError => ({
    kind: "rejection-kind-mismatch",
    outcome,
    expectedRejectionKind: expected,
    actualRejectionKind: actual,
  });
  if (outcome === "reject-quality" || outcome === "reject-strategy") {
    if (rejection === undefined || rejection.kind !== "quality-rejection") {
      return mismatch("quality-rejection", rejection?.kind ?? "none");
    }
    return undefined;
  }
  if (outcome === "reject-rights-policy") {
    if (rejection === undefined || rejection.kind !== "rights-policy-rejection") {
      return mismatch("rights-policy-rejection", rejection?.kind ?? "none");
    }
    return undefined;
  }
  if (rejection !== undefined) {
    return mismatch("none", rejection.kind);
  }
  return undefined;
}

/**
 * Derive the capture role of a participant (contracts/capture.ts roles):
 * first of interviewer/subject/operator among the participant's session
 * roles. Observers cannot capture.
 */
export function deriveCaptureRole(participant: SessionParticipant): CaptureParticipantRole | undefined {
  const roles = participant.roles as readonly string[];
  if (roles.includes("interviewer")) {
    return "interviewer";
  }
  if (roles.includes("subject")) {
    return "subject";
  }
  if (roles.includes("operator")) {
    return "operator";
  }
  return undefined;
}

/** Find the format's device requirement for a media kind + device class slot. */
export function findDeviceRequirement(
  plugin: StudioFormatPlugin,
  mediaKind: CaptureMediaKind,
  deviceClass: CaptureDeviceClass,
): CaptureDeviceRequirement | undefined {
  const section = mediaKind === "audio" ? plugin.captureRequirements.audio : plugin.captureRequirements.video;
  return section.devices.find((device) => device.deviceClass === deviceClass && device.mediaKind === mediaKind);
}

/** Declared maximum take length for a media kind (UX guidance). */
export function maxTakeFor(plugin: StudioFormatPlugin, mediaKind: CaptureMediaKind): number | undefined {
  const section = mediaKind === "audio" ? plugin.captureRequirements.audio : plugin.captureRequirements.video;
  return section.maxTakeSeconds;
}
