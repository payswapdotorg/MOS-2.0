import type {
  TenantScope,
  Timestamp,
  Version,
} from '@mos/contracts';
import type {
  CorpusError,
  CorpusErrorCode,
  CorpusId,
  CorpusQuery,
  CorpusStore,
  CorpusVersion,
  IngestReferenceDocumentInput,
  ReferenceDocument,
  ReferenceDocumentDraft,
  ReferenceDocumentId,
  RightsCheckPort,
  RightsCheckDenialReason,
  SnapshotCorpusVersionInput,
} from '../contracts/corpus.js';

/**
 * Options for {@link createInMemoryCorpusStore}.
 *
 * `rights` is the injected acquisition rights gate ({@link RightsCheckPort}):
 * every document ingestion passes through it. A real adapter over
 * `@mos/rights`' `RightsRepository.getRights` satisfies the shape at the
 * composition root. `now` is injectable for deterministic snapshot
 * timestamps; it defaults to real wall-clock ISO-8601 strings.
 */
export interface InMemoryCorpusStoreOptions {
  readonly rights: RightsCheckPort;
  readonly now?: () => Timestamp;
}

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

/**
 * Build an in-memory {@link CorpusStore}.
 *
 * W2-A GROUNDWORK DISCLOSURE: this adapter is an ephemeral, process-local
 * scaffold used to pin the LAB-001 domain model and port contract. It is NOT
 * production persistence: no database, no migrations, no durability. The
 * central schema/migration story is owned by the Tech Lead; a durable
 * adapter replaces this one in a later wave without touching the port.
 *
 * Invariants enforced here:
 * - REFERENCE-FIRST: documents only ever store the artifact reference — no
 *   content bytes exist anywhere in this store.
 * - RIGHTS GATE: ingestion fails closed without an explicit, active,
 *   tenant-matching grant (mapped from the injected verdict).
 * - APPEND-ONLY VERSIONS: corpus snapshots are immutable and versioned; the
 *   version list per (tenant, corpus) only ever grows.
 * - TENANT ISOLATION: reads and queries filter by the explicit scope;
 *   unknown and cross-tenant are indistinguishable (no existence leak).
 */
