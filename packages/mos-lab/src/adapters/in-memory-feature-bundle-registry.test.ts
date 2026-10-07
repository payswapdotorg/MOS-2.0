import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryCorpusStore } from './in-memory-corpus-store.js';
import {
  createInMemoryFeatureBundleRegistry,
} from './in-memory-feature-bundle-registry.js';
import { createStaticFeatureComputationPort } from './static-feature-computation.js';
import type {
  CorpusStore,
  RightsCheckPort,
} from '../contracts/corpus.js';
import type {
  FeatureBundle,
  FeatureBundleRegistry,
  FeatureComputationPort,
  FeatureDescriptor,
  FeatureMetadata,
  FeatureKindRequirement,
} from '../contracts/feature-bundle.js';
import type {
  ArtifactRef,
  CapabilityId,
  ProvenanceRef,
  RightsRef,
  TenantId,
  TenantScope,
  Timestamp,
  Version,
} from '@mos/contracts';
import { SEED_CAPABILITY_IDS } from '@mos/capabilities';

const tenantId = (value: string): TenantId => value as TenantId;
const rightsRef = (value: string): RightsRef => value as RightsRef;
const provenanceRef = (value: string): ProvenanceRef => value as ProvenanceRef;
const timestamp = (value: string): Timestamp => value as Timestamp;
const documentId = (value: string) => value as import('../contracts/corpus.js').ReferenceDocumentId;
const bundleId = (value: string) => value as import('../contracts/feature-bundle.js').FeatureBundleId;
const capabilityId = (value: string): CapabilityId => value as CapabilityId;

const scopeOf = (tenant: string): TenantScope => ({ tenantId: tenantId(tenant) });

const artifactRef = (id: string, tenant = 'tenant-a'): ArtifactRef => ({
  artifactId: `art-${id}` as ArtifactRef['artifactId'],
  version: 1 as Version,
  tenantId: tenantId(tenant),
  digest: `sha256:${(id + 'e'.repeat(60)).slice(0, 64).padEnd(64, '0')}` as ArtifactRef['digest'],
  type: 'application/octet-stream',
  storageRef: `mem://${tenant}/art-${id}` as ArtifactRef['storageRef'],
  rightsRef: rightsRef('grant-1'),
  provenanceRef: provenanceRef(`prov-${id}`),
});

/** DISCLOSED STRUCTURAL TEST DOUBLE for the acquisition rights gate. */
const rightsWith = (...refs: string[]): RightsCheckPort => ({
  checkAcquisitionRights: async (input) => ({ ok: refs.includes(input.rightsRef) }),
});

const fixture = () => {
  const corpus = createInMemoryCorpusStore({
    rights: rightsWith('grant-1', 'grant-b'),
    now: () => timestamp('2026-06-15T00:00:00.000Z'),
  });
  const registry = createInMemoryFeatureBundleRegistry({
    corpus,
    now: () => timestamp('2026-06-15T00:00:00.000Z'),
  });
  return { corpus, registry };
};

const ingestDoc = async (corpus: CorpusStore, tenant: string, id: string) => {
  const result = await corpus.ingestReferenceDocument({
    scope: scopeOf(tenant),
    document: {
      id: documentId(id),
      niche: 'sourdough-baking',
      platform: 'short-video',
      modality: 'video',
      artifact: artifactRef(id, tenant),
      sourceRefs: [`src://platform/${id}`],
      acquiredAt: timestamp('2026-06-01T00:00:00.000Z'),
      rightsRef: rightsRef(tenant === 'tenant-a' ? 'grant-1' : 'grant-b'),
      provenanceRef: provenanceRef(`prov-${id}`),
    },
  });
  if ('error' in result) {
    assert.fail(`unexpected corpus error: ${result.error}`);
  }
  return result;
};

const videoFeatures = (tenant = 'tenant-a'): readonly FeatureDescriptor[] => [
  {
    kind: 'video-features',
    artifact: artifactRef('feat-v1', tenant),
    metadata: { modelFamily: 'seed-video-relevance', trackCount: 3 },
  },
  {
    kind: 'audio-features',
    artifact: artifactRef('feat-a1', tenant),
    metadata: { sampleRateHz: 48000 },
  },
];

const attach = async (
  registry: FeatureBundleRegistry,
  input: Parameters<FeatureBundleRegistry['attachFeatureBundle']>[0],
): Promise<FeatureBundle> => {
  const result = await registry.attachFeatureBundle(input);
  if ('error' in result) {
    assert.fail(`unexpected bundle error: ${result.error} — ${result.message}`);
  }
  return result;
};

test('feature metadata is a scalar manifest — raw vectors are NOT representable', () => {
  const metadata: FeatureMetadata = { dimensions: 768, modelFamily: 'seed' };
  assert.equal(metadata.dimensions, 768);
  // @ts-expect-error arrays (raw vectors) are rejected by the type — features
  // live behind artifact refs, never in the control plane.
  const vector: FeatureMetadata = { embedding: [0.1, 0.2, 0.3] };
  assert.ok(vector);
});

