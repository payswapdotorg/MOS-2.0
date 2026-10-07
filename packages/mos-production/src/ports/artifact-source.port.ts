/**
 * Artifact source seam (LAB-013) — the @mos/content artifact read surface.
 *
 * The frozen module registry makes `content` a production dependency: the
 * content authority (@mos/content CORE-004) owns artifacts. This package
 * imports it TYPE-ONLY (its exports map resolves runtime imports to
 * untranspiled source, per the sibling-package convention); the resolved
 * record below is a structural subset of `@mos/content`'s `Artifact`, so
 * the composition root satisfies this seam with a one-line delegation over
 * `ArtifactRepository.getArtifact` (disclosed; the testing seam wires the
 * REAL in-memory content repository — see testing/compose-pawn-stack.ts).
 *
 * Input artifact refs of a pawn task are validated fail-closed through this
 * seam BEFORE any rights gate or engine submission: unknown refs,
 * cross-tenant refs and digest mismatches are typed caller errors (no
 * execution record — the task never became a production action).
 */

import type { ArtifactRef, ContentDigest, RightsRef, TenantScope } from "@mos/contracts";

import type { ArtifactId, ArtifactType, TenantId, Version } from "@mos/contracts";

/** The resolved artifact view a pawn task validation needs (content subset). */
export interface PawnResolvedArtifact {
  readonly artifactId: ArtifactId;
  readonly version: Version;
  readonly tenantId: TenantId;
  readonly type: ArtifactType;
  readonly digest: ContentDigest;
  /** Rights context that travels WITH the artifact (never inferred; §6/§27). */
  readonly rightsRef: RightsRef;
}

/** Read surface over the content artifact authority. One public method. */
export interface PawnArtifactSourcePort {
  /**
   * Resolves one artifact citation, or `null` when unknown in this tenant
   * scope (unknown and cross-tenant are indistinguishable — no existence
   * leaks).
   */
  resolve(scope: TenantScope, ref: ArtifactRef): Promise<PawnResolvedArtifact | null>;
}
