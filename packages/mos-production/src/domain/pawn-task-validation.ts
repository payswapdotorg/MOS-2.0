/**
 * Transform pawn task validation (LAB-013).
 *
 * Pure fail-closed shape validation of {@link TransformPawnTask} BEFORE any
 * seam is consulted: malformed tasks are caller errors (typed, thrown — no
 * execution record). Semantic checks that need the seams (instance
 * resolution, transform resolution, artifact resolution) live in the
 * execution runtime adapter.
 */

import { PawnExecutionError } from "./errors.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Validates one declared task shape; throws typed on the first defect. */
export function assertValidTransformPawnTask(task: unknown): void {
  if (!isPlainObject(task)) {
    throw new PawnExecutionError("invalid-task", "a transform pawn task must be an object");
  }
  if (!isNonBlankString(task.instanceId)) {
    throw new PawnExecutionError("invalid-task", "instanceId must be a non-blank string");
  }
  const citation = task.transformApplication;
  if (!isPlainObject(citation) || !isNonBlankString(citation.definitionId)) {
    throw new PawnExecutionError(
      "invalid-task",
      "transformApplication.definitionId must be a non-blank transform id",
    );
  }
  if (!Number.isInteger(citation.definitionVersion) || (citation.definitionVersion as number) < 1) {
    throw new PawnExecutionError(
      "invalid-task",
      "transformApplication.definitionVersion must be an integer >= 1",
    );
  }
  if (citation.graphRef !== undefined && !isNonBlankString(citation.graphRef)) {
    throw new PawnExecutionError("invalid-task", "transformApplication.graphRef must be non-blank when present");
  }
  if (citation.nodeId !== undefined && !isNonBlankString(citation.nodeId)) {
    throw new PawnExecutionError("invalid-task", "transformApplication.nodeId must be non-blank when present");
  }
  if (!Array.isArray(task.inputArtifactRefs) || task.inputArtifactRefs.length === 0) {
    throw new PawnExecutionError(
      "invalid-task",
      "inputArtifactRefs must be a non-empty array of artifact refs",
    );
  }
  for (const ref of task.inputArtifactRefs) {
    if (
      !isPlainObject(ref) ||
      !isNonBlankString(ref.artifactId) ||
      !isNonBlankString(ref.digest) ||
      !isNonBlankString(ref.type) ||
      !isNonBlankString(ref.storageRef)
    ) {
      throw new PawnExecutionError(
        "invalid-task",
        "every input artifact ref must carry artifactId, digest, type and storageRef",
      );
    }
    if (!Number.isInteger(ref.version) || (ref.version as number) < 1) {
      throw new PawnExecutionError("invalid-task", "every input artifact ref must carry version >= 1");
    }
  }
  if (!isPlainObject(task.parameters)) {
    throw new PawnExecutionError("invalid-task", "parameters must be an object");
  }
  if (task.seed !== null && (typeof task.seed !== "number" || !Number.isFinite(task.seed))) {
    throw new PawnExecutionError("invalid-task", "seed must be a finite number or null");
  }
  if (!isPlainObject(task.actor)) {
    throw new PawnExecutionError("invalid-task", "actor must be an object");
  }
  const actor = task.actor;
  if (actor.kind === "identity") {
    if (!isNonBlankString(actor.principalId)) {
      throw new PawnExecutionError("invalid-task", "identity actor principalId must be non-blank");
    }
  } else if (actor.kind === "service") {
    if (!isNonBlankString(actor.name)) {
      throw new PawnExecutionError("invalid-task", "service actor name must be non-blank");
    }
  } else {
    throw new PawnExecutionError("invalid-task", "actor.kind must be 'identity' or 'service'");
  }
  if (task.organization !== undefined) {
    const organization = task.organization;
    if (
      !isPlainObject(organization) ||
      !isNonBlankString(organization.organizationId) ||
      !Number.isInteger(organization.version) ||
      (organization.version as number) < 1
    ) {
      throw new PawnExecutionError(
        "invalid-task",
        "organization citation must carry organizationId and version >= 1",
      );
    }
  }
  if (task.engineResourceLimits !== undefined) {
    const limits = task.engineResourceLimits;
    if (
      !isPlainObject(limits) ||
      !Number.isFinite(limits.cpuCores) ||
      !Number.isFinite(limits.gpuUnits) ||
      !Number.isFinite(limits.memoryMb) ||
      !Number.isFinite(limits.timeoutMs) ||
      (limits.cpuCores as number) <= 0 ||
      (limits.gpuUnits as number) < 0 ||
      (limits.memoryMb as number) <= 0 ||
      (limits.timeoutMs as number) <= 0
    ) {
      throw new PawnExecutionError(
        "invalid-task",
        "engineResourceLimits must carry positive cpuCores/memoryMb/timeoutMs and non-negative gpuUnits",
      );
    }
  }
  if (task.engineOutputContract !== undefined && !isPlainObject(task.engineOutputContract)) {
    throw new PawnExecutionError("invalid-task", "engineOutputContract must be a schema object when present");
  }
}
