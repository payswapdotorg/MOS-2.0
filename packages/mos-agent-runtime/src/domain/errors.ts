/**
 * Agent runtime errors (AGT-002).
 *
 * One typed error class carrying a machine-readable `code` (the engines
 * registry convention) — every failure mode of the instance lifecycle, the
 * model boundary and the executor is fail-closed and named.
 */

/** Machine-readable failure codes for the agent runtime. */
export type AgentRuntimeErrorCode =
  | "unknown-agent-instance"
  | "invalid-agent-instance-input"
  | "instance-tool-outside-body"
  | "instance-capability-outside-body"
  | "instance-not-bound"
  | "instance-released"
  | "missing-model-boundary"
  | "no-model-requested"
  | "unknown-model"
  | "invalid-model-catalog"
  | "invalid-execution-input"
  | "substrate-execution-failed";

/** Base (and only) error class for agent runtime failures. */
export class AgentRuntimeError extends Error {
  readonly code: AgentRuntimeErrorCode;

  constructor(code: AgentRuntimeErrorCode, message: string) {
    super(message);
    this.name = "AgentRuntimeError";
    this.code = code;
  }
}
