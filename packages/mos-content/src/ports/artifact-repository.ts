import type { TenantScope } from '@mos/contracts';
import type { RightsRepository } from '@mos/rights';
import type {
  Artifact,
  ArtifactId,
  ArtifactRef,
  ArtifactType,
  ContentDigest,
  CreationMethod,
  StorageRef,
} from '../contracts/artifact.js';
import type { ProvenanceRef, RightsRef } from '@mos/rights';

/**
 * Repository port for the MOS content domain (CORE-004): the artifact graph.
 *
 * Split into two interfaces (interface segregation — both implemented by the
 * same adapter factory):
 *
 * - {@link ArtifactRepository} — registration + lookup;
 * - {@link ArtifactGraph} — lineage queries (ancestors/descendants).
 *
 * THERE IS DELIBERATELY NO UPDATE OR DELETE OPERATION. Artifacts are immutable
 * (architecture §6: "Every artifact is versioned and lineage-preserving"):
 * a new version is a new record linking the previous one; a correction is a
 * new record. `registerArtifactVersion` is the only way to extend a chain.
 *
 * Failure model: mutating operations return either the resulting record or a
 * typed {@link ContentRepositoryError} value (result union, no thrown
 * subclasses) — the `@mos/identity` convention. Reads use `null` / empty-array
 * misses so cross-tenant existence never leaks.
 *
 * RIGHTS GATE: every registration names a `rightsRef` that must resolve to an
 * explicit, tenant-matching, ACTIVE rights grant. The gate is evaluated
 * through the injected {@link RightsSource} (a narrow structural view of
 * `@mos/rights`' `RightsRepository`), so this package imports `@mos/rights`
 * TYPE-ONLY and remains hexagonal — the composition root wires a real rights
 * repository at TL integration time.
 */
export type RightsSource = Pick<RightsRepository, 'getRights'>;

export interface ArtifactRepository {
  /**
   * Register a NEW artifact (version 1). The draft's lineage parents must
   * already exist in the same tenant (or be empty for a root record), and the
   * `rightsRef` must pass the rights gate. Fails with `invalid-input`,
   * `duplicate-artifact`, `unknown-parent`, `cross-tenant-reference`,
   * `no-explicit-grant`, `rights-grant-revoked`, `rights-grant-expired` or
   * `rights-grant-tenant-mismatch`.
   */
  registerArtifact(input: RegisterArtifactInput): Artifact | ContentRepositoryError;

  /**
   * Register the NEXT version of an existing artifact: creates a new record
   * (`version` = latest + 1) whose lineage is `[previous version's self-ref,
   * ...additionalParents]`. The previous record is never mutated and remains
   * retrievable. Same validations and rights gate as registration.
   */
  registerArtifactVersion(input: RegisterArtifactVersionInput): Artifact | ContentRepositoryError;

  /**
   * Fetch an artifact record by id (latest version by default, an exact
   * version when given), or `null` when unknown in this tenant scope
   * (cross-tenant reads never leak existence).
   */
  getArtifact(scope: TenantScope, id: ArtifactId, version?: number): Artifact | null;

  /**
   * List the latest version of every artifact visible in a tenant scope
   * (full version history remains reachable via `getArtifact`). Empty array
   * for an unknown tenant scope.
   */
  listArtifacts(scope: TenantScope): readonly Artifact[];
}

/** Lineage queries over the immutable artifact graph (CORE-004). */
export interface ArtifactGraph {
  /**
   * Transitive ancestors of an artifact version (parents, grandparents, …),
   * oldest-generation first, deterministically ordered. Fails with
   * `artifact-not-found` or `cross-tenant-reference`.
   */
  getAncestors(
    scope: TenantScope,
    id: ArtifactId,
    version?: number,
  ): readonly ArtifactRef[] | ContentRepositoryError;

  /**
   * Transitive descendants of an artifact version — every later record whose
   * lineage (transitively) includes that exact version, INCLUDING later
   * versions of the same artifact id (a new version links its predecessor).
   * Fails with `artifact-not-found` or `cross-tenant-reference`.
   */
  getDescendants(
    scope: TenantScope,
    id: ArtifactId,
    version?: number,
  ): readonly ArtifactRef[] | ContentRepositoryError;
}

/** Draft of a brand-new artifact (version 1). */
export interface ArtifactDraft {
  readonly id: ArtifactId;
  readonly type: ArtifactType;
  readonly digest: ContentDigest;
  readonly storageRef: StorageRef;
  readonly provenanceRef: ProvenanceRef;
  readonly rightsRef: RightsRef;
  readonly lineage: readonly ArtifactRef[];
  readonly creationMethod: CreationMethod;
}

export interface RegisterArtifactInput {
  readonly scope: TenantScope;
  readonly artifact: ArtifactDraft;
}

export interface RegisterArtifactVersionInput {
  readonly scope: TenantScope;
  /** Existing artifact id whose version chain is being extended. */
  readonly id: ArtifactId;
  readonly type: ArtifactType;
  readonly digest: ContentDigest;
  readonly storageRef: StorageRef;
  readonly provenanceRef: ProvenanceRef;
  readonly rightsRef: RightsRef;
  /** Extra parents beyond the automatically-linked previous version. */
  readonly additionalParents: readonly ArtifactRef[];
  readonly creationMethod: CreationMethod;
}

/** Machine-readable failure codes returned by mutating operations. */
export type ContentRepositoryErrorCode =
  | 'invalid-input'
  | 'duplicate-artifact'
  | 'artifact-not-found'
  | 'unknown-parent'
  | 'cross-tenant-reference'
  | 'no-explicit-grant'
  | 'rights-grant-revoked'
  | 'rights-grant-expired'
  | 'rights-grant-tenant-mismatch';

/**
 * Typed failure value. Use `'error' in result` to discriminate against the
 * success record (success records never carry an `error` field).
 */
export interface ContentRepositoryError {
  readonly error: ContentRepositoryErrorCode;
  readonly message: string;
}
