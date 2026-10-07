import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ArtifactRef, Version } from '@mos/contracts';
import { createInMemoryTransformDefinitionRegistry } from './in-memory-transform-definition-registry.js';
import { createInMemoryTransformGraph } from './in-memory-transform-graph.js';
import type {
  TransformDefinitionRegistry,
  TransformKind,
} from '../contracts/transform-definition.js';
import type {
  TransformApplicationNode,
  TransformGraph,
  TransformGraphError,
  TransformGraphId,
  TransformGraphPort,
  TransformGraphValidation,
  TransformGraphValidationFailure,
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
type ValidateResult = Awaited<ReturnType<TransformGraphPort['validateTransformGraph']>>;

const asGraph = (result: CreateResult): TransformGraph => {
  if ('error' in result) {
    assert.fail(`unexpected graph error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asValidation = (result: ValidateResult): TransformGraphValidation => {
  if ('error' in result) {
    assert.fail(`unexpected validation error: ${result.error} — ${result.message}`);
  }
  return result;
};

const graphId = (value: string): TransformGraphId => value as TransformGraphId;

const node = (
  nodeId: string,
  kind: TransformKind,
  inputs: readonly ArtifactRef[] = [],
): TransformApplicationNode => ({
  nodeId,
  definitionId: definitionIdOf(kind),
  definitionVersion: 1 as Version,
  inputs: [...inputs],
  parameterization: {},
});

const edge = (edgeId: string, fromNodeId: string, toNodeId: string) => ({
  edgeId,
  fromNodeId,
  toNodeId,
});

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
const AU1 = artifactRef('au1', { type: 'audio/mpeg' });
const IM1 = artifactRef('im1', { type: 'image/png' });
const TX1 = artifactRef('tx1', { type: 'text/plain' });

const createGraph = (
  graphs: TransformGraphPort,
  id: string,
  nodes: readonly TransformApplicationNode[],
  edges: readonly { edgeId: string; fromNodeId: string; toNodeId: string }[] = [],
): Promise<CreateResult> =>
  graphs.createTransformGraph({
    scope: scopeOf('tenant-a'),
    id: graphId(id),
    nodes: [...nodes],
    edges: [...edges],
  });

const failuresOf = (result: ValidateResult): readonly TransformGraphValidationFailure[] => {
  const validation = asValidation(result);
  assert.equal(validation.valid, validation.failures.length === 0);
  return validation.failures;
};

const codesOf = (failures: readonly TransformGraphValidationFailure[]): readonly string[] =>
  failures.map((failure) => failure.code);

// ---------------------------------------------------------------------------
// Valid graphs: composites + all thirteen kinds
// ---------------------------------------------------------------------------

test('a multi-node composite graph validates valid (structural + constraint)', async () => {
  const { graphs } = await setup();
  asGraph(
    await createGraph(
      graphs,
      'graph.composite',
      [
        node('clip-1', 'clip', [V1]),
        node('clip-2', 'clip', [V2]),
        node('compilation', 'compilation'),
        node('repost', 'no-op-repost'),
      ],
      [edge('e1', 'clip-1', 'compilation'), edge('e2', 'clip-2', 'compilation'), edge('e3', 'compilation', 'repost')],
    ),
  );
  const validation = asValidation(
    await graphs.validateTransformGraph(scopeOf('tenant-a'), graphId('graph.composite')),
  );
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.failures, []);
  assert.equal(validation.graphVersion, 1);
});

test('all thirteen frozen kinds are validatable within one graph', async () => {
  const { graphs } = await setup();
  const nodes: readonly TransformApplicationNode[] = [
    node('clip', 'clip', [V1]),
    node('crop', 'crop-reframe', [V1]),
    node('remix', 'remix', [V1, V2]),
    node('compilation', 'compilation'),
    node('reaction', 'reaction', [V1, V2]),
    node('podcast', 'podcast', [V1, AU1]),
    node('translation', 'translation-dubbing', [V1]),
    node('voiceover', 'voiceover', [V1]),
    node('stylization', 'stylization-anime', [IM1]),
    node('ai-generated', 'ai-generated'),
    node('human-contribution', 'human-contribution', [TX1]),
    node('hybrid', 'hybrid', [AU1]),
    node('repost', 'no-op-repost', [V1]),
  ];
  const edges = [
    edge('e-clip', 'clip', 'compilation'),
    edge('e-crop', 'crop', 'compilation'),
    edge('e-hybrid', 'compilation', 'hybrid'),
  ];
  asGraph(await createGraph(graphs, 'graph.thirteen', nodes, edges));
  const validation = asValidation(
    await graphs.validateTransformGraph(scopeOf('tenant-a'), graphId('graph.thirteen')),
  );
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.failures, []);
  const graph = await graphs.getTransformGraph(scopeOf('tenant-a'), graphId('graph.thirteen'));
  assert.equal(graph?.nodes.length, 13);
});

// ---------------------------------------------------------------------------
// No-op/repost first-class: identical validation machinery
// ---------------------------------------------------------------------------

test('no-op/repost validates through the same constraint machinery (never special-cased)', async () => {
  const { graphs } = await setup();
  // A no-op node over a satisfying artifact is valid.
  asGraph(await createGraph(graphs, 'graph.noop-ok', [node('repost', 'no-op-repost', [V1])]));
  const ok = asValidation(
    await graphs.validateTransformGraph(scopeOf('tenant-a'), graphId('graph.noop-ok')),
  );
  assert.equal(ok.valid, true);
  // The SAME named-constraint failures any other kind produces: a no-op over
  // a text artifact is a type+modality mismatch; a no-op over an artifact
  // without rights context is an input-rights-missing failure (reposting
  // requires rights).
  asGraph(
    await createGraph(graphs, 'graph.noop-text', [node('repost', 'no-op-repost', [TX1])]),
  );
  const textFailures = failuresOf(
    await graphs.validateTransformGraph(scopeOf('tenant-a'), graphId('graph.noop-text')),
  );
  assert.deepEqual(codesOf(textFailures), ['input-type-mismatch', 'input-modality-mismatch']);
  assert.ok(textFailures.every((failure) => failure.constraintName === 'repost-source'));
  const blankRights = artifactRef('norights', { rightsRef: '' });
  asGraph(
    await createGraph(graphs, 'graph.noop-rights', [node('repost', 'no-op-repost', [blankRights])]),
  );
  const rightsFailures = failuresOf(
    await graphs.validateTransformGraph(scopeOf('tenant-a'), graphId('graph.noop-rights')),
  );
  assert.deepEqual(codesOf(rightsFailures), ['input-rights-missing']);
  assert.equal(rightsFailures[0]?.constraintName, 'repost-source');
});

// ---------------------------------------------------------------------------
// Named-constraint typed failures
// ---------------------------------------------------------------------------

test('type mismatch fails typed with the named constraint', async () => {
  const { graphs } = await setup();
  asGraph(await createGraph(graphs, 'graph.type', [node('clip-1', 'clip', [TX1])]));
  const failures = failuresOf(
    await graphs.validateTransformGraph(scopeOf('tenant-a'), graphId('graph.type')),
  );
  assert.deepEqual(codesOf(failures), ['input-type-mismatch', 'input-modality-mismatch']);
  for (const failure of failures) {
    assert.equal(failure.nodeId, 'clip-1');
    assert.equal(failure.constraintName, 'source-video');
  }
  assert.match(failures[0]?.message ?? '', /text\/plain/);
});

test('modality mismatch fires when the declared type is accepted but the modality is not', async () => {
  const { registry, graphs } = await setup();
  const registered = await registry.registerTransformDefinition(
    definitionInputOf('clip', 'tenant-a', {
      id: 'transform.modality-probe' as never,
      constraint: {
        name: 'video-only-despite-pdf',
        acceptedTypes: ['video/mp4', 'application/pdf'],
        acceptedModalities: ['video'],
      },
    }),
  );
  assert.ok(!('error' in registered));
  const pdf = artifactRef('pdf', { type: 'application/pdf' });
  asGraph(
    await createGraph(graphs, 'graph.modality', [
      { ...node('probe', 'clip', [pdf]), definitionId: 'transform.modality-probe' as never },
    ]),
  );
  const failures = failuresOf(
    await graphs.validateTransformGraph(scopeOf('tenant-a'), graphId('graph.modality')),
  );
  assert.deepEqual(codesOf(failures), ['input-modality-mismatch']);
  assert.equal(failures[0]?.constraintName, 'video-only-despite-pdf');
});

test('upstream output type mismatch names the upstream node and definition', async () => {
  const { registry, graphs } = await setup();
  const textSource = await registry.registerTransformDefinition(
    definitionInputOf('clip', 'tenant-a', {
      id: 'transform.text-source' as never,
      constraint: { name: 'text-brief', acceptedTypes: ['text/plain'], acceptedModalities: ['text'] },
      outputContract: { outputTypes: ['text/plain'] },
    }),
  );
  assert.ok(!('error' in textSource));
  asGraph(
    await createGraph(
      graphs,
      'graph.upstream',
      [
        { ...node('brief', 'clip', [TX1]), definitionId: 'transform.text-source' as never },
        node('video-consumer', 'clip'),
      ],
      [edge('e-flow', 'brief', 'video-consumer')],
    ),
  );
  const failures = failuresOf(
    await graphs.validateTransformGraph(scopeOf('tenant-a'), graphId('graph.upstream')),
  );
  // The downstream video-only constraint rejects the upstream's declared
  // text output on both type and modality.
  assert.deepEqual(codesOf(failures), ['input-type-mismatch', 'input-modality-mismatch']);
  for (const failure of failures) {
    assert.equal(failure.nodeId, 'video-consumer');
    assert.equal(failure.constraintName, 'source-video');
    assert.match(failure.message, /brief/);
  }
});

test('input-count-below-minimum fires when a compilation consumes a single upstream output', async () => {
  const { graphs } = await setup();
  asGraph(
    await createGraph(
      graphs,
      'graph.under',
      [node('clip-1', 'clip', [V1]), node('compilation', 'compilation')],
      [edge('e1', 'clip-1', 'compilation')],
    ),
  );
  const failures = failuresOf(
    await graphs.validateTransformGraph(scopeOf('tenant-a'), graphId('graph.under')),
  );
  assert.deepEqual(codesOf(failures), ['input-count-below-minimum']);
  assert.equal(failures[0]?.nodeId, 'compilation');
  assert.equal(failures[0]?.constraintName, 'compilation-sources');
});

test('input-count-above-maximum fires when external inputs plus artifact flow exceed the bound', async () => {
  const { graphs } = await setup();
  asGraph(
    await createGraph(
      graphs,
      'graph.over',
      [node('clip-1', 'clip', [V1]), node('reaction', 'reaction', [V1, V2])],
      [edge('e1', 'clip-1', 'reaction')],
    ),
  );
  const failures = failuresOf(
    await graphs.validateTransformGraph(scopeOf('tenant-a'), graphId('graph.over')),
  );
  assert.deepEqual(codesOf(failures), ['input-count-above-maximum']);
  assert.equal(failures[0]?.nodeId, 'reaction');
  assert.equal(failures[0]?.constraintName, 'reaction-inputs');
});

test('multiple violating nodes are reported together, each failure named', async () => {
  const { graphs } = await setup();
  asGraph(
    await createGraph(graphs, 'graph.multi', [
      node('clip-text', 'clip', [TX1]),
      node('compilation', 'compilation'),
    ]),
  );
  const failures = failuresOf(
    await graphs.validateTransformGraph(scopeOf('tenant-a'), graphId('graph.multi')),
  );
  // clip over text: type + modality; compilation with zero inputs: below min.
  assert.deepEqual(codesOf(failures), [
    'input-type-mismatch',
    'input-modality-mismatch',
    'input-count-below-minimum',
  ]);
  assert.equal(failures[2]?.nodeId, 'compilation');
});

// ---------------------------------------------------------------------------
// Per-version + exact-definition-version validation semantics
// ---------------------------------------------------------------------------

test('validation is per graph version: a violating append cannot poison v1', async () => {
  const { graphs } = await setup();
  asGraph(
    await createGraph(graphs, 'graph.versions', [node('clip-1', 'clip', [V1])]),
  );
  const v1Valid = asValidation(
    await graphs.validateTransformGraph(scopeOf('tenant-a'), graphId('graph.versions')),
  );
  assert.equal(v1Valid.valid, true);
  asGraph(
    await graphs.appendToTransformGraph({
      scope: scopeOf('tenant-a'),
      graphId: graphId('graph.versions'),
      nodes: [node('clip-bad', 'clip', [TX1])],
    }),
  );
  const v1Still = asValidation(
    await graphs.validateTransformGraph(scopeOf('tenant-a'), graphId('graph.versions'), 1),
  );
  assert.equal(v1Still.valid, true);
  assert.equal(v1Still.graphVersion, 1);
  const v2 = asValidation(
    await graphs.validateTransformGraph(scopeOf('tenant-a'), graphId('graph.versions'), 2),
  );
  assert.equal(v2.valid, false);
  assert.equal(v2.graphVersion, 2);
  const latest = asValidation(
    await graphs.validateTransformGraph(scopeOf('tenant-a'), graphId('graph.versions')),
  );
  assert.equal(latest.valid, false);
});

test('each node validates against the definition version it cites (exact-version semantics)', async () => {
  const { registry, graphs } = await setup();
  // v1 of the clip definition accepts video only.
  asGraph(await createGraph(graphs, 'graph.pinned', [node('clip-v1', 'clip', [V1])]));
  // Revise the definition: v2 accepts audio only.
  const revised = await registry.reviseTransformDefinition(
    definitionInputOf('clip', 'tenant-a', {
      constraint: { name: 'audio-only-now', acceptedTypes: ['audio/mpeg'], acceptedModalities: ['audio'] },
    }),
  );
  assert.ok(!('error' in revised));
  // The graph cites v1 — it stays valid against the v1 constraints even
  // though the latest definition version says audio only.
  const stillValid = asValidation(
    await graphs.validateTransformGraph(scopeOf('tenant-a'), graphId('graph.pinned')),
  );
  assert.equal(stillValid.valid, true);
  // A node citing v2 over a video artifact validates against v2 (audio
  // only) and fails with the v2 constraint named.
  asGraph(
    await graphs.appendToTransformGraph({
      scope: scopeOf('tenant-a'),
      graphId: graphId('graph.pinned'),
      nodes: [{ ...node('clip-v2', 'clip', [V1]), definitionVersion: 2 as Version }],
    }),
  );
  const mixed = failuresOf(
    await graphs.validateTransformGraph(scopeOf('tenant-a'), graphId('graph.pinned')),
  );
  assert.deepEqual(codesOf(mixed), ['input-type-mismatch', 'input-modality-mismatch']);
  assert.equal(mixed[0]?.nodeId, 'clip-v2');
  assert.equal(mixed[0]?.constraintName, 'audio-only-now');
  // The v1 node produced no failure.
  assert.ok(mixed.every((failure) => failure.nodeId === 'clip-v2'));
});

// ---------------------------------------------------------------------------
// Operational failures
// ---------------------------------------------------------------------------

test('validateTransformGraph fails typed on unknown graph and unresolvable version', async () => {
  const { graphs } = await setup();
  asGraph(await createGraph(graphs, 'graph.known', [node('clip-1', 'clip', [V1])]));
  const unknownGraph = await graphs.validateTransformGraph(
    scopeOf('tenant-a'),
    graphId('graph.never'),
  );
  assert.ok('error' in unknownGraph);
  assert.equal((unknownGraph as TransformGraphError).error, 'graph-not-found');
  const missingVersion = await graphs.validateTransformGraph(
    scopeOf('tenant-a'),
    graphId('graph.known'),
    9,
  );
  assert.ok('error' in missingVersion);
  assert.equal((missingVersion as TransformGraphError).error, 'graph-not-found');
  assert.match((missingVersion as TransformGraphError).message, /@9/);
});
