import type { TenantScope } from '@mos/contracts';
import type { RightsRef } from '@mos/rights';
import type {
  Artifact,
  ArtifactId,
  ArtifactRef,
  Version,
} from '../contracts/artifact.js';
import type {
  ArtifactDraft,
  ArtifactGraph,
  ArtifactRepository,
  ContentRepositoryError,
  ContentRepositoryErrorCode,
  RegisterArtifactInput,
  RegisterArtifactVersionInput,
  RightsSource,
} from '../ports/artifact-repository.js';

/**
 * Options for {@link createInMemoryArtifactRepository}.
 *
 * `rights` is the injected rights source (a narrow structural view of
 * `@mos/rights`' `RightsRepository`): every artifact registration passes the
 * rights gate through it. `now` is injectable for deterministic expiry
 * evaluation; it defaults to real wall-clock ISO-8601 strings.
 */
export interface InMemoryArtifactRepositoryOptions {
  readonly rights: RightsSource;
  readonly now?: () => string;
}

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

/**
 * Build an in-memory {@link ArtifactRepository} & {@link ArtifactGraph}.
 *
 * W1-A GROUNDWORK DISCLOSURE: this adapter is an ephemeral, process-local
 * scaffold used to pin the domain model and the port contract. It is NOT
 * production persistence: no database, no migrations, no durability, and no
 * verification that the bytes behind a `storageRef` actually exist or match
 * the recorded digest (that verification belongs to the storage adapter).
 * The central schema/migration story is owned by the Tech Lead; a durable
 * adapter replaces this one in a later wave without touching the port.
 *
 * Graph invariant: registration validates that every lineage parent already
 * exists, so lineage edges always point from newer records to older records —
 * the artifact graph is acyclic BY CONSTRUCTION.
 */
