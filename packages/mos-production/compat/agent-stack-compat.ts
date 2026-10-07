/**
 * Agent-stack seam compatibility pin (LAB-013).
 *
 * Compile-time assertion that the mirrored seams of this package
 * (src/ports/agent-stack.ports.ts) and the REAL `@mos/agents` /
 * `@mos/agent-runtime` surfaces are MUTUALLY ASSIGNABLE — zero drift. If
 * either side changes a field or method signature, this file fails to
 * typecheck (compiled by tsconfig.compat.json as part of the package test
 * script) and the build goes red.
 *
 * Why mirrored seams at all (disclosed): the frozen module registry gives
 * `production` the dependencies [contracts, content, rights, policy] —
 * `agents` and `agent-runtime` are NOT among them, so the runtime module
 * graph of this package cannot import those packages. The REAL packages
 * still satisfy the seams with ZERO adapters (asserted here), so the
 * composition root wires them unchanged; the runtime half of the pin is
 * compat/pawn-real-stack.test.ts.
 *
 * Import form: the real packages are imported by RELATIVE SOURCE PATH
 * (their exports maps point `types` at src/index.ts — the same source this
 * resolves to; no runtime dependency is created).
 */

import type {
  AgentBodyRegistryPort as RealBodyRegistryPort,
  AgentBodyId as RealAgentBodyId,
} from "../../mos-agents/src/index.js";
import type {
  AgentInstanceRegistry as RealInstanceRegistry,
  InstanceExecutorPort as RealInstanceExecutorPort,
  ModelRuntimePort as RealModelRuntimePort,
} from "../../mos-agent-runtime/src/index.js";
import type {
  AgentInstanceExecutionInput as RealExecutionInput,
  AgentInstanceExecutionOutcome as RealExecutionOutcome,
} from "../../mos-agent-runtime/src/index.js";
import type {
  ModelBinding as RealModelBinding,
  ModelBindingRequest as RealModelBindingRequest,
} from "../../mos-agent-runtime/src/index.js";
import type { AgentInstanceRecord as RealInstanceRecord } from "../../mos-agent-runtime/src/index.js";
import type {
  SubstrateAgentExecutionEvent as RealExecutionEvent,
  SubstrateAgentExecutionUsage as RealExecutionUsage,
  SubstrateAgentFinishReason as RealFinishReason,
} from "../../mos-agent-runtime/src/index.js";

import type {
  PawnBodyRegistryPort,
  PawnInstanceExecutionInput,
  PawnInstanceExecutorPort,
  PawnInstanceRecord,
  PawnInstanceRegistryPort,
  PawnModelBinding,
  PawnModelBindingRequest,
  PawnModelRuntimePort,
  PawnAgentExecutorEvent,
  PawnAgentExecutorOutcome,
  PawnAgentExecutorUsage,
  PawnAgentExecutorFinishReason,
} from "../src/ports/agent-stack.ports.js";
import type { PawnAgentBodyId } from "../src/contracts/pawn-ids.js";

// ---------------------------------------------------------------------------
// Mutual assignability assertions. Each exported constant typechecks ONLY
// when the source type is assignable to the annotated target type. `null as
// unknown as X` provides a value of the source type without runtime code.
// ---------------------------------------------------------------------------

/** Real body registry ⇒ the mirrored body-registry seam. */
export const realBodyRegistrySatisfiesMirror: PawnBodyRegistryPort =
  null as unknown as RealBodyRegistryPort;

/** The mirrored body-registry seam ⇒ the real body registry. */
export const mirrorBodyRegistrySatisfiesReal: RealBodyRegistryPort =
  null as unknown as PawnBodyRegistryPort;

/** The derived body ids are the SAME brand on both sides. */
export const bodyIdBrandsAreIdentical: RealAgentBodyId = null as unknown as PawnAgentBodyId;
export const bodyIdBrandsAreIdenticalReverse: PawnAgentBodyId = null as unknown as RealAgentBodyId;

