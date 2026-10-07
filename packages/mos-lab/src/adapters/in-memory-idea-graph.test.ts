import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryCorpusStore } from './in-memory-corpus-store.js';
import { createInMemoryFeatureBundleRegistry } from './in-memory-feature-bundle-registry.js';
import { createInMemoryIdeaGraph } from './in-memory-idea-graph.js';
import type { CorpusStore, RightsCheckPort } from '../contracts/corpus.js';
import type { FeatureBundleRegistry } from '../contracts/feature-bundle.js';
import type {
  DerivationStep,
  IdeaDerivation,
  IdeaEdgeKind,
  IdeaGraph,
  IdeaNode,
} from '../contracts/idea-graph.js';
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
const bundleId = (value: string) => value as import('../contracts/feature-bundle.js').FeatureBundleId;
const ideaNodeId = (value: string) => value as import('../contracts/idea-graph.js').IdeaNodeId;
const ideaEdgeId = (value: string) => value as import('../contracts/idea-graph.js').IdeaEdgeId;

const scopeOf = (tenant: string): TenantScope => ({ tenantId: tenantId(tenant) });

const artifactRef = (id: string, tenant = 'tenant-a'): ArtifactRef => ({
  artifactId: `art-${id}` as ArtifactRef['artifactId'],
  version: 1 as Version,
  tenantId: tenantId(tenant),
  digest: `sha256:${(id + 'd'.repeat(60)).slice(0, 64).padEnd(64, '0')}` as ArtifactRef['digest'],
  type: 'video/mp4',
  storageRef: `mem://${tenant}/art-${id}` as ArtifactRef['storageRef'],
  rightsRef: rightsRef('grant-1'),
  provenanceRef: provenanceRef(`prov-${id}`),
});

/** DISCLOSED STRUCTURAL TEST DOUBLE for the acquisition rights gate. */
const rightsWith = (...refs: string[]): RightsCheckPort => ({
  checkAcquisitionRights: async (input) => ({ ok: refs.includes(input.rightsRef) }),
});

/**
 * Full in-package stack: a REAL in-memory corpus store + feature bundle
 * registry behind the idea graph, so derivation validation and tracing run
 * against genuine corpus evidence (not stubs).
 */