test('attach a version-1 bundle to a corpus document; features carry artifact refs + scalar metadata', async () => {
  const { corpus, registry } = fixture();
  const doc = await ingestDoc(corpus, 'tenant-a', 'refdoc-1');
  const bundle = await attach(registry, {
    scope: scopeOf('tenant-a'),
    id: bundleId('bundle-1'),
    documentId: doc.id,
    features: videoFeatures(),
    provenanceRef: provenanceRef('prov-compute-1'),
  });
  assert.equal(bundle.version, 1);
  assert.equal(bundle.tenantId, tenantId('tenant-a'));
  assert.equal(bundle.documentId, documentId('refdoc-1'));
  assert.equal(bundle.detachedAt, null);
  assert.equal(bundle.features.length, 2);
  assert.equal(bundle.features[0]?.kind, 'video-features');
  assert.equal(bundle.features[0]?.metadata.trackCount, 3);
  assert.ok(Object.isFrozen(bundle));
  assert.ok(Object.isFrozen(bundle.features));
  assert.ok(Object.isFrozen(bundle.features[0]?.metadata));

  const fetched = await registry.getFeatureBundle(scopeOf('tenant-a'), bundleId('bundle-1'));
  assert.deepEqual(fetched, bundle);
  // Cross-tenant read never leaks existence.
  assert.equal(await registry.getFeatureBundle(scopeOf('tenant-b'), bundleId('bundle-1')), null);
});

test('attach is rejected for unknown documents, foreign artifacts and empty feature sets', async () => {
  const { corpus, registry } = fixture();
  const doc = await ingestDoc(corpus, 'tenant-a', 'refdoc-1');

  const unknownDoc = await registry.attachFeatureBundle({
    scope: scopeOf('tenant-a'),
    id: bundleId('bundle-x'),
    documentId: documentId('refdoc-ghost'),
    features: videoFeatures(),
    provenanceRef: provenanceRef('prov-x'),
  });
  assert.ok('error' in unknownDoc && unknownDoc.error === 'document-not-found');

  const foreignArtifact = await registry.attachFeatureBundle({
    scope: scopeOf('tenant-a'),
    id: bundleId('bundle-x'),
    documentId: doc.id,
    features: videoFeatures('tenant-b'),
    provenanceRef: provenanceRef('prov-x'),
  });
  assert.ok('error' in foreignArtifact && foreignArtifact.error === 'cross-tenant-reference');

  const emptyFeatures = await registry.attachFeatureBundle({
    scope: scopeOf('tenant-a'),
    id: bundleId('bundle-x'),
    documentId: doc.id,
    features: [],
    provenanceRef: provenanceRef('prov-x'),
  });
  assert.ok('error' in emptyFeatures && emptyFeatures.error === 'invalid-input');
});

test('bundles are versioned: update appends version 2 and keeps version 1 retrievable', async () => {
  const { corpus, registry } = fixture();
  const doc = await ingestDoc(corpus, 'tenant-a', 'refdoc-1');
  const v1 = await attach(registry, {
    scope: scopeOf('tenant-a'),
    id: bundleId('bundle-1'),
    documentId: doc.id,
    features: videoFeatures(),
    provenanceRef: provenanceRef('prov-compute-1'),
  });

  const v2 = await registry.updateFeatureBundle({
    scope: scopeOf('tenant-a'),
    id: bundleId('bundle-1'),
    features: [
      {
        kind: 'video-features',
        artifact: artifactRef('feat-v2'),
        metadata: { modelFamily: 'seed-video-relevance', trackCount: 5 },
      },
    ],
    provenanceRef: provenanceRef('prov-compute-2'),
  });
  assert.ok(!('error' in v2));
  assert.equal(v2.version, 2);
  assert.equal(v2.features.length, 1);

  const fetchedV1 = await registry.getFeatureBundle(scopeOf('tenant-a'), bundleId('bundle-1'), 1);
  assert.deepEqual(fetchedV1, v1);
  const latest = await registry.getFeatureBundle(scopeOf('tenant-a'), bundleId('bundle-1'));
  assert.deepEqual(latest, v2);

  const list = await registry.listFeatureBundles(scopeOf('tenant-a'));
  assert.deepEqual(
    list.map((bundle) => bundle.id),
    [bundleId('bundle-1')],
  );
  assert.equal(list[0]?.version, 2);
});

