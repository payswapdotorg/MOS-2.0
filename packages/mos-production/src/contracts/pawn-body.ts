/**
 * The transform pawn body record (LAB-013).
 *
 * A pawn body is a REAL {@link AgentBody} (the frozen 14-field CORE-001
 * contract) plus the transform-domain role contract
 * ({@link TransformPawnRoleContract}). The agent-body half is registered
 * through the agent-stack body-registry seam (the mirrored
 * `@mos/agents` `AgentBodyRegistryPort` — compat-pinned, zero adapters);
 * the role half is the production-side index that execution and
 * organization composition check against.
 *
 * Coherence rules (validated on registration, fail-closed):
 * - the `AgentBody` record satisfies the frozen required-field manifest;
 * - the body's `capabilities` are exactly the role's served capabilities
 *   (the body contract and the role contract describe one pawn);
 * - every engine tool binding's capability is among the served
 *   capabilities, and the body's `tools` are the derived engine tool refs
 *   (plus declared non-engine tool refs when the builder adds them);
 * - `llm-flavored` pawns carry the agent-execution path; `deterministic`
 *   pawns never bind a model (enforced at the lifecycle surface, pinned).
 */

import type { AgentBody, ToolRef } from "@mos/contracts";

import type {
  PawnEngineToolBinding,
  TransformPawnKind,
  TransformPawnRoleContract,
} from "./pawn-role.js";
import type { PawnAgentBodyId } from "./pawn-ids.js";

/**
 * One registered transform pawn body: the canonical agent body plus the
 * transform-domain role.
 */
export interface TransformPawnBody {
  /** The transform-domain role contract (machine-checkable dimensions). */
  readonly role: TransformPawnRoleContract;
  /** The canonical agent body contract (registered through the seam). */
  readonly agentBody: AgentBody;
}

/** Identifies one pawn body by kind + exact agent-body version. */
export interface PawnBodyCitation {
  readonly pawnKind: TransformPawnKind;
  readonly bodyVersion?: number;
}

/**
 * Derives the canonical tool-ref string of one engine tool binding. Tool
 * refs are opaque strings on the agent-body contract; this package fixes
 * their derivation so the body's declared tools and its engine bindings can
 * never disagree:
 * `engine-tool:{engineId}@{engineVersion}:{capabilityId}@{capabilityVersion}`
 */
export function engineToolRef(binding: PawnEngineToolBinding): ToolRef {
  return `engine-tool:${binding.engineId as string}@${binding.engineVersion as number}` +
    `:${binding.capabilityId as string}@${binding.capabilityVersion as number}` as ToolRef;
}

/** Reference to one registered pawn body (kind + exact version). */
export interface TransformPawnBodyRef {
  readonly bodyId: PawnAgentBodyId;
  readonly bodyVersion: number;
  readonly pawnKind: TransformPawnKind;
}
