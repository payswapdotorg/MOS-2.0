/**
 * AgentInstanceRegistry port (AGT-002) — instance lifecycle.
 *
 * instantiate → bind (via the single model boundary) → release, with
 * fail-closed unknowns and explicit tenant scopes. The registry REQUIRES a
 * {@link ModelRuntimePort} at construction: without the boundary there is
 * no path to a bound (executable) instance — model selection cannot happen
 * here, only THROUGH the port.
 */

import type { TenantScope } from "@mos/contracts";

import type { AgentInstanceRecord, InstantiateAgentInstanceInput } from "../domain/agent-instance.js";
import type { ModelBinding } from "./model-runtime.port.js";

/** Agent instance lifecycle registry. 5 public methods. */
export interface AgentInstanceRegistry {
  /**
   * Creates one agent instance of a registered body version under a tenant
   * scope. Tool/capability bindings default to the body's declarations and
   * must be subsets of them (fail-closed otherwise). The new record is in
   * the `instantiated` state — no model is selected yet.
   */
  instantiate(scope: TenantScope, input: InstantiateAgentInstanceInput): AgentInstanceRecord;

  /**
   * Requests a model binding for one instance THROUGH the single model
   * boundary ({@link ModelRuntimePort.bindModel}) and records the returned
   * binding. `requestedModelRef` is a preference for the port, never a
   * selection. Re-binding a bound instance is allowed (model
   * interchangeability); released instances fail closed
   * (`instance-released`). Returns the updated record.
   */
  bind(
    scope: TenantScope,
    instanceId: AgentInstanceRecord["instanceId"],
    requestedModelRef?: ModelBinding["modelRef"],
  ): AgentInstanceRecord;

  /**
   * Releases one instance (terminal state — the record retains its last
   * binding). Returns the updated record.
   */
  release(scope: TenantScope, instanceId: AgentInstanceRecord["instanceId"]): AgentInstanceRecord;

  /**
   * Resolves one instance record for the tenant, or `undefined` when
   * unknown or owned by another tenant (fail-closed, no existence leaks).
   */
  get(scope: TenantScope, instanceId: AgentInstanceRecord["instanceId"]): AgentInstanceRecord | undefined;

  /** All instance records for the tenant (insertion order). */
  list(scope: TenantScope): readonly AgentInstanceRecord[];
}
