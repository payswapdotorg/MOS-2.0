import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  CorpusVersion,
  ReferenceDocument,
} from './corpus.js';
import type { ContentDigest, ProvenanceRef, RightsRef, TenantId } from '@mos/content';

const tenantId = (value: string): TenantId => value as TenantId;
const rightsRef = (value: string): RightsRef => value as RightsRef;
const provenanceRef = (value: string): ProvenanceRef => value as ProvenanceRef;
const contentDigest = (value: string): ContentDigest => value as ContentDigest;
const documentId = (value: string) => value as import('./corpus.js').ReferenceDocumentId;
const corpusId = (value: string) => value as import('./corpus.js').CorpusId;

test('ReferenceDocument is constructible with EXACTLY the LAB-001 contract fields', () => {
  // Compiling this literal at all is the type-level invariant: every required
  // field present, correctly typed; excess properties would fail.
  const document: ReferenceDocument = {
    id: documentId('refdoc-1'),
    version: 1,
    tenantId: tenantId('tenant-a'),
    sourceRefs: ['src://platform/post/123', 'src://platform/post/124'],
    acquiredAt: '2026-06-01T00:00:00.000Z',
    rightsRef: rightsRef('grant-1'),
    provenanceRef: provenanceRef('prov-1'),
    contentDigest: contentDigest(`sha256:${'ab'.repeat(32)}`),
    modality: 'video',
  };

  assert.deepEqual(Object.keys(document).sort(), [
    'acquiredAt',
    'contentDigest',
    'id',
    'modality',
    'provenanceRef',
    'rightsRef',
    'sourceRefs',
    'tenantId',
    'version',
  ]);
  assert.equal(document.modality, 'video');
  assert.equal(document.rightsRef, rightsRef('grant-1'));
});

test('every modality in the vocabulary is assignable', () => {
  const modalities: ReferenceDocument['modality'][] = [
    'text',
    'image',
    'audio',
    'video',
    'structured',
    'mixed',
  ];
  assert.equal(modalities.length, 6);
});

test('CorpusVersion is constructible with EXACTLY the snapshot fields', () => {
  const snapshot: CorpusVersion = {
    corpusId: corpusId('corpus-niche-77'),
    version: 3,
    tenantId: tenantId('tenant-a'),
    documentRefs: [documentId('refdoc-1'), documentId('refdoc-2')],
    createdAt: '2026-06-02T00:00:00.000Z',
    notes: 'Q2 niche corpus snapshot',
  };

  assert.deepEqual(Object.keys(snapshot).sort(), [
    'corpusId',
    'createdAt',
    'documentRefs',
    'notes',
    'tenantId',
    'version',
  ]);
  assert.equal(snapshot.version, 3);
  assert.deepEqual(snapshot.documentRefs, [documentId('refdoc-1'), documentId('refdoc-2')]);
});

test('the scaffold is types-only: the compiled package exports no runtime API', async () => {
  const moduleExports = await import('../index.js');
  assert.deepEqual(Object.keys(moduleExports), []);
});
