/**
 * Shared machinery for built-in format descriptors (STUDIO-002).
 *
 * Formats are DATA + hooks, not hard-coded studio behavior: every built-in
 * descriptor declares its aspects and wires this generic session-intake
 * validator. Custom plugins may ship their own validator — the runtime only
 * requires the `StudioFormatPlugin` contract.
 */

import type {
  FormatInputRejectionReason,
  SessionIntakeForValidation,
  StudioFormatPlugin,
} from "../../contracts/studio-format.js";
import type { CapabilityId } from "../../contracts/refs.js";

/**
 * Declare capability ids for format descriptors. Capability ids are branded
 * refs owned by the `capabilities` module (CAP-001, not in this base); the
 * declared strings reconcile with that module in a later wave. Kept as a
 * single helper so every descriptor's intent ("these are capability ids,
 * pending reconciliation") is explicit.
 */
export const capabilityIds = (ids: readonly string[]): readonly CapabilityId[] =>
  ids as readonly CapabilityId[];

/** Single capability id declaration (same reconciliation note as above). */
export const capabilityId = (id: string): CapabilityId => id as CapabilityId;

/** Narrow an unknown intake to the canonical shape (unknown fields ignored). */
function coerceIntake(input: unknown): SessionIntakeForValidation | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const candidate = input as Partial<SessionIntakeForValidation>;
  if (typeof candidate.inputKind !== "string") {
    return undefined;
  }
  return {
    inputKind: candidate.inputKind as SessionIntakeForValidation["inputKind"],
    sourceArtifacts: Array.isArray(candidate.sourceArtifacts) ? candidate.sourceArtifacts : [],
    participantCount:
      typeof candidate.participantCount === "number" ? candidate.participantCount : undefined,
    hasScriptOrQuestionGraph: candidate.hasScriptOrQuestionGraph === true,
  };
}

/**
 * Generic intake validator derived from a plugin's declared aspects:
 * - input kind must be accepted;
 * - sources must be rights-cleared when the format requires it (§27);
 * - participant count (when known at intake) must fit the model;
 * - intent-only intake needs the format to generate the script/question
 *   graph (§14) or a script/question graph must already exist.
 */
export function validateIntakeAsDeclared(
  plugin: StudioFormatPlugin,
  input: unknown,
): { ok: true } | { ok: false; reasons: readonly FormatInputRejectionReason[] } {
  const intake = coerceIntake(input);
  if (intake === undefined) {
    return {
      ok: false,
      reasons: [{ kind: "unsupported-input-kind", inputKind: "intent" }],
    };
  }
  const reasons: FormatInputRejectionReason[] = [];
  if (!plugin.inputRequirements.acceptedInputs.includes(intake.inputKind)) {
    reasons.push({ kind: "unsupported-input-kind", inputKind: intake.inputKind });
  }
  if (plugin.inputRequirements.requiresRightsClearedSources) {
    for (const source of intake.sourceArtifacts) {
      if (!source.rightsCleared) {
        reasons.push({ kind: "source-rights-not-cleared", sourceRef: source.artifactId });
      }
    }
  }
  if (intake.participantCount !== undefined) {
    const { minimumParticipants, maximumParticipants } = plugin.participantModel;
    if (
      intake.participantCount < minimumParticipants ||
      intake.participantCount > maximumParticipants
    ) {
      reasons.push({ kind: "participant-count-out-of-range", participantCount: intake.participantCount });
    }
  }
  const intentOnly = intake.inputKind === "intent" || intake.inputKind === "intent-with-source-material";
  if (
    intentOnly &&
    !plugin.inputRequirements.generatesScriptFromIntent &&
    !intake.hasScriptOrQuestionGraph
  ) {
    reasons.push({ kind: "missing-script-or-question-graph" });
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