test('detach is append-only: a final version records detachedAt and excludes the bundle from listings', async () => {
  const { corpus, registry } = fixture();
  const doc = await ingestDoc(corpus, 'tenant-a', 'refdoc-1');
  await attach(registry, {
    scope: scopeOf('tenant-a'),
    id: bundleId('bundle-1'),
    documentId: doc.id,
    features: videoFeatures(),
    provenanceRef: provenanceRef('prov-compute-1'),
  });

  const detached = await registry.detachFeatureBundle(scopeOf('tenant-a'), bundleId('bundle-1'));
  assert.ok(!('error' in detached));
  assert.equal(detached.version, 2);
  assert.equal(detached.detachedAt, timestamp('2026-06-15T00:00:00.000Z'));

  // Detached bundles are immutable: further updates/detaches fail closed.
  const updateAfterDetach = await registry.updateFeatureBundle({
    scope: scopeOf('tenant-a'),
    id: bundleId('bundle-1'),
    features: videoFeatures(),
    provenanceRef: provenanceRef('prov-compute-3'),
  });
  assert.ok('error' in updateAfterDetach && updateAfterDetach.error === 'bundle-detached');
  const detachAgain = await registry.detachFeatureBundle(scopeOf('tenant-a'), bundleId('bundle-1'));
  assert.ok('error' in detachAgain && detachAgain.error === 'bundle-detached');

  // History stays auditable (version 1 retrievable), but listings exclude it.
  const fetchedV1 = await registry.getFeatureBundle(scopeOf('tenant-a'), bundleId('bundle-1'), 1);
  assert.ok(fetchedV1 !== null && fetchedV1.detachedAt === null);
  assert.deepEqual(await registry.listFeatureBundles(scopeOf('tenant-a')), []);

  const unknown = await registry.detachFeatureBundle(scopeOf('tenant-a'), bundleId('nope'));
  assert.ok('error' in unknown && unknown.error === 'bundle-not-found');
});

test('listFeatureBundles filters by document and stays tenant-scoped', async () => {
  const { corpus, registry } = fixture();
  const docA1 = await ingestDoc(corpus, 'tenant-a', 'refdoc-a1');
  const docA2 = await ingestDoc(corpus, 'tenant-a', 'refdoc-a2');
  await ingestDoc(corpus, 'tenant-b', 'refdoc-b1');
  await attach(registry, {
    scope: scopeOf('tenant-a'),
    id: bundleId('bundle-a1'),
    documentId: docA1.id,
    features: videoFeatures(),
    provenanceRef: provenanceRef('prov-compute-a1'),
  });
  await attach(registry, {
    scope: scopeOf('tenant-a'),
    id: bundleId('bundle-a2'),
    documentId: docA2.id,
    features: videoFeatures(),
    provenanceRef: provenanceRef('prov-compute-a2'),
  });
  await attach(registry, {
    scope: scopeOf('tenant-b'),
    id: bundleId('bundle-b1'),
    documentId: documentId('refdoc-b1'),
    features: videoFeatures('tenant-b'),
    provenanceRef: provenanceRef('prov-compute-b1'),
  });

  const forDoc = await registry.listFeatureBundles(scopeOf('tenant-a'), documentId('refdoc-a1'));
  assert.deepEqual(
    forDoc.map((bundle) => bundle.id),
    [bundleId('bundle-a1')],
  );
  const allTenantA = await registry.listFeatureBundles(scopeOf('tenant-a'));
  assert.deepEqual(
    allTenantA.map((bundle) => bundle.id),
    [bundleId('bundle-a1'), bundleId('bundle-a2')],
  );
  const allTenantB = await registry.listFeatureBundles(scopeOf('tenant-b'));
  assert.deepEqual(
    allTenantB.map((bundle) => bundle.id),
    [bundleId('bundle-b1')],
  );
});

test('FeatureComputationPort DECLARES capability requirements pinned to the @mos/capabilities seed catalog', async () => {
  // The declaration references the semantic_video_relevance capability id
  // from @mos/capabilities' §5 seed catalog — a REAL catalog id, not an
  // invented one. Declaration only: nothing computes here.
  const semanticVideoRelevance = SEED_CAPABILITY_IDS.find(
    (id) => id === 'semantic_video_relevance',
  );
  assert.ok(semanticVideoRelevance !== undefined, 'seed catalog must list semantic_video_relevance');

  const requirements: readonly FeatureKindRequirement[] = [
    {
      kind: 'video-features',
      capability: { capabilityId: capabilityId(semanticVideoRelevance), version: 1 as Version },
    },
    {
      kind: 'text-embedding',
      capability: { capabilityId: capabilityId('generate_questions'), version: 1 as Version },
    },
  ];
  const port: FeatureComputationPort = createStaticFeatureComputationPort(requirements);
  const declared = port.requirements();
  assert.equal(declared.length, 2);
  assert.equal(declared[0]?.kind, 'video-features');
  assert.equal(declared[0]?.capability.capabilityId, semanticVideoRelevance);
  assert.equal(declared[0]?.capability.version, 1);
  assert.ok(Object.isFrozen(declared));
  // Declaration is stable across calls (idempotent read).
  assert.deepEqual(port.requirements(), declared);
});