/** Real instance registry ⇒ the mirrored instance-registry seam. */
export const realInstanceRegistrySatisfiesMirror: PawnInstanceRegistryPort =
  null as unknown as RealInstanceRegistry;

/**
 * The mirrored instance-registry seam ⇒ the real registry: NOT assignable
 * (the real `instantiate` returns the branded `AgentInstanceRecord`, the
 * mirror returns the unbranded view) — the composition direction is the one
 * above; documented, not asserted.
 */

/** Real instance record ⇒ the mirrored record view. */
export const realInstanceRecordSatisfiesMirror: PawnInstanceRecord =
  null as unknown as RealInstanceRecord;

/** Real executor ⇒ the mirrored executor seam (outcome superset: id echo). */
export const realExecutorSatisfiesMirror: PawnInstanceExecutorPort =
  null as unknown as RealInstanceExecutorPort;

/**
 * The mirrored executor double ⇒ the real executor: NOT assignable (the
 * real outcome requires the instanceId echo the mirror omits) — the
 * composition direction is the one above; documented, not asserted.
 */

/** Real execution input ⇒ the mirrored input union. */
export const realInputSatisfiesMirror: PawnInstanceExecutionInput =
  null as unknown as RealExecutionInput;

/** Mirrored input union ⇒ the real execution input. */
export const mirrorInputSatisfiesReal: RealExecutionInput =
  null as unknown as PawnInstanceExecutionInput;

/** Real execution outcome ⇒ the mirrored outcome (superset: id echo). */
export const realOutcomeSatisfiesMirror: PawnAgentExecutorOutcome =
  null as unknown as RealExecutionOutcome;

/** Real execution events ⇒ the mirrored event union. */
export const realEventsSatisfyMirror: readonly PawnAgentExecutorEvent[] =
  null as unknown as readonly RealExecutionEvent[];

/** Mirrored event union ⇒ the real execution events. */
export const mirrorEventsSatisfyReal: readonly RealExecutionEvent[] =
  null as unknown as readonly PawnAgentExecutorEvent[];

/** Real usage ⇒ the mirrored usage. */
export const realUsageSatisfiesMirror: PawnAgentExecutorUsage =
  null as unknown as RealExecutionUsage;

/** Mirrored usage ⇒ the real usage. */
export const mirrorUsageSatisfiesReal: RealExecutionUsage =
  null as unknown as PawnAgentExecutorUsage;

/** Real finish reason ⇒ the mirrored finish reason. */
export const realFinishReasonSatisfiesMirror: PawnAgentExecutorFinishReason =
  null as unknown as RealFinishReason;

/** Mirrored finish reason ⇒ the real finish reason. */
export const mirrorFinishReasonSatisfiesReal: RealFinishReason =
  null as unknown as PawnAgentExecutorFinishReason;

/** Real model boundary ⇒ THE mirrored single model boundary. */
export const realModelRuntimeSatisfiesMirror: PawnModelRuntimePort =
  null as unknown as RealModelRuntimePort;

/** The mirrored model boundary ⇒ the real model boundary. */
export const mirrorModelRuntimeSatisfiesReal: RealModelRuntimePort =
  null as unknown as PawnModelRuntimePort;

/** Real binding request ⇒ the mirrored request. */
export const realBindingRequestSatisfiesMirror: PawnModelBindingRequest =
  null as unknown as RealModelBindingRequest;

/** Mirrored request ⇒ the real binding request. */
export const mirrorBindingRequestSatisfiesReal: RealModelBindingRequest =
  null as unknown as PawnModelBindingRequest;

/** Real binding ⇒ the mirrored binding. */
export const realBindingSatisfiesMirror: PawnModelBinding =
  null as unknown as RealModelBinding;

/** Mirrored binding ⇒ the real binding. */
export const mirrorBindingSatisfiesReal: RealModelBinding =
  null as unknown as PawnModelBinding;
