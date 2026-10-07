/**
 * The declared task one pawn executes (LAB-013).
 *
 * A task cites the pawn instance (a REAL agent instance created through the
 * agent-stack instance-registry seam), the transform application (the
 * LAB-011/012 vocabulary: a transform definition pinned to an EXACT version,
 * optionally provenance-cited to a transform-graph node), the input
 * artifact refs (media bytes never travel over the control plane — §6), the
 * declared parameterization, the determinism seed for engine invocations,
 * the §30 actor, and the engine-resource grant for deterministic engine
 * work. An optional organization citation records that the pawn executed as
 * a member of a composed TransformPawnOrganization.
 *
 * The task carries NO model-selection surface (lock rule 9, compile-time
 * pinned): model assignment for LLM-flavored pawns happens ONLY through the
 * single model-runtime boundary at `bindPawnModel` time.
 */

import type {
  ArtifactRef,
  IdentityRef,
  JsonObject,
  JsonSchemaObject,
  ResourceLimits,
  TenantScope,
  TransformGraphRef,
  TransformId,
  Version,
} from "@mos/contracts";

import type { PawnAgentOrganizationId } from "./pawn-ids.js";
import type { PawnInstanceId } from "./pawn-ids.js";

// ---------------------------------------------------------------------------
// Transform application citation (LAB-011/012 vocabulary)
// ---------------------------------------------------------------------------

/**
 * A citation of one transform application: the transform definition pinned
 * to an EXACT version (never a silent latest fallback), optionally the
 * transform-graph node that declared it (LAB-011 `TransformApplicationNode`
 * provenance — graph ref + node id stay opaque here; the lab owns graphs).
 */
export interface TransformApplicationCitation {
  readonly definitionId: TransformId;
  readonly definitionVersion: Version;
  /** Transform graph the application was declared in (optional provenance). */
  readonly graphRef?: TransformGraphRef;
  /** Node id of the application inside the cited graph (optional provenance). */
  readonly nodeId?: string;
}

// ---------------------------------------------------------------------------
// §30 actor
// ---------------------------------------------------------------------------

/**
 * The §30 actor of one pawn execution: the principal the execution runs
 * for. `identity` actors carry the rights-vocabulary principal id (the
 * rights grantee — only grants naming THIS principal count); `service`
 * actors are named services (which cannot hold rights grants themselves —
 * a service-actor execution of a rights-gated transform fails closed at the
 * gate, exactly as the evaluation rule dictates).
 */
export type PawnExecutionActor =
  | { readonly kind: "identity"; readonly principalId: string }
  | { readonly kind: "service"; readonly name: string };

// ---------------------------------------------------------------------------
// Organization citation
// ---------------------------------------------------------------------------

/**
 * Citation of the pawn organization the executing instance belongs to
 * (§30 organization provenance). Resolved fail-closed when present.
 */
export interface PawnOrganizationCitation {
  readonly organizationId: PawnAgentOrganizationId;
  readonly version: Version;
}

// ---------------------------------------------------------------------------
// The task
// ---------------------------------------------------------------------------

/** Input to {@link ../ports/pawn-execution.port.js!PawnExecutionPort.executePawn}. */
export interface TransformPawnTask {
  /** The pawn instance executing the task (REAL agent instance). */
  readonly instanceId: PawnInstanceId;
  /** The transform application this execution applies (exact version). */
  readonly transformApplication: TransformApplicationCitation;
  /** Input artifact refs (validated fail-closed against the artifact source). */
  readonly inputArtifactRefs: readonly ArtifactRef[];
  /** Declared parameterization of the transform application. */
  readonly parameters: JsonObject;
  /** Determinism seed for engine invocations (`null` when unseeded). */
  readonly seed: number | null;
  /** §30 actor (also the rights grantee for the pre-execution rights gate). */
  readonly actor: PawnExecutionActor;
  /** Organization provenance citation (optional; resolved fail-closed). */
  readonly organization?: PawnOrganizationCitation;
  /**
   * Resource limits granted to deterministic engine invocations. REQUIRED
   * (fail-closed) whenever this execution will submit EngineJobs — the
   * engine sandbox has no implicit quotas (§11).
   */
  readonly engineResourceLimits?: ResourceLimits;
  /**
   * Output contract carried on submitted EngineJobs (defaults to
   * `{ type: "object" }`; the runner validates results against it).
   */
  readonly engineOutputContract?: JsonSchemaObject;
}

/** Convenience alias: the tenant scope every pawn operation carries. */
export type { TenantScope };

/** Re-exported for task construction at composition seams. */
export type { IdentityRef };
