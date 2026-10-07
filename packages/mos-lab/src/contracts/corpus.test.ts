import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  CorpusQuery,
  CorpusStore,
  CorpusVersion,
  ReferenceDocument,
  ReferenceDocumentDraft,
  RightsCheckPort,
} from './corpus.js';
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
const documentId = (value: string) => value as import('./corpus.js').ReferenceDocumentId;
const corpusId = (value: string) => value as import('./corpus.js').CorpusId;

const artifactRef = (overrides: {
  artifactId: string;
  tenant?: string;
}): ArtifactRef => ({
  artifactId: `art-${overrides.artifactId}` as ArtifactRef['artifactId'],
  version: 1 as Version,
  tenantId: tenantId(overrides.tenant ?? 'tenant-a'),
  digest: `sha256:${'ab'.repeat(32)}` as ArtifactRef['digest'],
  type: 'video/mp4',
  storageRef: `mem://tenant-a/art-${overrides.artifactId}` as ArtifactRef['storageRef'],
  rightsRef: rightsRef('grant-1'),
  provenanceRef: provenanceRef('prov-1'),
});

const draft = (overrides: Partial<ReferenceDocumentDraft> = {}): ReferenceDocumentDraft => ({
  id: documentId('refdoc-1'),
  niche: 'sourdough-baking',
  platform: 'short-video',
  modality: 'video',
  artifact: artifactRef({ artifactId: '1' }),
  sourceRefs: ['src://platform/post/123', 'src://platform/post/124'],
  acquiredAt: timestamp('2026-06-01T00:00:00.000Z'),
  rightsRef: rightsRef('grant-1'),
  provenanceRef: provenanceRef('prov-1'),
  ...overrides,
});

test('ReferenceDocument is constructible with EXACTLY the LAB-001 contract fields', () => {
  // Compiling this literal at all is the type-level invariant: every required
  // field present, correctly typed; excess properties would fail.
  const document: ReferenceDocument = {
    id: documentId('refdoc-1'),
    version: 1 as Version,
    tenantId: tenantId('tenant-a'),
    niche: 'sourdough-baking',
    platform: 'short-video',
    modality: 'video',
    artifact: artifactRef({ artifactId: '1' }),
    sourceRefs: ['src://platform/post/123', 'src://platform/post/124'],
    acquiredAt: timestamp('2026-06-01T00:00:00.000Z'),
    rightsRef: rightsRef('grant-1'),
    provenanceRef: provenanceRef('prov-1'),
  };

  assert.deepEqual(Object.keys(document).sort(), [
    'acquiredAt',
    'artifact',
    'id',
    'modality',
    'niche',
    'platform',
    'provenanceRef',
    'rightsRef',
    'sourceRefs',
    'tenantId',
    'version',
  ]);
  // Reference-first: the document carries an artifact REFERENCE — never
  // content bytes or fabricated text.
  assert.equal(document.artifact.artifactId, 'art-1');
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
    corpusId: corpusId('corpus-sourdough'),
    version: 3 as Version,
    tenantId: tenantId('tenant-a'),
    documentRefs: [documentId('refdoc-1'), documentId('refdoc-2')],
    createdAt: timestamp('2026-06-02T00:00:00.000Z'),
    notes: 'post-campaign refresh',
  };

  assert.deepEqual(Object.keys(snapshot).sort(), [
    'corpusId',
    'createdAt',
    'documentRefs',
    'notes',
    'tenantId',
    'version',
  ]);
  assert.equal(snapshot.notes, 'post-campaign refresh');
});

test('CorpusQuery combines the documented dimensions and stays optional', () => {
  const empty: CorpusQuery = {};
  const full: CorpusQuery = {
    niche: 'sourdough-baking',
    platform: 'short-video',
    modality: 'video',
    acquiredFrom: timestamp('2026-05-01T00:00:00.000Z'),
    acquiredTo: timestamp('2026-07-01T00:00:00.000Z'),
  };
  assert.deepEqual(Object.keys(empty), []);
  assert.deepEqual(Object.keys(full).sort(), [
    'acquiredFrom',
    'acquiredTo',
    'modality',
    'niche',
    'platform',
  ]);
});

test('RightsCheckPort is satisfiable by a structural adapter (no @mos/rights import needed)', async () => {
  // The lab module's registry dependencies do not include rights, so the
  // gate is a lab-owned STRUCTURAL port. Compiling this double proves a
  // composition-root adapter over @mos/rights satisfies the shape.
  const gate: RightsCheckPort = {
    checkAcquisitionRights: async (input) => ({
      ok: input.scope.tenantId === tenantId('tenant-a') && !input.rightsRef.includes('revoked'),
    }),
  };
  const scope: TenantScope = { tenantId: tenantId('tenant-a') };
  const verdict = await gate.checkAcquisitionRights({
    scope,
    rightsRef: rightsRef('grant-1'),
  });
  assert.equal(verdict.ok, true);
});

test('CorpusStore surface is exactly the six documented port methods', () => {
  const methodNames: (keyof CorpusStore)[] = [
    'ingestReferenceDocument',
    'getReferenceDocument',
    'queryReferenceDocuments',
    'snapshotCorpusVersion',
    'getCorpusVersion',
    'listCorpusVersions',
  ];
  assert.equal(methodNames.length, 6);
  assert.ok(methodNames.length <= 12); // architecture policy: maxPublicMethods
});

test('ingest input carries scope + draft; draft version is assigned by the port', () => {
  // Type-level: the draft has no version field to get wrong — the port owns it.
  const draftKeys = Object.keys(draft()).sort();
  assert.ok(!draftKeys.includes('version'));
  assert.deepEqual(draftKeys, [
    'acquiredAt',
    'artifact',
    'id',
    'modality',
    'niche',
    'platform',
    'provenanceRef',
    'rightsRef',
    'sourceRefs',
  ]);
});