export function createInMemoryCorpusStore(
  options: InMemoryCorpusStoreOptions,
): CorpusStore {
  const now = options.now ?? nowDefault;
  const rights = options.rights;

  /** Reference documents by id (global id namespace; records carry tenantId). */
  const documents = new Map<ReferenceDocumentId, ReferenceDocument>();

  /** Corpus version chains: `${tenantId}\u0000${corpusId}` → snapshots, oldest first. */
  const versions = new Map<string, CorpusVersion[]>();

  const fail = (error: CorpusErrorCode, message: string): CorpusError => ({
    error,
    message,
  });

  const isBlank = (value: string): boolean => value.trim().length === 0;

  /** Map an injected rights verdict to the typed corpus failure (fail closed). */
  const rightsFailure = (
    reason: RightsCheckDenialReason | undefined,
    rightsRef: string,
  ): CorpusError => {
    switch (reason) {
      case 'grant-revoked':
        return fail('rights-grant-revoked', `rights grant ${rightsRef} was revoked`);
      case 'grant-expired':
        return fail('rights-grant-expired', `rights grant ${rightsRef} expired`);
      case 'grant-tenant-mismatch':
        return fail(
          'rights-grant-tenant-mismatch',
          `rights grant ${rightsRef} does not belong to the requested tenant scope`,
        );
      default:
        return fail(
          'no-explicit-grant',
          `rightsRef does not resolve to an explicit active rights grant: ${rightsRef}` +
            ' (object-store/URL accessibility never implies rights)',
        );
    }
  };

  const validateDraft = (draft: ReferenceDocumentDraft): CorpusError | null => {
    if (isBlank(draft.niche)) {
      return fail('invalid-input', 'document niche must not be blank');
    }
    if (isBlank(draft.platform)) {
      return fail('invalid-input', 'document platform must not be blank');
    }
    if (draft.sourceRefs.length === 0 || draft.sourceRefs.some(isBlank)) {
      return fail(
        'invalid-input',
        'document sourceRefs must contain at least one non-blank source reference',
      );
    }
    if (isBlank(draft.acquiredAt)) {
      return fail('invalid-input', 'document acquiredAt must not be blank');
    }
    if (isBlank(draft.rightsRef)) {
      return fail('invalid-input', 'document rightsRef must not be blank');
    }
    if (isBlank(draft.provenanceRef)) {
      return fail('invalid-input', 'document provenanceRef must not be blank');
    }
    if (isBlank(draft.artifact.storageRef)) {
      return fail('invalid-input', 'document artifact storageRef must not be blank');
    }
    if (isBlank(draft.artifact.digest)) {
      return fail('invalid-input', 'document artifact digest must not be blank');
    }
    return null;
  };

  const freezeDocument = (document: ReferenceDocument): ReferenceDocument =>
    Object.freeze({
      ...document,
      sourceRefs: Object.freeze([...document.sourceRefs]),
      artifact: Object.freeze({ ...document.artifact }),
    });

  const matchesQuery = (document: ReferenceDocument, query: CorpusQuery): boolean => {
    if (query.niche !== undefined && document.niche !== query.niche) {
      return false;
    }
    if (query.platform !== undefined && document.platform !== query.platform) {
      return false;
    }
    if (query.modality !== undefined && document.modality !== query.modality) {
      return false;
    }
    if (query.acquiredFrom !== undefined && document.acquiredAt < query.acquiredFrom) {
      return false;
    }
    if (query.acquiredTo !== undefined && document.acquiredAt > query.acquiredTo) {
      return false;
    }
    return true;
  };

  const versionKey = (scope: TenantScope, corpusId: string): string =>
    `${scope.tenantId}\u0000${corpusId}`;

  const resolveDocumentInScope = (
    scope: TenantScope,
    id: ReferenceDocumentId,
  ): ReferenceDocument | null => {
    const document = documents.get(id);
    if (document === undefined || document.tenantId !== scope.tenantId) {
      // Unknown and cross-tenant are indistinguishable on reads: no leak.
      return null;
    }
    return document;
  };

  return {
    async ingestReferenceDocument(
      input: IngestReferenceDocumentInput,
    ): Promise<ReferenceDocument | CorpusError> {
      const draft = input.document;
      const invalid = validateDraft(draft);
      if (invalid !== null) {
        return invalid;
      }
      if (documents.has(draft.id)) {
        return fail('duplicate-document', `reference document already exists: ${draft.id}`);
      }
      if (draft.artifact.tenantId !== input.scope.tenantId) {
        return fail(
          'cross-tenant-reference',
          `artifact ${draft.artifact.artifactId} belongs to tenant ${draft.artifact.tenantId}, not ${input.scope.tenantId}`,
        );
      }
      // THE RIGHTS GATE (LAB-001 acceptance): acquisition requires an
      // explicit, active, tenant-matching grant — checked through the
      // injected port, never inferred from storageRef/URL accessibility.
      const verdict = await rights.checkAcquisitionRights({
        scope: input.scope,
        rightsRef: draft.rightsRef,
      });
      if (!verdict.ok) {
        return rightsFailure(verdict.reason, draft.rightsRef);
      }
      const record = freezeDocument({
        id: draft.id,
        version: 1 as Version,
        tenantId: input.scope.tenantId,
        niche: draft.niche,
        platform: draft.platform,
        modality: draft.modality,
        artifact: draft.artifact,
        sourceRefs: draft.sourceRefs,
        acquiredAt: draft.acquiredAt,
        rightsRef: draft.rightsRef,
        provenanceRef: draft.provenanceRef,
      });
      documents.set(record.id, record);
      return record;
    },

    async getReferenceDocument(
      scope: TenantScope,
      id: ReferenceDocumentId,
    ): Promise<ReferenceDocument | null> {
      return resolveDocumentInScope(scope, id);
    },

    async queryReferenceDocuments(
      scope: TenantScope,
      query: CorpusQuery,
    ): Promise<readonly ReferenceDocument[]> {
      const results: ReferenceDocument[] = [];
      for (const document of documents.values()) {
        if (document.tenantId === scope.tenantId && matchesQuery(document, query)) {
          results.push(document);
        }
      }
      return results.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    },

    async snapshotCorpusVersion(
      input: SnapshotCorpusVersionInput,
    ): Promise<CorpusVersion | CorpusError> {
      const seen = new Set<string>();
      for (const id of input.documentRefs) {
        if (seen.has(id)) {
          return fail(
            'invalid-input',
            `corpus snapshot lists document ${id} more than once (membership must be a set)`,
          );
        }
        seen.add(id);
      }
      for (const id of input.documentRefs) {
        const document = documents.get(id);
        if (document === undefined) {
          return fail('document-not-found', `reference document does not exist: ${id}`);
        }
        if (document.tenantId !== input.scope.tenantId) {
          return fail(
            'cross-tenant-reference',
            `reference document ${id} does not belong to tenant ${input.scope.tenantId}`,
          );
        }
      }
      const key = versionKey(input.scope, input.corpusId);
      const chain = versions.get(key) ?? [];
      const previous = chain.length === 0 ? undefined : chain[chain.length - 1];
      const snapshot: CorpusVersion = Object.freeze({
        corpusId: input.corpusId,
        version: ((previous?.version ?? 0) + 1) as Version,
        tenantId: input.scope.tenantId,
        documentRefs: Object.freeze([...input.documentRefs]),
        createdAt: now(),
        notes: input.notes ?? null,
      });
      chain.push(snapshot);
      versions.set(key, chain);
      return snapshot;
    },

    async getCorpusVersion(
      scope: TenantScope,
      corpusId: CorpusId,
      version: number,
    ): Promise<CorpusVersion | null> {
      const chain = versions.get(versionKey(scope, corpusId));
      const snapshot = chain?.find((entry) => entry.version === version);
      return snapshot === undefined || snapshot.tenantId !== scope.tenantId ? null : snapshot;
    },

    async listCorpusVersions(
      scope: TenantScope,
      corpusId: CorpusId,
    ): Promise<readonly CorpusVersion[]> {
      const chain = versions.get(versionKey(scope, corpusId));
      return chain === undefined ? [] : [...chain];
    },
  };
}
