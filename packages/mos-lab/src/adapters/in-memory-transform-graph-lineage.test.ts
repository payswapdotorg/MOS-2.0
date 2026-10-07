import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ArtifactRef, JsonObject, Version } from '@mos/contracts';
import { createInMemoryTransformDefinitionRegistry } from './in-memory-transform-definition-registry.js';
import { createInMemoryTransformGraph } from './in-memory-transform-graph.js';
import type {
  TransformDefinitionRegistry,
  TransformKind,
} from '../contracts/transform-definition.js';
import type {
  ArtifactFlowEdge,
  CreateTransformGraphInput,
  TransformApplicationNode,
  TransformGraph,
  TransformGraphId,
  TransformGraphPort,
} from '../contracts/transform-graph.js';
import {
  FIXED_NOW,
  THIRTEEN_KINDS,
  artifactRef,
  definitionIdOf,
  definitionInputOf,
  scopeOf,
} from '../testing/w5a-transform-fixtures.js';

type CreateResult = Awaited<ReturnType<TransformGraphPort['createTransformGraph']>>;

const asGraph = (result: CreateResult): TransformGraph => {
  if ('error' in result) {
    assert.fail(`unexpected graph error: ${result.error} — ${result.message}`);
  }
  return result;
};

const graphId = (value: string): TransformGraphId => value as TransformGraphId;

const node = (
  nodeId: string,
  kind: TransformKind,
  inputs: readonly ArtifactRef[] = [],
  parameterization: JsonObject = {},
): TransformApplicationNode => ({
  nodeId,
  definitionId: definitionIdOf(kind),
  definitionVersion: 1 as Version,
  inputs: [...inputs],
  parameterization: { ...parameterization },
});

const edge = (edgeId: string, fromNodeId: string, toNodeId: string): ArtifactFlowEdge => ({
  edgeId,
  fromNodeId,
  toNodeId,
});

/** A tenant-scoped stack: registry seeded with the 13 kinds + a graph port. */
const setup = async (tenant = 'tenant-a') => {
  const registry: TransformDefinitionRegistry = createInMemoryTransformDefinitionRegistry({
    now: FIXED_NOW,
  });
  for (const kind of THIRTEEN_KINDS) {
    const registered = await registry.registerTransformDefinition(definitionInputOf(kind, tenant));
    assert.ok(!('error' in registered), `seed definition failed: ${String(registered)}`);
  }
  const graphs = createInMemoryTransformGraph({ definitions: registry, now: FIXED_NOW });
  return { registry, graphs };
};

const V1 = artifactRef('v1');
const V2 = artifactRef('v2');

/** The composite fixture: two clips → compilation → no-op repost (multi-node composite). */
const compositeGraphInput = (): CreateTransformGraphInput => ({
  scope: scopeOf('tenant-a'),
  id: graphId('graph.composite'),
  nodes: [
    node('clip-1', 'clip', [V1]),
    node('clip-2', 'clip', [V2]),
    node('compilation', 'compilation'),
    node('repost', 'no-op-repost'),
  ],
  edges: [
    edge('e-clip-1', 'clip-1', 'compilation'),
    edge('e-clip-2', 'clip-2', 'compilation'),
    edge('e-repost', 'compilation', 'repost'),
  ],
});

// ---------------------------------------------------------------------------
// Lineage tracing + subgraph queries
// ---------------------------------------------------------------------------

test('lineage tracing follows the artifact through the composite, topologically ordered', async () => {
  const { graphs } = await setup();
  asGraph(await graphs.createTransformGraph(compositeGraphInput()));
  const trace = await graphs.traceArtifactLineage(
    scopeOf('tenant-a'),
    graphId('graph.composite'),
    { artifactId: V1.artifactId, version: V1.version },
  );
  assert.ok(!('error' in trace), `unexpected error: ${String(trace)}`);
  if ('error' in trace) {
    return;
  }
  assert.deepEqual(trace.directConsumerNodeIds, ['clip-1']);
  // Downstream cone of V1 in deterministic topological order: the clip, the
  // compilation it feeds, and the no-op repost closing the chain.
  assert.deepEqual(
    trace.downstreamNodes.map((entry) => entry.nodeId),
    ['clip-1', 'compilation', 'repost'],
  );
  // Definitions align by index — which transforms produce which outputs.
  assert.deepEqual(
    trace.definitions.map((definition) => String(definition.id)),
    ['transform.clip', 'transform.compilation', 'transform.no-op-repost'],
  );
  assert.deepEqual(trace.definitions.map((definition) => definition.kind), [
    'clip',
    'compilation',
    'no-op-repost',
  ]);
  // Only the edges among the downstream cone (V2's clip-2 edge excluded).
  assert.deepEqual(
    trace.edges.map((entry) => entry.edgeId),
    ['e-clip-1', 'e-repost'],
  );
  assert.deepEqual(trace.artifact, V1);
  assert.equal(trace.graphVersion, 1);
});

