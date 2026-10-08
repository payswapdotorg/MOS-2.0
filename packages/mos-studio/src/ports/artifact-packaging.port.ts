/**
 * StudioArtifactPackagingPort (STUDIO-013) — the studio's canonical
 * artifact-package/provenance AUTHORITY.
 *
 * ONE packaging path: the session runtime (review accept, treatment
 * successor), the editing-composition runtime (new immutable treatment
 * versions) and thereby every format flow (reaction, audio-podcast,
 * video-podcast) compose their `StudioArtifactPackage` through THIS port.
 * Required fields complete BY CONSTRUCTION; gaps are typed failures (see
 * contracts/artifact-packaging.ts).
 *
 * The port also exposes the immutable version browsing the studio's product
 * surface (STUDIO-014) composes over: exact-version reads, ascending version
 * listings and tenant-scoped package summaries — all append-only, all
 * deep-frozen (historical packages are never rewritten).
 *
 * 5 public methods (architecture policy budget: 12).
 */

import type { TenantScope } from "@mos/contracts";

import type { StudioArtifactPackageId, StudioSessionId } from "../contracts/refs.js";
import type { StudioArtifactPackage } from "../contracts/studio-artifact-package.js";
import type {
  SessionPackageCompositionInput,
  StudioPackagingOutcome,
  SuccessorPackageCompositionInput,
} from "../contracts/artifact-packaging.js";

/** One tenant-scoped package summary (browsing surface, STUDIO-014). */
export interface StudioPackageSummary {
  readonly packageId: StudioArtifactPackageId;
  readonly sessionRef: StudioSessionId;
  /** Latest composed version (append-only chain length ≥ 1). */
  readonly latestVersion: number;
  readonly versionCount: number;
}

/**
 * The canonical packaging authority. Composition methods are synchronous and
 * pure over their inputs (no engine/network/IO) — packaging is a studio-side
 * consolidation, not a production action.
 */
export interface StudioArtifactPackagingPort {
  /**
   * Compose the next package version from a session draft (review accept /
   * treatment successor). STRICT battery: raw artifacts, transcripts, a REAL
   * edit-graph ref, provenance on every artifact, closed + root-traceable
   * lineage, full consent coverage incl. imported sources, an evaluation
   * record, finite cost/duration. Registers the version in the append-only
   * tenant store (never in-place).
   */
  composeSessionPackage(
    scope: TenantScope,
    input: SessionPackageCompositionInput,
  ): StudioPackagingOutcome;

  /**
   * Compose the NEW immutable successor version of an editing session
   * (treatment-versioned, §19): same package id at version+1 over a packaged
   * source, or a new id over an intermediates source. Predecessors are never
   * mutated; the new edit-graph ref is required; projections are truthful.
   */
  composeSuccessorVersion(
    scope: TenantScope,
    input: SuccessorPackageCompositionInput,
  ): StudioPackagingOutcome;

  /** One composed version (exact version, or the latest when omitted). */
  getArtifactPackage(
    scope: TenantScope,
    packageId: StudioArtifactPackageId,
    version?: number,
  ): StudioArtifactPackage | undefined;

  /** All composed versions of one package id, ascending (append-only chain). */
  listPackageVersions(
    scope: TenantScope,
    packageId: StudioArtifactPackageId,
  ): readonly StudioArtifactPackage[];

  /** Tenant-scoped summaries of every package the authority composed. */
  listPackages(scope: TenantScope, filter?: { readonly sessionRef?: StudioSessionId }): readonly StudioPackageSummary[];
}