const fixture = () => {
  const now = () => timestamp('2026-06-15T00:00:00.000Z');
  const corpus = createInMemoryCorpusStore({ rights: rightsWith('grant-1', 'grant-b'), now });
  const bundles = createInMemoryFeatureBundleRegistry({ corpus, now });
  const graph = createInMemoryIdeaGraph({ corpus, bundles, now });
  return { corpus, bundles, graph };
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

const attachBundle = async (
  bundles: FeatureBundleRegistry,
  tenant: string,
  id: string,
  docId: string,
) => {
  const result = await bundles.attachFeatureBundle({
    scope: scopeOf(tenant),
    id: bundleId(id),
    documentId: documentId(docId),
    features: [
      {
        kind: 'video-features',
        artifact: artifactRef(`feat-${id}`, tenant),
        metadata: { modelFamily: 'seed-video-relevance', trackCount: 2 },
      },
    ],
    provenanceRef: provenanceRef(`prov-compute-${id}`),
  });
  if ('error' in result) {
    assert.fail(`unexpected bundle error: ${result.error}`);
  }
  return result;
};

const addIdea = async (
  graph: IdeaGraph,
  tenant: string,
  id: string,
  derivation: IdeaDerivation,
  overrides: { statement?: string } = {},
): Promise<IdeaNode> => {
  const result = await graph.addIdeaNode({
    scope: scopeOf(tenant),
    id: ideaNodeId(id),
    statement: overrides.statement ?? `statement-${id}`,
    derivation,
    provenanceRef: provenanceRef(`prov-idea-${id}`),
  });
  if ('error' in result) {
    assert.fail(`unexpected idea error: ${result.error} — ${result.message}`);
  }
  return result;
};

const addEdge = async (
  graph: IdeaGraph,
  tenant: string,
  id: string,
  from: string,
  to: string,
  kind: IdeaEdgeKind,
  weight: number,
) => {
  const result = await graph.addIdeaEdge({
    scope: scopeOf(tenant),
    id: ideaEdgeId(id),
    fromNodeId: ideaNodeId(from),
    toNodeId: ideaNodeId(to),
    kind,
    weight,
  });
  if ('error' in result) {
    assert.fail(`unexpected edge error: ${result.error} — ${result.message}`);
  }
  return result;
};

test('CRITICAL: an idea without derivation refs is REJECTED (ideas are derived artifacts)', async () => {
  const { corpus, graph } = fixture();
  await ingestDoc(corpus, 'tenant-a', 'refdoc-1');
  const rejected = await graph.addIdeaNode({
    scope: scopeOf('tenant-a'),
    id: ideaNodeId('idea-floating'),
    statement: 'a free-floating hunch',
    derivation: { documents: [], featureBundles: [] },
    provenanceRef: provenanceRef('prov-idea-x'),
  });
  assert.ok('error' in rejected && rejected.error === 'empty-derivation');
});

test('derivation refs must resolve in the tenant corpus (documents AND feature bundles)', async () => {
  const { corpus, bundles, graph } = fixture();
  await ingestDoc(corpus, 'tenant-a', 'refdoc-1');
  await attachBundle(bundles, 'tenant-a', 'bundle-1', 'refdoc-1');

  const unknownDoc = await graph.addIdeaNode({
    scope: scopeOf('tenant-a'),
    id: ideaNodeId('idea-x'),
    statement: 'statement',
    derivation: { documents: [documentId('refdoc-ghost')], featureBundles: [] },
    provenanceRef: provenanceRef('prov-idea-x'),
  });
  assert.ok('error' in unknownDoc && unknownDoc.error === 'unknown-derivation-ref');

  const unknownBundle = await graph.addIdeaNode({
    scope: scopeOf('tenant-a'),
    id: ideaNodeId('idea-x'),
    statement: 'statement',
    derivation: { documents: [], featureBundles: [bundleId('bundle-ghost')] },
    provenanceRef: provenanceRef('prov-idea-x'),
  });
  assert.ok('error' in unknownBundle && unknownBundle.error === 'unknown-derivation-ref');

  // A derivation naming only FOREIGN-tenant evidence does not resolve either.
  await ingestDoc(corpus, 'tenant-b', 'refdoc-b1');
  const foreignDoc = await graph.addIdeaNode({
    scope: scopeOf('tenant-a'),
    id: ideaNodeId('idea-x'),
    statement: 'statement',
    derivation: { documents: [documentId('refdoc-b1')], featureBundles: [] },
    provenanceRef: provenanceRef('prov-idea-x'),
  });
  assert.ok('error' in foreignDoc && foreignDoc.error === 'unknown-derivation-ref');
});

test('idea nodes: versioned append-only revisions, derivation evidence, tenant scoping', async () => {
  const { corpus, graph } = fixture();
  await ingestDoc(corpus, 'tenant-a', 'refdoc-1');

  const v1 = await addIdea(graph, 'tenant-a', 'idea-1', {
    documents: [documentId('refdoc-1')],
    featureBundles: [],
  });
  assert.equal(v1.version, 1);
  assert.equal(v1.statement, 'statement-idea-1');
  assert.deepEqual(v1.derivation.documents, [documentId('refdoc-1')]);
  assert.ok(Object.isFrozen(v1));
  assert.ok(Object.isFrozen(v1.derivation.documents));

  // Duplicate id rejected.
  const duplicate = await graph.addIdeaNode({
    scope: scopeOf('tenant-a'),
    id: ideaNodeId('idea-1'),
    statement: 'another',
    derivation: { documents: [documentId('refdoc-1')], featureBundles: [] },
    provenanceRef: provenanceRef('prov-idea-x'),
  });
  assert.ok('error' in duplicate && duplicate.error === 'duplicate-idea');

  // Revision appends version 2; version 1 stays retrievable.
  const v2 = await graph.reviseIdeaNode({
    scope: scopeOf('tenant-a'),
    id: ideaNodeId('idea-1'),
    statement: 'revised statement',
    derivation: { documents: [documentId('refdoc-1')], featureBundles: [] },
    provenanceRef: provenanceRef('prov-idea-1b'),
  });
  assert.ok(!('error' in v2));
  assert.equal(v2.version, 2);
  assert.equal(v2.statement, 'revised statement');
  const fetchedV1 = await graph.getIdeaNode(scopeOf('tenant-a'), ideaNodeId('idea-1'), 1);
  assert.deepEqual(fetchedV1, v1);
  const latest = await graph.getIdeaNode(scopeOf('tenant-a'), ideaNodeId('idea-1'));
  assert.deepEqual(latest, v2);

  // A revision that drops derivation entirely is rejected.
  const badRevision = await graph.reviseIdeaNode({
    scope: scopeOf('tenant-a'),
    id: ideaNodeId('idea-1'),
    statement: 'hunch again',
    derivation: { documents: [], featureBundles: [] },
    provenanceRef: provenanceRef('prov-idea-x'),
  });
  assert.ok('error' in badRevision && badRevision.error === 'empty-derivation');

  // Cross-tenant read never leaks existence.
  assert.equal(await graph.getIdeaNode(scopeOf('tenant-b'), ideaNodeId('idea-1')), null);
  const foreignRevision = await graph.reviseIdeaNode({
    scope: scopeOf('tenant-b'),
    id: ideaNodeId('idea-1'),
    statement: 'foreign edit',
    derivation: { documents: [documentId('refdoc-1')], featureBundles: [] },
    provenanceRef: provenanceRef('prov-idea-x'),
  });
  assert.ok('error' in foreignRevision && foreignRevision.error === 'cross-tenant-reference');
});

test('idea edges: typed relations, weight bounds, versioned corrections', async () => {
  const { corpus, graph } = fixture();
  await ingestDoc(corpus, 'tenant-a', 'refdoc-1');
  await ingestDoc(corpus, 'tenant-a', 'refdoc-2');
  await addIdea(graph, 'tenant-a', 'idea-a', { documents: [documentId('refdoc-1')], featureBundles: [] });
  await addIdea(graph, 'tenant-a', 'idea-b', { documents: [documentId('refdoc-2')], featureBundles: [] });

  const edge = await addEdge(graph, 'tenant-a', 'edge-1', 'idea-a', 'idea-b', 'supports', 0.8);
  assert.equal(edge.version, 1);
  assert.equal(edge.kind, 'supports');
  assert.equal(edge.weight, 0.8);
  assert.ok(Object.isFrozen(edge));
  assert.deepEqual(await graph.getIdeaEdge(scopeOf('tenant-a'), ideaEdgeId('edge-1')), edge);
  assert.equal(await graph.getIdeaEdge(scopeOf('tenant-b'), ideaEdgeId('edge-1')), null);

  // Corrections append version 2 (kind + weight re-typed).
  const corrected = await graph.updateIdeaEdge({
    scope: scopeOf('tenant-a'),
    id: ideaEdgeId('edge-1'),
    kind: 'contradicts',
    weight: -0.6,
  });
  assert.ok(!('error' in corrected));
  assert.equal(corrected.version, 2);
  assert.equal(corrected.kind, 'contradicts');
  assert.equal(corrected.weight, -0.6);

  const unknown = await graph.updateIdeaEdge({
    scope: scopeOf('tenant-a'),
    id: ideaEdgeId('nope'),
    weight: 0.1,
  });
  assert.ok('error' in unknown && unknown.error === 'edge-not-found');

  // Invalid edges are rejected: self-edge, weight out of bounds, unknown
  // endpoint, duplicate edge id.
  const self = await graph.addIdeaEdge({
    scope: scopeOf('tenant-a'),
    id: ideaEdgeId('edge-x'),
    fromNodeId: ideaNodeId('idea-a'),
    toNodeId: ideaNodeId('idea-a'),
    kind: 'combines-with',
    weight: 0.5,
  });
  assert.ok('error' in self && self.error === 'invalid-input');

  const badWeight = await graph.addIdeaEdge({
    scope: scopeOf('tenant-a'),
    id: ideaEdgeId('edge-x'),
    fromNodeId: ideaNodeId('idea-a'),
    toNodeId: ideaNodeId('idea-b'),
    kind: 'supports',
    weight: 1.5,
  });
  assert.ok('error' in badWeight && badWeight.error === 'invalid-input');

  const unknownEndpoint = await graph.addIdeaEdge({
    scope: scopeOf('tenant-a'),
    id: ideaEdgeId('edge-x'),
    fromNodeId: ideaNodeId('idea-ghost'),
    toNodeId: ideaNodeId('idea-b'),
    kind: 'supports',
    weight: 0.5,
  });
  assert.ok('error' in unknownEndpoint && unknownEndpoint.error === 'idea-not-found');

  const duplicateEdge = await graph.addIdeaEdge({
    scope: scopeOf('tenant-a'),
    id: ideaEdgeId('edge-1'),
    fromNodeId: ideaNodeId('idea-a'),
    toNodeId: ideaNodeId('idea-b'),
    kind: 'supports',
    weight: 0.5,
  });
  assert.ok('error' in duplicateEdge && duplicateEdge.error === 'duplicate-edge');
});

test('neighborhood query: induced subgraph within the hop radius, deterministic order', async () => {
  const { corpus, graph } = fixture();
  for (const id of ['refdoc-1', 'refdoc-2', 'refdoc-3', 'refdoc-4']) {
    await ingestDoc(corpus, 'tenant-a', id);
  }
  await addIdea(graph, 'tenant-a', 'idea-1', { documents: [documentId('refdoc-1')], featureBundles: [] });
  await addIdea(graph, 'tenant-a', 'idea-2', { documents: [documentId('refdoc-2')], featureBundles: [] });
  await addIdea(graph, 'tenant-a', 'idea-3', { documents: [documentId('refdoc-3')], featureBundles: [] });
  await addIdea(graph, 'tenant-a', 'idea-4', { documents: [documentId('refdoc-4')], featureBundles: [] });

  // Chain 1—2—3 plus an edge 1—4: from idea-2 with radius 1 the
  // neighborhood is {1,2,3} (4 is 2 hops away).
  await addEdge(graph, 'tenant-a', 'edge-12', 'idea-1', 'idea-2', 'supports', 0.9);
  await addEdge(graph, 'tenant-a', 'edge-23', 'idea-2', 'idea-3', 'contradicts', -0.7);
  await addEdge(graph, 'tenant-a', 'edge-14', 'idea-1', 'idea-4', 'combines-with', 0.4);

  const radius1 = await graph.queryNeighborhood(scopeOf('tenant-a'), ideaNodeId('idea-2'));
  assert.ok(!('error' in radius1));
  assert.deepEqual(
    radius1.nodes.map((node) => node.id),
    [ideaNodeId('idea-1'), ideaNodeId('idea-2'), ideaNodeId('idea-3')],
  );
  assert.deepEqual(
    radius1.edges.map((edge) => edge.id),
    [ideaEdgeId('edge-12'), ideaEdgeId('edge-23')],
  );
  assert.equal(radius1.rootId, ideaNodeId('idea-2'));

  // Radius 2 from idea-2 reaches everything, and the induced subgraph
  // includes the 1—4 edge even though neither endpoint was traversed THROUGH it.
  const radius2 = await graph.queryNeighborhood(scopeOf('tenant-a'), ideaNodeId('idea-2'), {
    radius: 2,
  });
  assert.ok(!('error' in radius2));
  assert.deepEqual(
    radius2.nodes.map((node) => node.id),
    [ideaNodeId('idea-1'), ideaNodeId('idea-2'), ideaNodeId('idea-3'), ideaNodeId('idea-4')],
  );
  assert.deepEqual(
    radius2.edges.map((edge) => edge.id),
    [ideaEdgeId('edge-12'), ideaEdgeId('edge-14'), ideaEdgeId('edge-23')],
  );

  // Unknown root / negative radius fail closed; foreign tenant sees nothing.
  const unknownRoot = await graph.queryNeighborhood(scopeOf('tenant-a'), ideaNodeId('nope'));
  assert.ok('error' in unknownRoot && unknownRoot.error === 'idea-not-found');
  const negative = await graph.queryNeighborhood(scopeOf('tenant-a'), ideaNodeId('idea-2'), {
    radius: -1,
  });
  assert.ok('error' in negative && negative.error === 'invalid-input');
  const foreign = await graph.queryNeighborhood(scopeOf('tenant-b'), ideaNodeId('idea-2'));
  assert.ok('error' in foreign && foreign.error === 'idea-not-found');
});

test('derivation chain tracing: ideas → bundles → documents → acquired artifact refs', async () => {
  const { corpus, bundles, graph } = fixture();
  await ingestDoc(corpus, 'tenant-a', 'refdoc-1');
  await ingestDoc(corpus, 'tenant-a', 'refdoc-2');
  await attachBundle(bundles, 'tenant-a', 'bundle-1', 'refdoc-1');

  // idea-1 derives from the FEATURE BUNDLE (which itself was computed over
  // refdoc-1); idea-2 derives from refdoc-2 directly AND derives-from idea-1.
  await addIdea(graph, 'tenant-a', 'idea-1', {
    documents: [],
    featureBundles: [bundleId('bundle-1')],
  });
  await addIdea(
    graph,
    'tenant-a',
    'idea-2',
    { documents: [documentId('refdoc-2')], featureBundles: [] },
    { statement: 'downstream statement' },
  );
  await addEdge(graph, 'tenant-a', 'edge-21', 'idea-2', 'idea-1', 'derives-from', 1);

  const steps = await graph.traceDerivation(scopeOf('tenant-a'), ideaNodeId('idea-2'));
  assert.ok(!('error' in steps));
  const expected: readonly DerivationStep[] = [
    { kind: 'idea', nodeId: ideaNodeId('idea-2') },
    { kind: 'corpus-document', documentId: documentId('refdoc-2'), artifact: artifactRef('refdoc-2') },
    { kind: 'idea', nodeId: ideaNodeId('idea-1') },
    {
      kind: 'feature-bundle',
      bundleId: bundleId('bundle-1'),
      documentId: documentId('refdoc-1'),
    },
  ];
  assert.deepEqual(steps, expected);

  // The chain terminates in ACQUIRED ARTIFACT REFS (reference-first corpus
  // evidence), not in opaque statements.
  const terminal = steps[steps.length - 1];
  assert.ok(terminal?.kind === 'feature-bundle');
  const doc1 = await corpus.getReferenceDocument(scopeOf('tenant-a'), documentId('refdoc-1'));
  assert.ok(doc1 !== null);
  assert.equal(doc1.artifact.artifactId, 'art-refdoc-1');

  const unknown = await graph.traceDerivation(scopeOf('tenant-a'), ideaNodeId('nope'));
  assert.ok('error' in unknown && unknown.error === 'idea-not-found');
  const foreign = await graph.traceDerivation(scopeOf('tenant-b'), ideaNodeId('idea-2'));
  assert.ok('error' in foreign && foreign.error === 'idea-not-found');
});

test('mixed derivation (documents AND bundles) is supported and deduplicated in traces', async () => {
  const { corpus, bundles, graph } = fixture();
  await ingestDoc(corpus, 'tenant-a', 'refdoc-1');
  await ingestDoc(corpus, 'tenant-a', 'refdoc-2');
  await attachBundle(bundles, 'tenant-a', 'bundle-1', 'refdoc-1');

  await addIdea(graph, 'tenant-a', 'idea-1', {
    documents: [documentId('refdoc-1'), documentId('refdoc-2')],
    featureBundles: [bundleId('bundle-1')],
  });
  const steps = await graph.traceDerivation(scopeOf('tenant-a'), ideaNodeId('idea-1'));
  assert.ok(!('error' in steps));
  // bundle-1 resolves to refdoc-1 (a bundle step), then the explicit
  // document refs resolve to refdoc-1 + refdoc-2 artifact evidence.
  assert.deepEqual(
    steps.map((step) => step.kind),
    ['idea', 'feature-bundle', 'corpus-document', 'corpus-document'],
  );
});
