import assert from 'node:assert/strict';
import { test } from 'node:test';

// TransformGraph tests (LAB-011), lifecycle half: creation, append-only
// versioning, write-time invariants, tenant scoping, exact versions.
// Lineage/subgraph/ownership half: in-memory-transform-graph-lineage.test.ts.
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
  TransformGraphError,
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
type AppendResult = Awaited<ReturnType<TransformGraphPort['appendToTransformGraph']>>;

const asGraph = (result: CreateResult | AppendResult): TransformGraph => {
  if ('error' in result) {
    assert.fail(`unexpected graph error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asError = (result: CreateResult | AppendResult): TransformGraphError => {
  assert.ok('error' in result, `expected a typed failure, got a graph: ${String(result)}`);
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
// Creation: versioned, tenant-scoped, deep-frozen composites
// ---------------------------------------------------------------------------

test('createTransformGraph creates a version-1 immutable multi-node composite', async () => {
  const { graphs } = await setup();
  const graph = asGraph(await graphs.createTransformGraph(compositeGraphInput()));
  assert.equal(graph.id, graphId('graph.composite'));
  assert.equal(graph.version, 1);
  assert.equal(graph.tenantId, scopeOf('tenant-a').tenantId);
  assert.equal(graph.nodes.length, 4);
  assert.equal(graph.edges.length, 3);
  assert.equal(graph.createdAt, FIXED_NOW());
  // Composite transforms are multi-node graphs: the compilation consumes
  // both clips through artifact flow; the no-op repost closes the chain.
  const compilation = graph.nodes.find((entry) => entry.nodeId === 'compilation');
  assert.ok(compilation !== undefined);
  assert.equal(compilation.definitionId, definitionIdOf('compilation'));
  assert.deepEqual(
    graph.edges.map((entry) => [entry.fromNodeId, entry.toNodeId]),
    [
      ['clip-1', 'compilation'],
      ['clip-2', 'compilation'],
      ['compilation', 'repost'],
    ],
  );
  // The graph record and every nested node/edge/artifact is deep-frozen.
  assert.ok(Object.isFrozen(graph));
  for (const entry of graph.nodes) {
    assert.ok(Object.isFrozen(entry));
    assert.ok(Object.isFrozen(entry.inputs));
    for (const artifact of entry.inputs) {
      assert.ok(Object.isFrozen(artifact));
    }
  }
  for (const entry of graph.edges) {
    assert.ok(Object.isFrozen(entry));
  }
});

test('createTransformGraph accepts an empty graph and grows by append-only corrections', async () => {
  const { graphs } = await setup();
  const empty = asGraph(
    await graphs.createTransformGraph({ scope: scopeOf('tenant-a'), id: graphId('graph.shell') }),
  );
  assert.equal(empty.version, 1);
  assert.equal(empty.nodes.length, 0);
  assert.equal(empty.edges.length, 0);
  const grown = asGraph(
    await graphs.appendToTransformGraph({
      scope: scopeOf('tenant-a'),
      graphId: graphId('graph.shell'),
      nodes: [node('repost', 'no-op-repost', [V1])],
    }),
  );
  assert.equal(grown.version, 2);
  assert.equal(grown.nodes.length, 1);
});

test('duplicate graph id fails typed within the tenant scope', async () => {
  const { graphs } = await setup();
  asGraph(await graphs.createTransformGraph(compositeGraphInput()));
  const failure = asError(await graphs.createTransformGraph(compositeGraphInput()));
  assert.equal(failure.error, 'duplicate-graph');
});

test('edges without nodes fail closed at creation', async () => {
  const { graphs } = await setup();
  const failure = asError(
    await graphs.createTransformGraph({
      scope: scopeOf('tenant-a'),
      id: graphId('graph.bad'),
      edges: [edge('e', 'a', 'b')],
    }),
  );
  assert.equal(failure.error, 'invalid-input');
});

// ---------------------------------------------------------------------------
// Append-only corrections: v1 bit-for-bit immutable + resolvable
// ---------------------------------------------------------------------------

test('append creates version + 1 while v1 stays bit-for-bit immutable and resolvable', async () => {
  const { graphs } = await setup();
  const v1 = asGraph(await graphs.createTransformGraph(compositeGraphInput()));
  const v1Snapshot = structuredClone(v1);
  const v2 = asGraph(
    await graphs.appendToTransformGraph({
      scope: scopeOf('tenant-a'),
      graphId: graphId('graph.composite'),
      nodes: [node('reaction', 'reaction', [V1, V2])],
      edges: [edge('e-reaction', 'repost', 'reaction')],
    }),
  );
  assert.equal(v2.version, 2);
  assert.equal(v2.nodes.length, 5);
  assert.equal(v2.edges.length, 4);
  // v1 is still resolvable at its exact version, bit-for-bit unchanged.
  const v1Again = await graphs.getTransformGraph(scopeOf('tenant-a'), graphId('graph.composite'), 1);
  assert.ok(v1Again !== null);
  assert.deepEqual(v1Again, v1Snapshot);
  assert.equal(v1Again.nodes.length, 4);
  // Latest resolution returns v2, never a silent v1 fallback.
  const latest = await graphs.getTransformGraph(scopeOf('tenant-a'), graphId('graph.composite'));
  assert.equal(latest?.version, 2);
  // Mutating the returned v2 record is impossible (append-only history).
  assert.throws(() => {
    (v2.nodes as unknown[]).push(node('smuggled', 'clip'));
  });
});

test('an edges-only append connects existing nodes without new nodes', async () => {
  const { graphs } = await setup();
  asGraph(
    await graphs.createTransformGraph({
      scope: scopeOf('tenant-a'),
      id: graphId('graph.flow'),
      nodes: [node('clip-1', 'clip', [V1]), node('compilation', 'compilation', [V2])],
    }),
  );
  // The compilation still has room for one more upstream (maxInputs 12).
  const v2 = asGraph(
    await graphs.appendToTransformGraph({
      scope: scopeOf('tenant-a'),
      graphId: graphId('graph.flow'),
      edges: [edge('e-flow', 'clip-1', 'compilation')],
    }),
  );
  assert.equal(v2.version, 2);
  assert.equal(v2.nodes.length, 2);
  assert.equal(v2.edges.length, 1);
  const flowEdge = v2.edges[0];
  assert.ok(flowEdge !== undefined);
  assert.deepEqual([flowEdge.fromNodeId, flowEdge.toNodeId], ['clip-1', 'compilation']);
});

test('append to an unknown graph and content-free appends fail typed', async () => {
  const { graphs } = await setup();
  const notFound = asError(
    await graphs.appendToTransformGraph({
      scope: scopeOf('tenant-a'),
      graphId: graphId('graph.never'),
      nodes: [node('repost', 'no-op-repost', [V1])],
    }),
  );
  assert.equal(notFound.error, 'graph-not-found');
  asGraph(await graphs.createTransformGraph(compositeGraphInput()));
  const emptyAppend = asError(
    await graphs.appendToTransformGraph({
      scope: scopeOf('tenant-a'),
      graphId: graphId('graph.composite'),
    }),
  );
  assert.equal(emptyAppend.error, 'invalid-input');
});

test('append is atomic: a rejected append leaves the version chain untouched', async () => {
  const { graphs } = await setup();
  const v1 = asGraph(await graphs.createTransformGraph(compositeGraphInput()));
  const failure = asError(
    await graphs.appendToTransformGraph({
      scope: scopeOf('tenant-a'),
      graphId: graphId('graph.composite'),
      nodes: [node('repost-2', 'no-op-repost', [V1]), node('repost-2', 'no-op-repost', [V2])],
    }),
  );
  assert.equal(failure.error, 'duplicate-node');
  const latest = await graphs.getTransformGraph(scopeOf('tenant-a'), graphId('graph.composite'));
  assert.equal(latest?.version, 1);
  assert.equal(latest?.nodes.length, v1.nodes.length);
});

// ---------------------------------------------------------------------------
// Write-time structural typed failures
// ---------------------------------------------------------------------------

test('duplicate node ids are rejected at creation and across appends', async () => {
  const { graphs } = await setup();
  const atCreation = asError(
    await graphs.createTransformGraph({
      scope: scopeOf('tenant-a'),
      id: graphId('graph.dup'),
      nodes: [node('clip-1', 'clip', [V1]), node('clip-1', 'clip', [V2])],
    }),
  );
  assert.equal(atCreation.error, 'duplicate-node');
  asGraph(
    await graphs.createTransformGraph({
      scope: scopeOf('tenant-a'),
      id: graphId('graph.dup2'),
      nodes: [node('clip-1', 'clip', [V1])],
    }),
  );
  const atAppend = asError(
    await graphs.appendToTransformGraph({
      scope: scopeOf('tenant-a'),
      graphId: graphId('graph.dup2'),
      nodes: [node('clip-1', 'clip', [V2])],
    }),
  );
  assert.equal(atAppend.error, 'duplicate-node');
});

test('duplicate edge ids and unknown edge endpoints fail typed', async () => {
  const { graphs } = await setup();
  const duplicateEdge = asError(
    await graphs.createTransformGraph({
      scope: scopeOf('tenant-a'),
      id: graphId('graph.e'),
      nodes: [node('clip-1', 'clip', [V1]), node('compilation', 'compilation')],
      edges: [edge('e1', 'clip-1', 'compilation'), edge('e1', 'clip-1', 'compilation')],
    }),
  );
  assert.equal(duplicateEdge.error, 'duplicate-edge');
  const unknownEndpoint = asError(
    await graphs.createTransformGraph({
      scope: scopeOf('tenant-a'),
      id: graphId('graph.e2'),
      nodes: [node('clip-1', 'clip', [V1])],
      edges: [edge('e1', 'clip-1', 'ghost')],
    }),
  );
  assert.equal(unknownEndpoint.error, 'unknown-node');
});

test('duplicate artifact flow between the same node pair is rejected', async () => {
  const { graphs } = await setup();
  const failure = asError(
    await graphs.createTransformGraph({
      scope: scopeOf('tenant-a'),
      id: graphId('graph.pair'),
      nodes: [node('clip-1', 'clip', [V1]), node('compilation', 'compilation')],
      edges: [edge('e1', 'clip-1', 'compilation'), edge('e2', 'clip-1', 'compilation')],
    }),
  );
  assert.equal(failure.error, 'invalid-input');
  assert.match(failure.message, /duplicate artifact flow/);
});

test('cycles in the artifact flow are rejected: self-edge, closing edge, batch cycle', async () => {
  const { graphs } = await setup();
  asGraph(
    await graphs.createTransformGraph({
      scope: scopeOf('tenant-a'),
      id: graphId('graph.cyc'),
      nodes: [node('clip-1', 'clip', [V1]), node('clip-2', 'clip', [V2])],
      edges: [edge('e1', 'clip-1', 'clip-2')],
    }),
  );
  const selfEdge = asError(
    await graphs.appendToTransformGraph({
      scope: scopeOf('tenant-a'),
      graphId: graphId('graph.cyc'),
      edges: [edge('e-self', 'clip-1', 'clip-1')],
    }),
  );
  assert.equal(selfEdge.error, 'artifact-flow-cycle');
  const closing = asError(
    await graphs.appendToTransformGraph({
      scope: scopeOf('tenant-a'),
      graphId: graphId('graph.cyc'),
      edges: [edge('e-back', 'clip-2', 'clip-1')],
    }),
  );
  assert.equal(closing.error, 'artifact-flow-cycle');
  assert.match(closing.message, /DAG/);
  // A cycle entirely inside one append batch is also rejected.
  const batch = asError(
    await graphs.createTransformGraph({
      scope: scopeOf('tenant-a'),
      id: graphId('graph.cyc2'),
      nodes: [node('clip-1', 'clip', [V1]), node('clip-2', 'clip', [V2])],
      edges: [edge('e1', 'clip-1', 'clip-2'), edge('e2', 'clip-2', 'clip-1')],
    }),
  );
  assert.equal(batch.error, 'artifact-flow-cycle');
});

test('nodes citing unknown definitions or unresolvable versions fail typed', async () => {
  const { graphs } = await setup();
  const unknownDefinition = asError(
    await graphs.createTransformGraph({
      scope: scopeOf('tenant-a'),
      id: graphId('graph.def'),
      nodes: [
        {
          ...node('mystery', 'clip', [V1]),
          definitionId: 'transform.mystery' as never,
        },
      ],
    }),
  );
  assert.equal(unknownDefinition.error, 'unknown-transform-definition');
  const versionMismatch = asError(
    await graphs.createTransformGraph({
      scope: scopeOf('tenant-a'),
      id: graphId('graph.def2'),
      nodes: [{ ...node('future-clip', 'clip', [V1]), definitionVersion: 2 as Version }],
    }),
  );
  assert.equal(versionMismatch.error, 'transform-definition-version-mismatch');
  assert.match(versionMismatch.message, /latest is version 1/);
});

test('external artifact refs from another tenant fail closed', async () => {
  const { graphs } = await setup();
  const foreign = artifactRef('foreign', { tenant: 'tenant-b' });
  const failure = asError(
    await graphs.createTransformGraph({
      scope: scopeOf('tenant-a'),
      id: graphId('graph.x'),
      nodes: [node('clip-1', 'clip', [foreign])],
    }),
  );
  assert.equal(failure.error, 'cross-tenant-reference');
  assert.match(failure.message, /tenant-b/);
});

test('malformed nodes and artifact refs fail closed with invalid-input', async () => {
  const { graphs } = await setup();
  const malformed: readonly [string, Record<string, unknown>][] = [
    ['blank node id', { nodeId: ' ' }],
    ['missing definition version', { definitionVersion: undefined }],
    ['inputs not an array', { inputs: 'nope' }],
    ['artifact ref missing digest', { inputs: [{ ...V1, digest: '' }] }],
    ['artifact ref missing tenant', { inputs: [{ ...V1, tenantId: ' ' }] }],
    ['parameterization not an object', { parameterization: [] }],
  ];
  for (const [label, patch] of malformed) {
    const input = {
      scope: scopeOf('tenant-a'),
      id: graphId(`graph.malformed-${label.replace(/\W+/g, '-')}`),
      nodes: [{ ...node('clip-1', 'clip', [V1]), ...patch } as never],
    };
    const failure = asError(await graphs.createTransformGraph(input));
    assert.equal(failure.error, 'invalid-input', `case: ${label}`);
  }
});

// ---------------------------------------------------------------------------
// Tenant scoping + exact-version resolution
// ---------------------------------------------------------------------------

test('graphs are tenant-scoped with no existence leaks across tenants', async () => {
  const { graphs, registry } = await setup();
  // Tenant-b gets its own no-op definition (definitions are tenant-scoped).
  const seededForB = await registry.registerTransformDefinition(
    definitionInputOf('no-op-repost', 'tenant-b'),
  );
  assert.ok(!('error' in seededForB));
  asGraph(await graphs.createTransformGraph(compositeGraphInput()));
  // Cross-tenant reads are indistinguishable from unknown ids (null both ways).
  const crossTenant = await graphs.getTransformGraph(scopeOf('tenant-b'), graphId('graph.composite'));
  const unknown = await graphs.getTransformGraph(scopeOf('tenant-a'), graphId('graph.never'));
  assert.equal(crossTenant, null);
  assert.equal(unknown, null);
  // Operations from another tenant fail closed as graph-not-found.
  const append = asError(
    await graphs.appendToTransformGraph({
      scope: scopeOf('tenant-b'),
      graphId: graphId('graph.composite'),
      nodes: [node('repost', 'no-op-repost', [V2])],
    }),
  );
  assert.equal(append.error, 'graph-not-found');
  const validate = await graphs.validateTransformGraph(scopeOf('tenant-b'), graphId('graph.composite'));
  assert.ok('error' in validate && validate.error === 'graph-not-found');
  const trace = await graphs.traceArtifactLineage(
    scopeOf('tenant-b'),
    graphId('graph.composite'),
    { artifactId: V1.artifactId, version: V1.version },
  );
  assert.ok('error' in trace && trace.error === 'graph-not-found');
  // The same graph id is available in tenant-b's own namespace.
  const forB = asGraph(
    await graphs.createTransformGraph({
      scope: scopeOf('tenant-b'),
      id: graphId('graph.composite'),
      nodes: [node('repost', 'no-op-repost', [artifactRef('b1', { tenant: 'tenant-b' })])],
    }),
  );
  assert.equal(forB.tenantId, scopeOf('tenant-b').tenantId);
});

test('exact-version resolution: versions beyond the chain return null', async () => {
  const { graphs } = await setup();
  asGraph(await graphs.createTransformGraph(compositeGraphInput()));
  asGraph(
    await graphs.appendToTransformGraph({
      scope: scopeOf('tenant-a'),
      graphId: graphId('graph.composite'),
      nodes: [node('reaction', 'reaction', [V1, V2])],
    }),
  );
  assert.equal(await graphs.getTransformGraph(scopeOf('tenant-a'), graphId('graph.composite'), 3), null);
  const v1 = await graphs.getTransformGraph(scopeOf('tenant-a'), graphId('graph.composite'), 1);
  const v2 = await graphs.getTransformGraph(scopeOf('tenant-a'), graphId('graph.composite'), 2);
  assert.equal(v1?.nodes.length, 4);
  assert.equal(v2?.nodes.length, 5);
});
