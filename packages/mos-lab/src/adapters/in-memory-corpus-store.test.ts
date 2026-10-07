import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryCorpusStore } from './in-memory-corpus-store.js';
import type {
  CorpusStore,
  ReferenceDocument,
  ReferenceDocumentDraft,
  RightsCheckPort,
  RightsCheckVerdict,
} from '../contracts/corpus.js';
import type {
  ArtifactRef,
  ProvenanceRef,
  RightsRef,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from '@mos/contracts';

const tenantId = (value: string): TenantId => value as TenantId;
const rightsRef = (value: string): RightsRef => value as RightsRef;
const provenanceRef = (value: string): ProvenanceRef => value as ProvenanceRef;
const timestamp = (value: string): Timestamp => value as Timestamp;
const documentId = (value: string) => value as import('../contracts/corpus.js').ReferenceDocumentId;
const corpusId = (value: string) => value as import('../contracts/corpus.js').CorpusId;

const scopeOf = (tenant: string): TenantScope => ({ tenantId: tenantId(tenant) });

const artifactRef = (id: string, tenant = 'tenant-a'): ArtifactRef => ({
  artifactId: `art-${id}` as ArtifactRef['artifactId'],
  version: 1 as Version,
  tenantId: tenantId(tenant),
  digest: `sha256:${(id + 'f'.repeat(60)).slice(0, 64).padEnd(64, '0')}` as ArtifactRef['digest'],
  type: 'video/mp4',
  storageRef: `mem://${tenant}/art-${id}` as ArtifactRef['storageRef'],
  rightsRef: rightsRef('grant-1'),
  provenanceRef: provenanceRef(`prov-${id}`),
});

/**
 * DISCLOSED STRUCTURAL TEST DOUBLE for the injected acquisition rights gate:
 * implements the lab-owned `RightsCheckPort` exactly like a composition-root
 * adapter over `@mos/rights`' `RightsRepository.getRights` would (existence,
 * tenant match, revocation, expiry). `@mos/rights` is NOT among the lab
 * module's registry dependencies, so the lab declares this structural port
 * and tests it with this double.
 */
const rightsWith = (
  ...grants: ReadonlyArray<{
    ref: string;
    tenant?: string;
    revokedAt?: string;
    expiresAt?: string;
  }>
): RightsCheckPort => ({
  checkAcquisitionRights: async (input): Promise<RightsCheckVerdict> => {
    const grant = grants.find((entry) => entry.ref === input.rightsRef);
    if (grant === undefined) {
      return { ok: false, reason: 'grant-not-found' };
    }
    if (grant.tenant !== undefined && grant.tenant !== input.scope.tenantId) {
      return { ok: false, reason: 'grant-tenant-mismatch' };
    }
    if (grant.revokedAt !== undefined) {
      return { ok: false, reason: 'grant-revoked' };
    }
    if (grant.expiresAt !== undefined && grant.expiresAt <= '2026-06-15T00:00:00.000Z') {
      return { ok: false, reason: 'grant-expired' };
    }
    return { ok: true };
  },
});

const storeWith = (rights: RightsCheckPort) =>
  createInMemoryCorpusStore({ rights, now: () => timestamp('2026-06-15T00:00:00.000Z') });

const draft = (overrides: Partial<ReferenceDocumentDraft> = {}): ReferenceDocumentDraft => ({
  id: documentId('refdoc-1'),
  niche: 'sourdough-baking',
  platform: 'short-video',
  modality: 'video',
  artifact: artifactRef('1'),
  sourceRefs: ['src://platform/post/123'],
  acquiredAt: timestamp('2026-06-01T00:00:00.000Z'),
  rightsRef: rightsRef('grant-1'),
  provenanceRef: provenanceRef('prov-1'),
  ...overrides,
});

const ingest = async (
  store: CorpusStore,
  input: Parameters<CorpusStore['ingestReferenceDocument']>[0],
): Promise<ReferenceDocument> => {
  const result = await store.ingestReferenceDocument(input);
  if ('error' in result) {
    assert.fail(`unexpected corpus error: ${result.error} — ${result.message}`);
  }
  return result;
};

test('ingestion with an explicit active grant creates a frozen version-1 document', async () => {
  const store = storeWith(rightsWith({ ref: 'grant-1', tenant: 'tenant-a' }));
  const record = await ingest(store, {
    scope: scopeOf('tenant-a'),
    document: draft(),
  });
  assert.equal(record.version, 1);
  assert.equal(record.tenantId, tenantId('tenant-a'));
  assert.equal(record.niche, 'sourdough-baking');
  assert.equal(record.artifact.artifactId, 'art-1');
  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.sourceRefs));

  const fetched = await store.getReferenceDocument(scopeOf('tenant-a'), documentId('refdoc-1'));
  assert.deepEqual(fetched, record);
  // Cross-tenant read never leaks existence.
  assert.equal(
    await store.getReferenceDocument(scopeOf('tenant-b'), documentId('refdoc-1')),
    null,
  );
});

