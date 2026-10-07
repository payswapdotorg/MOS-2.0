/**
 * Default-lane assignment semantics (ENG-001): the
 * silent-replacement-forbidden rule as a pure function.
 *
 * spec/mos-engine-policy-v2.0.yaml `engineSelection`:
 *   silentEngineReplacementForbidden: true
 *
 * A resolved-engine change (different engine id for the same capability,
 * default lane) without an explicit replacement record is an ERROR PATH —
 * never a silent fallback. Same-engine version changes are explicit bumps
 * (`engine-version-bump`). When the recorded assignment's engine is no
 * longer ACTIVE (explicit deactivation/rollback by an operator) the
 * remediation differs, so the guard fails closed with the dedicated
 * `assigned-engine-inactive` code.
 */

import type { CapabilityId, EngineId, Version } from "@mos/contracts";

import { EngineRegistryError } from "./errors.js";

/** How an engine assignment came to be (owned here; the port re-exports). */
export type EngineAssignmentVia =
  | "initial-resolution"
  | "engine-version-bump"
  | "explicit-replacement"
  | "tenant-override";

/** The recorded assignment facts the guard needs. */
export interface AssignedEngineSummary {
  readonly engineId: EngineId;
  readonly engineVersion: Version;
  readonly via: EngineAssignmentVia;
}

/** The replacement-record facts the guard needs. */
export interface ReplacementRecordSummary {
  readonly capabilityId: CapabilityId;
  readonly fromEngineId: EngineId;
  readonly toEngineId: EngineId;
}

/**
 * Computes the `via` of a default-lane resolution under the
 * silent-replacement-forbidden rule. Throws
 * {@link EngineRegistryError} with code `assigned-engine-inactive` or
 * `silent-engine-replacement` (both naming the recorded and candidate
 * engines in `details`) when the winner would change the recorded engine
 * id without an explicit replacement record.
 */
export function assignmentVia(
  capabilityId: CapabilityId,
  existing: AssignedEngineSummary | undefined,
  winner: { readonly engineId: EngineId; readonly engineVersion: Version },
  replacements: readonly ReplacementRecordSummary[],
  assignedEngineActive: boolean,
): EngineAssignmentVia {
  if (existing === undefined) {
    return "initial-resolution";
  }
  if (existing.engineId === winner.engineId) {
    return existing.engineVersion === winner.engineVersion
      ? existing.via
      : "engine-version-bump";
  }
  const replacement = replacements.find(
    (record) =>
      record.capabilityId === capabilityId &&
      record.fromEngineId === existing.engineId &&
      record.toEngineId === winner.engineId,
  );
  if (replacement === undefined) {
    const details = {
      capabilityId: capabilityId as string,
      currentEngineId: existing.engineId as string,
      currentEngineVersion: existing.engineVersion as number,
      candidateEngineId: winner.engineId as string,
      candidateEngineVersion: winner.engineVersion as number,
    };
    if (!assignedEngineActive) {
      throw new EngineRegistryError(
        "assigned-engine-inactive",
        `Assigned engine ${existing.engineId as string}@${existing.engineVersion as number} for capability ${capabilityId as string} is no longer active, and silent engine replacement is forbidden: record an explicit engine replacement to ${winner.engineId as string}@${winner.engineVersion as number}, or roll back / re-activate the assigned engine.`,
        details,
      );
    }
    throw new EngineRegistryError(
      "silent-engine-replacement",
      `Silent engine replacement forbidden for capability ${capabilityId as string}: recorded assignment is ${existing.engineId as string}@${existing.engineVersion as number}, tie-break winner is ${winner.engineId as string}@${winner.engineVersion as number}. Record an explicit engine replacement to migrate.`,
      details,
    );
  }
  return "explicit-replacement";
}
