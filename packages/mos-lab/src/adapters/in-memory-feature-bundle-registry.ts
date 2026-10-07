import type { TenantScope, Timestamp, Version } from '@mos/contracts';
import type { CorpusStore } from '../contracts/corpus.js';
import type { ReferenceDocumentId } from '../contracts/corpus.js';
import type {
  AttachFeatureBundleInput,
  FeatureBundle,
  FeatureBundleError,
  FeatureBundleErrorCode,
  FeatureBundleRegistry,
  FeatureDescriptor,
  FeatureBundleId,
  UpdateFeatureBundleInput,
} from '../contracts/feature-bundle.js';

/**
 * Options for {@link createInMemoryFeatureBundleRegistry}.
 *
 * `corpus` is the narrow structural view of the corpus store used to validate
 * that bundles attach to documents that actually exist in the tenant scope.
 * `now` is injectable for deterministic timestamps.
 */
export interface InMemoryFeatureBundleRegistryOptions {
  readonly corpus: Pick<CorpusStore, 'getReferenceDocument'>;
  readonly now?: () => Timestamp;
}

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

/**
 * Build an in-memory {@link FeatureBundleRegistry}.
 *
 * W2-A GROUNDWORK DISCLOSURE: ephemeral, process-local scaffold (no durable
 * persistence — TL-owned). Version chains are append-only: attach creates
 * version 1, update appends version + 1, detach appends a final version
 * carrying `detachedAt`; prior versions always stay retrievable through
 * `getFeatureBundle(scope, id, version)`.
 */
