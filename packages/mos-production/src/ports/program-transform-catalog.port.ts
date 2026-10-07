/**
 * Transform catalog seam (LAB-016) — the LAB-011/012 PROMOTED-transform
 * vocabulary the program search's transform-chain dimension varies over.
 *
 * The frozen module registry does NOT make `lab` a production dependency,
 * so the promoted-transform vocabulary arrives through @mos/contracts (the
 * canonical `Transform` contract) plus this narrow seam. The W7-B
 * `PawnTransformSourcePort` resolves ONE definition; program search needs
 * the candidate SET, so this seam lists the promoted definitions visible
 * in a tenant scope.
 *
 * `@mos/lab`'s `TransformDefinitionRegistry.listTransformDefinitions`
 * satisfies this seam with a ONE-LINE DELEGATION (the method names match
 * modulo naming; the resolved `TransformDefinition` satisfies
 * `ResolvedPawnTransform` — pinned by compat/transform-source-compat.ts
 * and re-pinned for the listing view by compat/program-search-compat.ts).
 * The composition root wires the real registry behind this seam.
 *
 * The in-memory double (adapters/in-memory-program-transform-catalog.ts)
 * is a DISCLOSED double. Listing is tenant-scoped; the NO-OP/REPOST KIND
 * is filtered out of the CHAIN vocabulary by the search (the no-op path
 * is the EMPTY chain baseline, never a chain step — pinned) but the seam
 * itself lists whatever the underlying registry promotes.
 */

import type { TenantScope } from "@mos/contracts";

import type { ResolvedPawnTransform } from "./transform-source.port.js";

/** Read surface over the promoted transform vocabulary (LAB-011/012). */
export interface ProgramTransformCatalogPort {
  /**
   * The promoted transform definitions visible in this tenant scope
   * (latest versions; the composition root may order by its own policy —
   * the search is deterministic given the listing it receives).
   */
  listPromotedTransforms(scope: TenantScope): Promise<readonly ResolvedPawnTransform[]>;
}
