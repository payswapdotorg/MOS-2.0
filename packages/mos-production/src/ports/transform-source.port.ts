/**
 * Transform source seam (LAB-013) — the LAB-011/012 transform vocabulary
 * read surface.
 *
 * The frozen module registry does NOT make `lab` a production dependency,
 * so the transform vocabulary arrives through @mos/contracts (the canonical
 * `Transform` contract) plus this narrow seam. A resolved transform is the
 * canonical contract EXTENDED with the declared kind (the thirteen frozen
 * §5 kinds, production projection pinned against `@mos/lab`'s
 * `TransformKind` by compat/transform-source-compat.ts).
 *
 * `@mos/lab`'s `TransformDefinition` (LAB-011) satisfies
 * {@link ResolvedPawnTransform} structurally — it extends the canonical
 * contract and carries the same kind union — so the composition root wires
 * the lab registry behind this seam with a one-line delegation
 * (`resolve` → `getTransformDefinition`), disclosed and exercised by
 * compat/pawn-real-stack.test.ts. Unknown and cross-tenant citations are
 * INDISTINGUISHABLE (`null`) — no existence leaks.
 */

import type { TenantScope, Transform, TransformId, Version } from "@mos/contracts";

import type { PawnTransformKind } from "../contracts/pawn-role.js";

/** A resolved transform definition: the canonical contract plus its kind. */
export type ResolvedPawnTransform = Transform & {
  readonly kind: PawnTransformKind;
};

/** Read surface over promoted transform definitions (LAB-011/012 vocabulary). */
export interface PawnTransformSourcePort {
  /**
   * Resolves one transform definition — the EXACT version when given, the
   * latest otherwise — or `null` when unknown in this tenant scope (unknown
   * and cross-tenant are indistinguishable).
   */
  resolve(
    scope: TenantScope,
    definitionId: TransformId,
    version?: Version,
  ): Promise<ResolvedPawnTransform | null>;
}