export function createInMemoryFeatureBundleRegistry(
  options: InMemoryFeatureBundleRegistryOptions,
): FeatureBundleRegistry {
  const now = options.now ?? nowDefault;
  const corpus = options.corpus;

  /** Feature bundle version chains: bundle id → versions, oldest first. */
  const chains = new Map<FeatureBundleId, FeatureBundle[]>();

  const fail = (
    error: FeatureBundleErrorCode,
    message: string,
  ): FeatureBundleError => ({ error, message });

  const isBlank = (value: string): boolean => value.trim().length === 0;

  const latestOf = (id: FeatureBundleId): FeatureBundle | undefined => {
    const chain = chains.get(id);
    return chain === undefined || chain.length === 0 ? undefined : chain[chain.length - 1];
  };

  const validateFeatures = (
    scope: TenantScope,
    features: readonly FeatureDescriptor[],
  ): FeatureBundleError | null => {
    if (features.length === 0) {
      return fail('invalid-input', 'feature bundle must carry at least one feature descriptor');
    }
    for (const feature of features) {
      if (isBlank(feature.artifact.storageRef) || isBlank(feature.artifact.digest)) {
        return fail(
          'invalid-input',
          `feature ${feature.kind} artifact must carry a non-blank storageRef and digest`,
        );
      }
      if (feature.artifact.tenantId !== scope.tenantId) {
        return fail(
          'cross-tenant-reference',
          `feature ${feature.kind} artifact ${feature.artifact.artifactId} belongs to tenant ${feature.artifact.tenantId}, not ${scope.tenantId}`,
        );
      }
    }
    return null;
  };

  const freezeBundle = (bundle: FeatureBundle): FeatureBundle =>
    Object.freeze({
      ...bundle,
      features: Object.freeze(
        bundle.features.map((feature) =>
          Object.freeze({
            ...feature,
            metadata: Object.freeze({ ...feature.metadata }),
            artifact: Object.freeze({ ...feature.artifact }),
          }),
        ),
      ),
    });

  return {
    async attachFeatureBundle(
      input: AttachFeatureBundleInput,
    ): Promise<FeatureBundle | FeatureBundleError> {
      if (isBlank(input.id)) {
        return fail('invalid-input', 'feature bundle id must not be blank');
      }
      if (isBlank(input.provenanceRef)) {
        return fail('invalid-input', 'feature bundle provenanceRef must not be blank');
      }
      if (chains.has(input.id)) {
        return fail('duplicate-bundle', `feature bundle already exists: ${input.id}`);
      }
      const document = await corpus.getReferenceDocument(input.scope, input.documentId);
      if (document === null) {
        return fail(
          'document-not-found',
          `corpus document does not exist in this tenant scope: ${input.documentId}`,
        );
      }
      const featuresError = validateFeatures(input.scope, input.features);
      if (featuresError !== null) {
        return featuresError;
      }
      const bundle = freezeBundle({
        id: input.id,
        version: 1 as Version,
        tenantId: input.scope.tenantId,
        documentId: input.documentId,
        features: input.features,
        provenanceRef: input.provenanceRef,
        createdAt: now(),
        detachedAt: null,
      });
      chains.set(bundle.id, [bundle]);
      return bundle;
    },

    async getFeatureBundle(
      scope: TenantScope,
      id: FeatureBundleId,
      version?: number,
    ): Promise<FeatureBundle | null> {
      const chain = chains.get(id);
      if (chain === undefined) {
        return null;
      }
      const record =
        version === undefined
          ? chain[chain.length - 1]
          : chain.find((entry) => entry.version === version);
      if (record === undefined || record.tenantId !== scope.tenantId) {
        return null;
      }
      return record;
    },

    async updateFeatureBundle(
      input: UpdateFeatureBundleInput,
    ): Promise<FeatureBundle | FeatureBundleError> {
      const current = latestOf(input.id);
      if (current === undefined) {
        return fail('bundle-not-found', `feature bundle does not exist: ${input.id}`);
      }
      if (current.tenantId !== input.scope.tenantId) {
        return fail(
          'cross-tenant-reference',
          `feature bundle ${input.id} does not belong to tenant ${input.scope.tenantId}`,
        );
      }
      if (current.detachedAt !== null) {
        return fail(
          'bundle-detached',
          `feature bundle ${input.id} was detached at ${current.detachedAt} and is immutable`,
        );
      }
      if (isBlank(input.provenanceRef)) {
        return fail('invalid-input', 'feature bundle provenanceRef must not be blank');
      }
      const featuresError = validateFeatures(input.scope, input.features);
      if (featuresError !== null) {
        return featuresError;
      }
      const bundle = freezeBundle({
        id: input.id,
        version: (current.version + 1) as Version,
        tenantId: input.scope.tenantId,
        documentId: current.documentId,
        features: input.features,
        provenanceRef: input.provenanceRef,
        createdAt: now(),
        detachedAt: null,
      });
      chains.get(input.id)?.push(bundle);
      return bundle;
    },

    async detachFeatureBundle(
      scope: TenantScope,
      id: FeatureBundleId,
    ): Promise<FeatureBundle | FeatureBundleError> {
      const current = latestOf(id);
      if (current === undefined) {
        return fail('bundle-not-found', `feature bundle does not exist: ${id}`);
      }
      if (current.tenantId !== scope.tenantId) {
        return fail(
          'cross-tenant-reference',
          `feature bundle ${id} does not belong to tenant ${scope.tenantId}`,
        );
      }
      if (current.detachedAt !== null) {
        return fail('bundle-detached', `feature bundle ${id} is already detached`);
      }
      // Append-only detachment: a final version records the detach; the
      // bundle and its history stay auditable.
      const detached = freezeBundle({
        ...current,
        version: (current.version + 1) as Version,
        createdAt: now(),
        detachedAt: now(),
      });
      chains.get(id)?.push(detached);
      return detached;
    },

    async listFeatureBundles(
      scope: TenantScope,
      documentId?: ReferenceDocumentId,
    ): Promise<readonly FeatureBundle[]> {
      const results: FeatureBundle[] = [];
      for (const chain of chains.values()) {
        const latest = chain[chain.length - 1];
        if (
          latest !== undefined &&
          latest.tenantId === scope.tenantId &&
          latest.detachedAt === null &&
          (documentId === undefined || latest.documentId === documentId)
        ) {
          results.push(latest);
        }
      }
      return results.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    },
  };
}