test('CRITICAL: ingestion is denied with no-explicit-grant when the rightsRef resolves to nothing', async () => {
  const store = storeWith(rightsWith({ ref: 'grant-other' }));
  // The artifact storageRef is a perfectly public, reachable-looking URL —
  // and the gate still denies: URL accessibility NEVER implies rights.
  const denied = await store.ingestReferenceDocument({
    scope: scopeOf('tenant-a'),
    document: draft(),
  });
  assert.ok('error' in denied && denied.error === 'no-explicit-grant');
});

test('ingestion denial reasons map to typed corpus failures (revoked / expired / tenant mismatch)', async () => {
  const store = storeWith(
    rightsWith(
      { ref: 'grant-revoked', tenant: 'tenant-a', revokedAt: '2026-06-10T00:00:00.000Z' },
      { ref: 'grant-expired', tenant: 'tenant-a', expiresAt: '2026-06-01T00:00:00.000Z' },
      { ref: 'grant-foreign', tenant: 'tenant-b' },
    ),
  );
  const revoked = await store.ingestReferenceDocument({
    scope: scopeOf('tenant-a'),
    document: draft({ id: documentId('doc-revoked'), rightsRef: rightsRef('grant-revoked') }),
  });
  assert.ok('error' in revoked && revoked.error === 'rights-grant-revoked');

  const expired = await store.ingestReferenceDocument({
    scope: scopeOf('tenant-a'),
    document: draft({ id: documentId('doc-expired'), rightsRef: rightsRef('grant-expired') }),
  });
  assert.ok('error' in expired && expired.error === 'rights-grant-expired');

  const foreign = await store.ingestReferenceDocument({
    scope: scopeOf('tenant-a'),
    document: draft({ id: documentId('doc-foreign'), rightsRef: rightsRef('grant-foreign') }),
  });
  assert.ok('error' in foreign && foreign.error === 'rights-grant-tenant-mismatch');
});

test('ingestion rejects cross-tenant artifact references', async () => {
  const store = storeWith(rightsWith({ ref: 'grant-1', tenant: 'tenant-a' }));
  const denied = await store.ingestReferenceDocument({
    scope: scopeOf('tenant-a'),
    document: draft({ artifact: artifactRef('foreign', 'tenant-b') }),
  });
  assert.ok('error' in denied && denied.error === 'cross-tenant-reference');
});

test('ingestion rejects duplicate document ids and invalid drafts', async () => {
  const store = storeWith(rightsWith({ ref: 'grant-1', tenant: 'tenant-a' }));
  await ingest(store, { scope: scopeOf('tenant-a'), document: draft() });
  const duplicate = await store.ingestReferenceDocument({
    scope: scopeOf('tenant-a'),
    document: draft(),
  });
  assert.ok('error' in duplicate && duplicate.error === 'duplicate-document');

  const blankNiche = await store.ingestReferenceDocument({
    scope: scopeOf('tenant-a'),
    document: draft({ id: documentId('doc-2'), niche: '  ' }),
  });
  assert.ok('error' in blankNiche && blankNiche.error === 'invalid-input');

  const noSources = await store.ingestReferenceDocument({
    scope: scopeOf('tenant-a'),
    document: draft({ id: documentId('doc-3'), sourceRefs: [] }),
  });
  assert.ok('error' in noSources && noSources.error === 'invalid-input');
});

test('corpus snapshots are append-only versions; prior versions stay immutable and retrievable', async () => {
  const store = storeWith(rightsWith({ ref: 'grant-1', tenant: 'tenant-a' }));
  const doc1 = await ingest(store, {
    scope: scopeOf('tenant-a'),
    document: draft(),
  });
  const doc2 = await ingest(store, {
    scope: scopeOf('tenant-a'),
    document: draft({ id: documentId('refdoc-2'), artifact: artifactRef('2') }),
  });

  const v1 = await store.snapshotCorpusVersion({
    scope: scopeOf('tenant-a'),
    corpusId: corpusId('corpus-sourdough'),
    documentRefs: [doc1.id],
    notes: 'initial snapshot',
  });
  assert.ok(!('error' in v1));
  assert.equal(v1.version, 1);
  assert.deepEqual(v1.documentRefs, [documentId('refdoc-1')]);
  assert.ok(Object.isFrozen(v1));
  assert.ok(Object.isFrozen(v1.documentRefs));

  const v2 = await store.snapshotCorpusVersion({
    scope: scopeOf('tenant-a'),
    corpusId: corpusId('corpus-sourdough'),
    documentRefs: [doc1.id, doc2.id],
    notes: null,
  });
  assert.ok(!('error' in v2));
  assert.equal(v2.version, 2);

  // Append-only history: v1 is unchanged and still retrievable.
  const fetchedV1 = await store.getCorpusVersion(
    scopeOf('tenant-a'),
    corpusId('corpus-sourdough'),
    1,
  );
  assert.deepEqual(fetchedV1, v1);
  assert.equal(fetchedV1?.notes, 'initial snapshot');
  const history = await store.listCorpusVersions(
    scopeOf('tenant-a'),
    corpusId('corpus-sourdough'),
  );
  assert.deepEqual(
    history.map((snapshot) => snapshot.version),
    [1, 2],
  );
  // Unknown and foreign corpora never leak existence.
  assert.deepEqual(
    await store.listCorpusVersions(scopeOf('tenant-b'), corpusId('corpus-sourdough')),
    [],
  );
});

