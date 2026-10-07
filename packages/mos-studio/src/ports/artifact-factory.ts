/**
 * Studio-side artifact factory port (STUDIO-001 runtime).
 *
 * The Studio assembles artifact PACKAGES; the artifact records themselves are
 * created through this declared port. Wave 1 binds it to a disclosed
 * in-memory test double (src/testing/in-memory-artifact-factory.ts); when the
 * `content` module (CORE-004 / content-artifact authority) lands, a later
 * wave binds this port to the real artifact authority through an adapter.
 *
 * Basis: spec/mos-architecture-v2.0.md §6 (artifact graph: every artifact
 * version is immutable with recorded lineage; parents are never rewritten),
 * §31 (tenant scope on every mutable artifact), AGENTS.md "Media" (bytes live
 * in object/media storage; only refs cross the control plane — hence this
 * port takes a storage ref and optional content bytes ONLY for digest
 * computation in the disclosed double).
 */

import type {
  ContentDigest,
  ProvenanceRef,
  RightsRef,
  StorageRef,
  TenantId,
} from "../contracts/refs.js";
import type {
  StudioArtifactCreationMethod,
  StudioArtifactRef,
  StudioArtifactStage,
  StudioArtifactType,
} from "../contracts/studio-artifact-package.js";

/** Specification of one new immutable artifact version. */
export interface StudioArtifactCreationInput {
  /** Tenant scope — mandatory on every artifact (§31, requireTenantScopeOnMutableArtifacts). */
  readonly tenantId: TenantId;
  readonly type: StudioArtifactType;
  /** Pipeline stage of THIS version (raw / intermediate / final). */
  readonly stage: StudioArtifactStage;
  readonly creationMethod: StudioArtifactCreationMethod;
  /** Where the bytes live (object/media storage ref — never inline over RPC). */
  readonly storageRef: StorageRef;
  /**
   * Content bytes for digest computation. Exactly one of `content` /
   * `precomputedDigest` must be provided: capture paths receive the digest
   * from the capture device receipt; composition paths hand the bytes to the
   * factory, which computes the content digest itself.
   */
  readonly content?: Uint8Array;
  /** Digest already computed by the producing subsystem (e.g. capture receipt). */
  readonly precomputedDigest?: ContentDigest;
  /** Rights context reference covering this artifact (explicit, never inferred). */
  readonly rightsRef: RightsRef;
  /** Provenance record reference covering this artifact (explicit, never inferred). */
  readonly provenanceRef: ProvenanceRef;
  /** Parent artifact versions (immutable lineage, §6). */
  readonly parents: readonly StudioArtifactRef[];
}

/** Result of an artifact creation attempt. */
export type StudioArtifactCreationResult =
  | { readonly ok: true; readonly artifact: StudioArtifactRef }
  | {
      readonly ok: false;
      readonly error:
        | { readonly kind: "content-and-digest-both-missing" }
        | { readonly kind: "content-and-digest-both-provided" }
        | { readonly kind: "invalid-lineage"; readonly reason: string };
    };

/**
 * Factory port consumed by the Studio runtime and the disclosed test doubles
 * (capture, treatment) to materialize immutable `StudioArtifactRef` versions.
 * Version assignment (first version of an artifact id is 1) and digest
 * computation belong to the bound implementation.
 */
export interface StudioArtifactFactoryPort {
  createArtifact(input: StudioArtifactCreationInput): Promise<StudioArtifactCreationResult>;
}