test('lineage tracing of the second source stays in its own cone', async () => {
  const { graphs } = await setup();
  asGraph(await graphs.createTransformGraph(compositeGraphInput()));
  const trace = await graphs.traceArtifactLineage(
    scopeOf('tenant-a'),
    graphId('graph.composite'),
    { artifactId: V2.artifactId, version: V2.version },
  );
  assert.ok(!('error' in trace));
  if ('error' in trace) {
    return;
  }
  assert.deepEqual(trace.directConsumerNodeIds, ['clip-2']);
  assert.deepEqual(
    trace.downstreamNodes.map((entry) => entry.nodeId),
    ['clip-2', 'compilation', 'repost'],
  );
  assert.deepEqual(
    trace.edges.map((entry) => entry.edgeId),
    ['e-clip-2', 'e-repost'],
  );
});

test('lineage failures: unknown graph, artifact not in graph, unresolvable version', async () => {
  const { graphs } = await setup();
  asGraph(await graphs.createTransformGraph(compositeGraphInput()));
  const unknownGraph = await graphs.traceArtifactLineage(
    scopeOf('tenant-a'),
    graphId('graph.never'),
    { artifactId: V1.artifactId, version: V1.version },
  );
  assert.ok('error' in unknownGraph && unknownGraph.error === 'graph-not-found');
  const notInGraph = await graphs.traceArtifactLineage(
    scopeOf('tenant-a'),
    graphId('graph.composite'),
    { artifactId: V1.artifactId, version: 9 as Version },
  );
  assert.ok('error' in notInGraph && notInGraph.error === 'artifact-not-in-graph');
  const missingVersion = await graphs.traceArtifactLineage(
    scopeOf('tenant-a'),
    graphId('graph.composite'),
    { artifactId: V1.artifactId, version: V1.version },
    5,
  );
  assert.ok('error' in missingVersion && missingVersion.error === 'graph-not-found');
});

test('subgraph query returns the full production cone (downstream + upstream ancestors)', async () => {
  const { graphs } = await setup();
  asGraph(await graphs.createTransformGraph(compositeGraphInput()));
  const subgraph = await graphs.querySubgraph(
    scopeOf('tenant-a'),
    graphId('graph.composite'),
    { artifactId: V1.artifactId, version: V1.version },
  );
  assert.ok(!('error' in subgraph));
  if ('error' in subgraph) {
    return;
  }
  // V1's cone: clip-1 → compilation → repost, PLUS clip-2 (the co-input
  // ancestor feeding the same compilation).
  assert.deepEqual(
    subgraph.nodes.map((entry) => entry.nodeId),
    ['clip-1', 'clip-2', 'compilation', 'repost'],
  );
  assert.deepEqual(
    subgraph.edges.map((entry) => entry.edgeId),
    ['e-clip-1', 'e-clip-2', 'e-repost'],
  );
  assert.deepEqual(subgraph.artifact, V1);
});

test('subgraph failures mirror lineage failures', async () => {
  const { graphs } = await setup();
  const unknownGraph = await graphs.querySubgraph(scopeOf('tenant-a'), graphId('graph.never'), {
    artifactId: V1.artifactId,
    version: V1.version,
  });
  assert.ok('error' in unknownGraph && unknownGraph.error === 'graph-not-found');
});

// ---------------------------------------------------------------------------
// Immutability + ownership semantics
// ---------------------------------------------------------------------------

test('stored parameterization is deep-frozen: nested JSON is immutable', async () => {
  const { graphs } = await setup();
  const graph = asGraph(
    await graphs.createTransformGraph({
      scope: scopeOf('tenant-a'),
      id: graphId('graph.deep'),
      nodes: [node('clip-1', 'clip', [V1], { nested: { intensity: 0.7 } })],
    }),
  );
  const stored = graph.nodes[0] as TransformApplicationNode;
  assert.ok(Object.isFrozen(stored.parameterization));
  const nested = (stored.parameterization as { nested: { intensity: number } }).nested;
  // The bit-for-bit append-only guarantee extends all the way down: nested
  // parameterization values cannot be rewritten through the stored record.
  assert.throws(() => {
    nested.intensity = 1;
  });
  assert.equal(nested.intensity, 0.7);
});

test('clone-then-freeze ownership: caller-owned node objects are never frozen or retained', async () => {
  const { graphs } = await setup();
  const callerNode = node('clip-1', 'clip', [V1], { intensity: 0.7 });
  const callerArtifact = callerNode.inputs[0] as ArtifactRef;
  const graph = asGraph(
    await graphs.createTransformGraph({
      scope: scopeOf('tenant-a'),
      id: graphId('graph.own'),
      nodes: [callerNode],
    }),
  );
  assert.equal(Object.isFrozen(callerNode), false);
  assert.equal(Object.isFrozen(callerNode.inputs), false);
  assert.equal(Object.isFrozen(callerArtifact), false);
  // Mutating the caller's data after creation cannot rewrite history.
  (callerNode as { nodeId: string }).nodeId = 'renamed';
  (callerNode.inputs as ArtifactRef[]).push(V2);
  (callerNode.parameterization as Record<string, unknown>).intensity = 1;
  const stored = graph.nodes[0] as TransformApplicationNode;
  assert.equal(stored.nodeId, 'clip-1');
  assert.equal(stored.inputs.length, 1);
  assert.equal((stored.parameterization as { intensity: number }).intensity, 0.7);
});