export function createInMemoryArtifactRepository(
  options: InMemoryArtifactRepositoryOptions,
): ArtifactRepository & ArtifactGraph {
  const now = options.now ?? (() => new Date().toISOString());
  const rights = options.rights;

  /** Version chains: artifact id → (version → record). */
  const chains = new Map<ArtifactId, Map<number, Artifact>>();

  const fail = (
    error: ContentRepositoryErrorCode,
    message: string,
  ): ContentRepositoryError => ({ error, message });

  const isBlank = (value: string): boolean => value.trim().length === 0;

  const refKey = (artifactId: ArtifactId, version: number): string => `${artifactId}@${version}`;

  const toRef = (artifact: Artifact): ArtifactRef => ({
    artifactId: artifact.id,
    version: artifact.version,
    tenantId: artifact.tenantId,
    digest: artifact.digest,
    type: artifact.type,
    storageRef: artifact.storageRef,
    rightsRef: artifact.rightsRef,
    provenanceRef: artifact.provenanceRef,
  });

  const latestIn = (chain: Map<number, Artifact>): Artifact | undefined => {
    let newest: Artifact | undefined;
    for (const candidate of chain.values()) {
      if (newest === undefined || candidate.version > newest.version) {
        newest = candidate;
      }
    }
    return newest;
  };

  const resolveInScope = (
    scope: TenantScope,
    id: ArtifactId,
    version?: number,
  ): Artifact | null => {
    const chain = chains.get(id);
    if (chain === undefined || chain.size === 0) {
      return null;
    }
    const record = version === undefined ? latestIn(chain) : chain.get(version);
    if (record === undefined || record.tenantId !== scope.tenantId) {
      // Unknown and cross-tenant are indistinguishable on reads: no leak.
      return null;
    }
    return record;
  };

  /**
   * THE RIGHTS GATE (CORE-004 acceptance): artifact registration requires a
   * `rightsRef` that resolves to an explicit, tenant-matching, ACTIVE rights
   * grant. A storageRef/URL — however public or reachable — never implies
   * rights: without a resolvable explicit grant the registration is denied
   * with `no-explicit-grant`.
   */
  const checkRightsGate = (
    scope: TenantScope,
    rightsRef: RightsRef,
  ): ContentRepositoryError | null => {
    const grant = rights.getRights(rightsRef);
    if (grant === null) {
      return fail(
        'no-explicit-grant',
        `rightsRef does not resolve to an explicit rights grant: ${rightsRef}` +
          ' (object-store/URL accessibility never implies rights)',
      );
    }
    if (grant.tenantId !== scope.tenantId) {
      return fail(
        'rights-grant-tenant-mismatch',
        `rights grant ${rightsRef} belongs to tenant ${grant.tenantId}, not ${scope.tenantId}`,
      );
    }
    if (grant.revokedAt !== null) {
      return fail(
        'rights-grant-revoked',
        `rights grant ${rightsRef} was revoked at ${grant.revokedAt}`,
      );
    }
    if (grant.expiresAt !== null && grant.expiresAt <= now()) {
      return fail('rights-grant-expired', `rights grant ${rightsRef} expired at ${grant.expiresAt}`);
    }
    return null;
  };

  const validateParents = (
    scope: TenantScope,
    parents: readonly ArtifactRef[],
  ): ContentRepositoryError | null => {
    for (const parent of parents) {
      const record = chains.get(parent.artifactId)?.get(parent.version);
      if (record === undefined) {
        return fail(
          'unknown-parent',
          `lineage parent does not exist: ${refKey(parent.artifactId, parent.version)}`,
        );
      }
      if (record.tenantId !== scope.tenantId) {
        return fail(
          'cross-tenant-reference',
          `lineage parent ${refKey(parent.artifactId, parent.version)} does not belong to tenant ${scope.tenantId}`,
        );
      }
    }
    return null;
  };

  const validateDraftFields = (draft: {
    type: ArtifactDraft['type'];
    digest: ArtifactDraft['digest'];
    storageRef: ArtifactDraft['storageRef'];
  }): ContentRepositoryError | null => {
    if (isBlank(draft.type)) {
      return fail('invalid-input', 'artifact type must not be blank');
    }
    if (!DIGEST_PATTERN.test(draft.digest)) {
      return fail(
        'invalid-input',
        `artifact digest must be sha256:<64 lowercase hex>: ${draft.digest}`,
      );
    }
    if (isBlank(draft.storageRef)) {
      return fail('invalid-input', 'artifact storageRef must not be blank');
    }
    return null;
  };

  const freezeRecord = (artifact: Artifact): Artifact =>
    Object.freeze({
      ...artifact,
      lineage: Object.freeze(artifact.lineage.map((parent) => Object.freeze({ ...parent }))),
    });

  return {
    registerArtifact(input: RegisterArtifactInput): Artifact | ContentRepositoryError {
      const draft = input.artifact;
      const invalid = validateDraftFields(draft);
      if (invalid !== null) {
        return invalid;
      }
      if (chains.has(draft.id)) {
        return fail('duplicate-artifact', `artifact already exists: ${draft.id}`);
      }
      const parentError = validateParents(input.scope, draft.lineage);
      if (parentError !== null) {
        return parentError;
      }
      const gateError = checkRightsGate(input.scope, draft.rightsRef);
      if (gateError !== null) {
        return gateError;
      }
      const record = freezeRecord({
        id: draft.id,
        version: 1 as Version,
        tenantId: input.scope.tenantId,
        type: draft.type,
        digest: draft.digest,
        storageRef: draft.storageRef,
        provenanceRef: draft.provenanceRef,
        rightsRef: draft.rightsRef,
        lineage: draft.lineage,
        creationMethod: draft.creationMethod,
      });
      const chain = new Map<number, Artifact>();
      chain.set(1, record);
      chains.set(record.id, chain);
      return record;
    },

    registerArtifactVersion(
      input: RegisterArtifactVersionInput,
    ): Artifact | ContentRepositoryError {
      const invalid = validateDraftFields(input);
      if (invalid !== null) {
        return invalid;
      }
      const chain = chains.get(input.id);
      const current = chain === undefined ? undefined : latestIn(chain);
      if (current === undefined) {
        return fail('artifact-not-found', `artifact does not exist: ${input.id}`);
      }
      if (current.tenantId !== input.scope.tenantId) {
        return fail(
          'cross-tenant-reference',
          `artifact ${input.id} does not belong to tenant ${input.scope.tenantId}`,
        );
      }
      const parentError = validateParents(input.scope, input.additionalParents);
      if (parentError !== null) {
        return parentError;
      }
      const gateError = checkRightsGate(input.scope, input.rightsRef);
      if (gateError !== null) {
        return gateError;
      }
      // The new version links its predecessor: version chains are lineage.
      const lineage: ArtifactRef[] = [toRef(current), ...input.additionalParents];
      const record = freezeRecord({
        id: input.id,
        version: (current.version + 1) as Version,
        tenantId: input.scope.tenantId,
        type: input.type,
        digest: input.digest,
        storageRef: input.storageRef,
        provenanceRef: input.provenanceRef,
        rightsRef: input.rightsRef,
        lineage,
        creationMethod: input.creationMethod,
      });
      chain?.set(record.version, record);
      return record;
    },

    getArtifact(scope: TenantScope, id: ArtifactId, version?: number): Artifact | null {
      return resolveInScope(scope, id, version);
    },

    listArtifacts(scope: TenantScope): readonly Artifact[] {
      const latest: Artifact[] = [];
      for (const chain of chains.values()) {
        const newest = latestIn(chain);
        if (newest !== undefined && newest.tenantId === scope.tenantId) {
          latest.push(newest);
        }
      }
      return latest.sort((a, b) => compareStrings(a.id, b.id));
    },

    getAncestors(
      scope: TenantScope,
      id: ArtifactId,
      version?: number,
    ): readonly ArtifactRef[] | ContentRepositoryError {
      const target = resolveInScope(scope, id, version);
      if (target === null) {
        return fail('artifact-not-found', `no artifact ${id} in this tenant scope`);
      }
      const seen = new Set<string>([refKey(target.id, target.version)]);
      const levels: ArtifactRef[][] = [];
      let frontier: Artifact[] = [target];
      while (frontier.length > 0) {
        const level: ArtifactRef[] = [];
        const next: Artifact[] = [];
        for (const artifact of frontier) {
          for (const parentRef of artifact.lineage) {
            const key = refKey(parentRef.artifactId, parentRef.version);
            if (seen.has(key)) {
              continue;
            }
            seen.add(key);
            const parent = chains.get(parentRef.artifactId)?.get(parentRef.version);
            if (parent === undefined) {
              continue; // Unreachable: parents are validated at registration.
            }
            level.push(toRef(parent));
            next.push(parent);
          }
        }
        if (level.length > 0) {
          level.sort(compareRefs);
          levels.push(level);
        }
        frontier = next;
      }
      // Oldest generation first; within a generation, by artifactId/version.
      const result: ArtifactRef[] = [];
      for (let i = levels.length - 1; i >= 0; i--) {
        const level = levels[i];
        if (level !== undefined) {
          result.push(...level);
        }
      }
      return result;
    },

    getDescendants(
      scope: TenantScope,
      id: ArtifactId,
      version?: number,
    ): readonly ArtifactRef[] | ContentRepositoryError {
      const target = resolveInScope(scope, id, version);
      if (target === null) {
        return fail('artifact-not-found', `no artifact ${id} in this tenant scope`);
      }
      const seen = new Set<string>([refKey(target.id, target.version)]);
      const result: ArtifactRef[] = [];
      let frontier = new Set<string>([refKey(target.id, target.version)]);
      while (frontier.size > 0) {
        const level: ArtifactRef[] = [];
        const next = new Set<string>();
        for (const chain of chains.values()) {
          for (const record of chain.values()) {
            const key = refKey(record.id, record.version);
            if (seen.has(key) || record.tenantId !== scope.tenantId) {
              continue;
            }
            const childOfFrontier = record.lineage.some((parent) =>
              frontier.has(refKey(parent.artifactId, parent.version)),
            );
            if (childOfFrontier) {
              seen.add(key);
              level.push(toRef(record));
              next.add(key);
            }
          }
        }
        level.sort(compareRefs);
        result.push(...level);
        frontier = next;
      }
      return result;
    },
  };
}

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const compareRefs = (a: ArtifactRef, b: ArtifactRef): number =>
  a.artifactId === b.artifactId
    ? compareStrings(String(a.version), String(b.version))
    : compareStrings(a.artifactId, b.artifactId);
