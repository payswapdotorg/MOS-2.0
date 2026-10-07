/**
 * Substrate port compatibility pin (AGT-002).
 *
 * Compile-time assertion that the pinned mirror
 * (`src/types/substrate-agent-runtime.ts`) and the REAL
 * `@mos/substrate-adapters` `AgentRuntimePort` surface are MUTUALLY
 * ASSIGNABLE — zero drift. If either side changes a field, method signature
 * or event shape, this file fails to typecheck and the build goes red.
 *
 * Why a mirror at all (disclosed, empirically verified): the substrate
 * adapters package is a typecheck-only SOURCE package (its `exports` map
 * points at `./src/index.ts` and its sources import each other with `.ts`
 * specifiers under `allowImportingTsExtensions`). An EMITTING
 * `moduleResolution: nodenext` consumer (`tsc -b` → `dist/`, which this
 * package needs for its node --test suite) cannot compile those sources —
 * TypeScript reports TS5097 on every internal `.ts` import of the pulled-in
 * substrate sources. Shipping declaration output from the substrate package
 * is outside this wave's package ownership (tracked for the Tech Lead).
 *
 * This file is compiled ONLY by `tsconfig.compat.json` (noEmit +
 * allowImportingTsExtensions) as part of the package `test` script; the
 * runtime half of the pin is `compat/substrate-skeleton.test.ts`, which
 * executes the REAL package (via Node's type-stripping loader) against the
 * built executor.
 */

import type {
  AgentExecutionBudget as RealExecutionBudget,
  AgentExecutionEvent as RealExecutionEvent,
  AgentExecutionInput as RealExecutionInput,
  AgentExecutionRequest as RealExecutionRequest,
  AgentExecutionResult as RealExecutionResult,
  AgentExecutionUsage as RealExecutionUsage,
  AgentFinishReason as RealFinishReason,
  AgentRuntimeHandle as RealRuntimeHandle,
  AgentRuntimePort as RealAgentRuntimePort,
  AgentRuntimeSpec as RealRuntimeSpec,
  AgentRuntimeStopResult as RealRuntimeStopResult,
  AgentEventListener as RealEventListener,
  JsonValue as RealJsonValue,
} from "@mos/substrate-adapters";

import type {
  SubstrateAgentEventListener,
  SubstrateAgentExecutionBudget,
  SubstrateAgentExecutionEvent,
  SubstrateAgentExecutionInput,
  SubstrateAgentExecutionRequest,
  SubstrateAgentExecutionResult,
  SubstrateAgentExecutionUsage,
  SubstrateAgentFinishReason,
  SubstrateAgentRuntimeHandle,
  SubstrateAgentRuntimePort,
  SubstrateAgentRuntimeSpec,
  SubstrateAgentRuntimeStopResult,
  SubstrateJsonValue,
} from "../src/types/substrate-agent-runtime.js";

// ---------------------------------------------------------------------------
// Mutual assignability assertions. Each exported constant typechecks ONLY
// when the source type is assignable to the annotated target type. `null as
// unknown as X` provides a value of the source type without runtime code.
// ---------------------------------------------------------------------------

/** Real port ⇒ mirror port (structural superset check). */
export const realPortSatisfiesMirror: SubstrateAgentRuntimePort =
  null as unknown as RealAgentRuntimePort;

/** Mirror port ⇒ real port (structural subset check). */
export const mirrorPortSatisfiesReal: RealAgentRuntimePort =
  null as unknown as SubstrateAgentRuntimePort;

/** Real spec ⇒ mirror spec. */
export const realSpecSatisfiesMirror: SubstrateAgentRuntimeSpec =
  null as unknown as RealRuntimeSpec;

/** Mirror spec ⇒ real spec. */
export const mirrorSpecSatisfiesReal: RealRuntimeSpec =
  null as unknown as SubstrateAgentRuntimeSpec;

/** Real handle ⇒ mirror handle. */
export const realHandleSatisfiesMirror: SubstrateAgentRuntimeHandle =
  null as unknown as RealRuntimeHandle;

