/**
 * Transform-source seam compatibility pin (LAB-013).
 *
 * Compile-time assertion that the transform vocabulary of this package
 * (src/ports/transform-source.port.ts + src/contracts/pawn-role.ts) and the
 * REAL `@mos/lab` LAB-011 surfaces agree — zero drift:
 *
 * - the thirteen frozen §5 transform kinds are the SAME union on both sides
 *   (`TransformKind` ⇔ `PawnTransformKind`);
 * - the REAL `TransformDefinition` (which extends the canonical CORE-001
 *   `Transform` contract) satisfies the seam's resolved view
 *   (`ResolvedPawnTransform = Transform & { kind }`) — so the composition
 *   root wires the lab registry behind the seam with a ONE-LINE DELEGATION
 *   (`resolve` → `getTransformDefinition`), asserted below by the
 *   delegation-view constant;
 * - the delegation's return type satisfies the seam's resolve signature.
 *
 * The runtime half of the pin is compat/pawn-real-stack.test.ts (pawn
 * executions against REAL lab definitions).
 */

import type {
  TransformDefinition as RealTransformDefinition,
  TransformDefinitionRegistry as RealTransformDefinitionRegistry,
  TransformKind as RealTransformKind,
} from "../../mos-lab/src/index.js";
import type { Transform, TenantScope, TransformId, Version } from "@mos/contracts";

import type { PawnTransformKind } from "../src/contracts/pawn-role.js";
import type {
  PawnTransformSourcePort,
  ResolvedPawnTransform,
} from "../src/ports/transform-source.port.js";

// ---------------------------------------------------------------------------
// Assignability assertions (`null as unknown as X` — no runtime code).
// ---------------------------------------------------------------------------

/** The lab's thirteen kinds ⇒ the production projection. */
export const labKindSatisfiesProjection: PawnTransformKind =
  null as unknown as RealTransformKind;

/** The production projection ⇒ the lab's thirteen kinds. */
export const projectionSatisfiesLabKind: RealTransformKind =
  null as unknown as PawnTransformKind;

/** The REAL TransformDefinition satisfies the seam's resolved view. */
export const labDefinitionSatisfiesView: ResolvedPawnTransform =
  null as unknown as RealTransformDefinition;

/** The resolved view is the canonical Transform contract (plus kind). */
export const viewSatisfiesCanonicalTransform: Transform =
  null as unknown as ResolvedPawnTransform;

/**
 * The one-line delegation view over the REAL lab registry satisfies the
 * seam — this is EXACTLY the composition-root wiring (the method names
 * differ, the shapes do not):
 * `{ resolve: (scope, id, version) => registry.getTransformDefinition(scope, id, version) }`.
 */
export const labDelegationSatisfiesSeam: PawnTransformSourcePort = {
  resolve: null as unknown as (
    scope: TenantScope,
    definitionId: TransformId,
    version?: Version,
  ) => Promise<RealTransformDefinition | null>,
};

/** The lab registry's own resolve-shaped method type, for the record. */
export type LabResolveShape = RealTransformDefinitionRegistry["getTransformDefinition"];
