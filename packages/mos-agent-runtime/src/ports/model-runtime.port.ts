/**
 * ModelRuntimePort — THE SINGLE MODEL/RUNTIME BOUNDARY (AGT-002).
 *
 * Architecture lock rule 9: "No second model router is introduced; model
 * selection remains behind a single model-runtime boundary." This port IS
 * that boundary. It is the ONLY place model (and runtime) selection happens
 * in the agent stack:
 *
 * - instances request a binding via {@link ModelRuntimePort.bindModel};
 * - a caller's `requestedModelRef` is a PREFERENCE the port may honor or
 *   override — it can never force a selection (pinned by tests: a request
 *   naming a model outside the port's catalog fails closed with
 *   `unknown-model` rather than bypassing the boundary);
 * - the resulting {@link ModelBinding} is the only source of the
 *   `modelRef`/`runtimeRef` recorded on agent instances;
 * - no other module of this package exposes any model-selection surface
 *   (pinned structurally by src/single-model-boundary.test.ts).
 *
 * Model interchangeability (AGT-002 acceptance): the same body binds
 * different models through this port — swap the modelRef, get another
 * instance of the same body. Fail-closed: no default and no request ⇒
 * `no-model-requested`; unknown model ⇒ `unknown-model` naming it. The
 * port never performs provider SDK calls (boundary rule MOS-NO-ENGINE-SDK)
 * — concrete model execution is the substrate executor's concern
 * (InstanceExecutorPort over the substrate AgentRuntimePort).
 */

import type { ModelRef, RuntimeRef, TenantScope, Timestamp, Version } from "@mos/contracts";
import type { AgentBodyId } from "@mos/agents";

/** A request for one model binding for one agent body version. */
export interface ModelBindingRequest {
  readonly tenantScope: TenantScope;
  readonly bodyId: AgentBodyId;
  readonly bodyVersion: Version;
  /**
   * Caller preference only — the port may honor or override it. It is NOT
   * a selection: the selected model is whatever the port returns.
   */
  readonly requestedModelRef?: ModelRef;
}

/**
 * One model binding: the selected model and the runtime that executes it.
 * Decided ONLY by the ModelRuntimePort implementation.
 */
export interface ModelBinding {
  readonly modelRef: ModelRef;
  readonly runtimeRef: RuntimeRef;
  readonly boundAt: Timestamp;
}

/**
 * THE single model/runtime boundary. One public method — `bindModel` — and
 * model selection exists nowhere else in this package (test-pinned).
 */
export interface ModelRuntimePort {
  /**
   * Binds a model for one agent body version. Fail-closed:
   * `no-model-requested` when neither a request nor a configured default
   * exists; `unknown-model` when the resolved model is not in the port's
   * catalog.
   */
  bindModel(request: ModelBindingRequest): ModelBinding;
}