/** Mirror handle ⇒ real handle. */
export const mirrorHandleSatisfiesReal: RealRuntimeHandle =
  null as unknown as SubstrateAgentRuntimeHandle;

/** Real request ⇒ mirror request. */
export const realRequestSatisfiesMirror: SubstrateAgentExecutionRequest =
  null as unknown as RealExecutionRequest;

/** Mirror request ⇒ real request. */
export const mirrorRequestSatisfiesReal: RealExecutionRequest =
  null as unknown as SubstrateAgentExecutionRequest;

/** Real result ⇒ mirror result. */
export const realResultSatisfiesMirror: SubstrateAgentExecutionResult =
  null as unknown as RealExecutionResult;

/** Mirror result ⇒ real result. */
export const mirrorResultSatisfiesReal: RealExecutionResult =
  null as unknown as SubstrateAgentExecutionResult;

/** Real event ⇒ mirror event. */
export const realEventSatisfiesMirror: SubstrateAgentExecutionEvent =
  null as unknown as RealExecutionEvent;

/** Mirror event ⇒ real event. */
export const mirrorEventSatisfiesReal: RealExecutionEvent =
  null as unknown as SubstrateAgentExecutionEvent;

/** Real listener ⇒ mirror listener. */
export const realListenerSatisfiesMirror: SubstrateAgentEventListener =
  null as unknown as RealEventListener;

/** Mirror listener ⇒ real listener. */
export const mirrorListenerSatisfiesReal: RealEventListener =
  null as unknown as SubstrateAgentEventListener;

/** Real usage ⇒ mirror usage. */
export const realUsageSatisfiesMirror: SubstrateAgentExecutionUsage =
  null as unknown as RealExecutionUsage;

/** Mirror usage ⇒ real usage. */
export const mirrorUsageSatisfiesReal: RealExecutionUsage =
  null as unknown as SubstrateAgentExecutionUsage;

/** Real budget ⇒ mirror budget. */
export const realBudgetSatisfiesMirror: SubstrateAgentExecutionBudget =
  null as unknown as RealExecutionBudget;

/** Mirror budget ⇒ real budget. */
export const mirrorBudgetSatisfiesReal: RealExecutionBudget =
  null as unknown as SubstrateAgentExecutionBudget;

/** Real stop result ⇒ mirror stop result. */
export const realStopResultSatisfiesMirror: SubstrateAgentRuntimeStopResult =
  null as unknown as RealRuntimeStopResult;

/** Mirror stop result ⇒ real stop result. */
export const mirrorStopResultSatisfiesReal: RealRuntimeStopResult =
  null as unknown as SubstrateAgentRuntimeStopResult;

/** Real finish reason ⇒ mirror finish reason. */
export const realFinishReasonSatisfiesMirror: SubstrateAgentFinishReason =
  null as unknown as RealFinishReason;

/** Mirror finish reason ⇒ real finish reason. */
export const mirrorFinishReasonSatisfiesReal: RealFinishReason =
  null as unknown as SubstrateAgentFinishReason;

/** Real execution input ⇒ mirror execution input. */
export const realInputSatisfiesMirror: SubstrateAgentExecutionInput =
  null as unknown as RealExecutionInput;

/** Mirror execution input ⇒ real execution input. */
export const mirrorInputSatisfiesReal: RealExecutionInput =
  null as unknown as SubstrateAgentExecutionInput;

/** Real JSON value ⇒ mirror JSON value. */
export const realJsonSatisfiesMirror: SubstrateJsonValue =
  null as unknown as RealJsonValue;

/** Mirror JSON value ⇒ real JSON value. */
export const mirrorJsonSatisfiesReal: RealJsonValue =
  null as unknown as SubstrateJsonValue;

// A mirror-implementing port must be accepted wherever the real port is
// expected (this is how the disclosed in-memory double and the compat
// skeleton test substitute for the real adapter), and vice versa.
export const mirrorDoubleAcceptableAsReal: RealAgentRuntimePort =
  null as unknown as SubstrateAgentRuntimePort;