test('snapshots reject unknown documents, foreign-tenant documents and duplicate membership', async () => {
  const store = storeWith(
    rightsWith({ ref: 'grant-1', tenant: 'tenant-a' }, { ref: 'grant-b', tenant: 'tenant-b' }),
  );
  const doc1 = await ingest(store, { scope: scopeOf('tenant-a'), document: draft() });

  const unknown = await store.snapshotCorpusVersion({
    scope: scopeOf('tenant-a'),
    corpusId: corpusId('corpus-x'),
    documentRefs: [documentId('refdoc-ghost')],
  });
  assert.ok('error' in unknown && unknown.error === 'document-not-found');

  // Ingest into tenant B, then try to snapshot it into tenant A's corpus.
  await ingest(store, {
    scope: scopeOf('tenant-b'),
    document: draft({
      id: documentId('refdoc-b1'),
      artifact: artifactRef('b1', 'tenant-b'),
      rightsRef: rightsRef('grant-b'),
    }),
  });
  const foreign = await store.snapshotCorpusVersion({
    scope: scopeOf('tenant-a'),
    corpusId: corpusId('corpus-x'),
    documentRefs: [documentId('refdoc-b1')],
  });
  assert.ok('error' in foreign && foreign.error === 'cross-tenant-reference');

  const duplicate = await store.snapshotCorpusVersion({
    scope: scopeOf('tenant-a'),
    corpusId: corpusId('corpus-x'),
    documentRefs: [doc1.id, doc1.id],
  });
  assert.ok('error' in duplicate && duplicate.error === 'invalid-input');
});

test('queries filter by niche, platform, modality and acquisition time window', async () => {
  const store = storeWith(
    rightsWith({ ref: 'grant-1', tenant: 'tenant-a' }, { ref: 'grant-b', tenant: 'tenant-b' }),
  );
  await ingest(store, {
    scope: scopeOf('tenant-a'),
    document: draft({
      id: documentId('a-video-early'),
      acquiredAt: timestamp('2026-05-01T00:00:00.000Z'),
    }),
  });
  await ingest(store, {
    scope: scopeOf('tenant-a'),
    document: draft({
      id: documentId('a-video-late'),
      acquiredAt: timestamp('2026-06-05T00:00:00.000Z'),
    }),
  });
  await ingest(store, {
    scope: scopeOf('tenant-a'),
    document: draft({
      id: documentId('a-text'),
      modality: 'text',
      platform: 'forum',
      acquiredAt: timestamp('2026-06-05T00:00:00.000Z'),
    }),
  });
  await ingest(store, {
    scope: scopeOf('tenant-b'),
    document: draft({
      id: documentId('b-video'),
      artifact: artifactRef('b9', 'tenant-b'),
      rightsRef: rightsRef('grant-b'),
      acquiredAt: timestamp('2026-06-05T00:00:00.000Z'),
    }),
  });

  const all = await store.queryReferenceDocuments(scopeOf('tenant-a'), {});
  assert.deepEqual(
    all.map((document) => document.id),
    ['a-text', 'a-video-early', 'a-video-late'],
  );

  const videoOnly = await store.queryReferenceDocuments(scopeOf('tenant-a'), {
    modality: 'video',
  });
  assert.deepEqual(
    videoOnly.map((document) => document.id),
    ['a-video-early', 'a-video-late'],
  );

  const forumOnly = await store.queryReferenceDocuments(scopeOf('tenant-a'), {
    platform: 'forum',
  });
  assert.deepEqual(
    forumOnly.map((document) => document.id),
    ['a-text'],
  );

  const nicheOnly = await store.queryReferenceDocuments(scopeOf('tenant-a'), {
    niche: 'nope',
  });
  assert.deepEqual(nicheOnly, []);

  const window = await store.queryReferenceDocuments(scopeOf('tenant-a'), {
    acquiredFrom: timestamp('2026-05-15T00:00:00.000Z'),
    acquiredTo: timestamp('2026-06-07T00:00:00.000Z'),
  });
  assert.deepEqual(
    window.map((document) => document.id),
    ['a-text', 'a-video-late'],
  );

  const combined = await store.queryReferenceDocuments(scopeOf('tenant-a'), {
    modality: 'video',
    acquiredFrom: timestamp('2026-05-15T00:00:00.000Z'),
  });
  assert.deepEqual(
    combined.map((document) => document.id),
    ['a-video-late'],
  );

  // Tenant B sees ONLY its own document regardless of filters.
  const tenantB = await store.queryReferenceDocuments(scopeOf('tenant-b'), {
    modality: 'video',
  });
  assert.deepEqual(
    tenantB.map((document) => document.id),
    ['b-video'],
  );
});
