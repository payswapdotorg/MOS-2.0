/**
 * Typed error model of the production pawn surface (LAB-013).
 *
 * Convention: caller errors (malformed input, unknown ids, lifecycle
 * misuse) are THROWN as {@link PawnExecutionError} and append NO execution
 * record — they are not production actions. Failures of a recorded
 * production action (rights denial, typed engine failure, agent-execution
 * failure, unbound llm instance at execute time) are RECORDED on the
 * execution record (§30) instead of thrown.
 *
 * The seam-mirror codes (`instance-not-bound`, `no-model-requested`,
 * `unknown-model`, …) mirror the real `@mos/agent-runtime` failure
 * vocabulary so failures that pass through the seams carry the same codes
 * the real packages would produce.
 */

/** Machine-readable failure codes of {@link PawnExecutionError}. */
export type PawnExecutionErrorCode =
  // Pawn body registration
  | "invalid-pawn-body"
  | "unknown-pawn-kind"
  | "duplicate-pawn-body"
  // Instantiation / lifecycle
  | "invalid-instantiation-input"
  | "unknown-pawn-instance"
  | "pawn-instance-released"
  | "pawn-body-not-registered"
  | "no-model-binding-for-deterministic-pawn"
  | "instance-not-bound"
  | "invalid-execution-input"
  | "invalid-model-catalog"
  | "no-model-requested"
  | "unknown-model"
  | "invalid-agent-instance-input"
  | "instance-tool-outside-body"
  | "instance-capability-outside-body"
  // Task validation
  | "invalid-task"
  | "engine-resource-limits-required"
  // Transform citation
  | "transform-application-unresolved"
  | "transform-kind-not-served"
  | "transform-input-type-not-declared"
  // Artifact citation
  | "input-artifact-unresolved"
  | "artifact-digest-mismatch"
  // Organization citation
  | "organization-unresolved"
  // Pawn organization composition
  | "invalid-pawn-organization";

/** Typed, fail-closed error of the production pawn surface. */
export class PawnExecutionError extends Error {
  readonly code: PawnExecutionErrorCode;

  constructor(code: PawnExecutionErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = "PawnExecutionError";
    this.code = code;
  }
}
