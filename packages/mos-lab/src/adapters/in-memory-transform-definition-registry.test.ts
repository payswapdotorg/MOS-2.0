import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SEED_CAPABILITY_IDS } from '@mos/capabilities';
import { assertRequiredFields } from '@mos/contracts';
import { createInMemoryTransformDefinitionRegistry } from './in-memory-transform-definition-registry.js';
import type {
  TransformDefinition,
  TransformDefinitionError,
  TransformDefinitionRegistry,
} from '../contracts/transform-definition.js';
import {
  FIXED_NOW,
  THIRTEEN_KINDS,
  definitionIdOf,
  definitionInputOf,
  scopeOf,
} from '../testing/w5a-transform-fixtures.js';

type RegisterResult = Awaited<ReturnType<TransformDefinitionRegistry['registerTransformDefinition']>>;

const asRecord = (result: RegisterResult): TransformDefinition => {
  if ('error' in result) {
    assert.fail(`unexpected definition error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asError = (result: RegisterResult): TransformDefinitionError => {
  assert.ok('error' in result, `expected a typed failure, got a record: ${String(result)}`);
  return result;
};

const seededRegistry = (): TransformDefinitionRegistry =>
  createInMemoryTransformDefinitionRegistry({ now: FIXED_NOW });

// ---------------------------------------------------------------------------
// The thirteen frozen kinds are definable
// ---------------------------------------------------------------------------

test('all thirteen frozen §5 kinds register as versioned definitions', async () => {
  const registry = seededRegistry();
  const kinds: string[] = [];
  for (const kind of THIRTEEN_KINDS) {
    const record = asRecord(
      await registry.registerTransformDefinition(definitionInputOf(kind)),
    );
    assert.equal(record.version, 1);
    assert.equal(record.kind, kind);
    assert.equal(record.tenantId, scopeOf('tenant-a').tenantId);
    assert.equal(record.id, definitionIdOf(kind));
    kinds.push(record.kind);
  }
  assert.equal(kinds.length, 13);
  assert.deepEqual(
    [...kinds].sort(),
    [
      'ai-generated',
      'clip',
      'compilation',
      'crop-reframe',
      'human-contribution',
      'hybrid',
      'no-op-repost',
      'podcast',
      'reaction',
      'remix',
      'stylization-anime',
      'translation-dubbing',
      'voiceover',
    ],
  );
  const listed = await registry.listTransformDefinitions(scopeOf('tenant-a'));
  assert.equal(listed.length, 13);
});

test('every stored definition satisfies the frozen Transform core contract (required fields)', async () => {
  const registry = seededRegistry();
  for (const kind of THIRTEEN_KINDS) {
    const record = asRecord(await registry.registerTransformDefinition(definitionInputOf(kind)));
    // Cross-checked against spec/contracts/core-contracts-v2.0.yaml via the
    // contracts package's frozen required-field index.
    assertRequiredFields(record, 'Transform');
  }
});

test('inputTypes/outputTypes are derived from the declared constraints by construction', async () => {
  const registry = seededRegistry();
  const clip = asRecord(await registry.registerTransformDefinition(definitionInputOf('clip')));
  assert.deepEqual(clip.inputTypes, ['video/mp4']);
  assert.deepEqual(clip.outputTypes, ['video/mp4']);
  // The hybrid kind declares four output types — derived sorted and unique.
  const hybrid = asRecord(await registry.registerTransformDefinition(definitionInputOf('hybrid')));
  assert.deepEqual(hybrid.inputTypes, [
    'audio/mpeg',
    'image/png',
    'text/plain',
    'video/mp4',
  ]);
  assert.deepEqual(hybrid.outputTypes, [
    'audio/mpeg',
    'image/png',
    'text/plain',
    'video/mp4',
  ]);
  // Sorted/de-duplicated even when declared unordered with duplicates.
  const stylization = asRecord(
    await registry.registerTransformDefinition(
      definitionInputOf('stylization-anime', 'tenant-a', {
        constraint: { acceptedTypes: ['image/png', 'video/mp4', 'image/png'] },
      }),
    ),
  );
  assert.deepEqual(stylization.inputTypes, ['image/png', 'video/mp4']);
});

// ---------------------------------------------------------------------------
// No-op/repost is first-class (lock rule 5)
// ---------------------------------------------------------------------------

test('no-op/repost is a REAL first-class definition with ZERO capability requirements', async () => {
  const registry = seededRegistry();
  const noop = asRecord(await registry.registerTransformDefinition(definitionInputOf('no-op-repost')));
  assert.equal(noop.kind, 'no-op-repost');
  assert.equal(noop.capabilityRequirements.length, 0);
  // A real constraint and a real output contract — not a wildcard stub.
  assert.equal(noop.inputConstraint.name, 'repost-source');
  assert.deepEqual(noop.inputConstraint.acceptedTypes, ['video/mp4', 'audio/mpeg']);
  assert.equal(noop.inputConstraint.requiresRights, true);
  assert.deepEqual(noop.outputContract.outputTypes, ['video/mp4', 'audio/mpeg']);
  assert.equal(noop.outputContract.outputCount, 1);
  assert.equal(noop.humanParticipation, false);
  // ZERO capability requirements is a valid declared state for ANY kind —
  // the human-contribution fixture (human is the executor) declares none too.
  const human = asRecord(
    await registry.registerTransformDefinition(definitionInputOf('human-contribution')),
  );
  assert.equal(human.capabilityRequirements.length, 0);
  assert.equal(human.humanParticipation, true);
});

test('capability requirements resolve through the @mos/capabilities seed vocabulary', async () => {
  const registry = seededRegistry();
  for (const kind of THIRTEEN_KINDS) {
    const record = asRecord(await registry.registerTransformDefinition(definitionInputOf(kind)));
    for (const requirement of record.capabilityRequirements) {
      assert.ok(
        SEED_CAPABILITY_IDS.includes(requirement.capabilityId),
        `requirement ${String(requirement.capabilityId)} (${kind}) must be a real seed-catalog capability id`,
      );
      assert.equal(requirement.version, 1);
    }
  }
  // Spot check a real mapping: clip declares scene detection + clip ranking.
  const clip = await registry.getTransformDefinition(scopeOf('tenant-a'), definitionIdOf('clip'));
  assert.ok(clip !== null);
  assert.deepEqual(
    clip.capabilityRequirements.map((requirement) => String(requirement.capabilityId)),
    ['detect_scenes', 'rank_clip_candidates'],
  );
});

// ---------------------------------------------------------------------------
// Typed failures
// ---------------------------------------------------------------------------

test('unknown transform kind fails typed with the frozen vocabulary named', async () => {
  const registry = seededRegistry();
  // Simulate a non-frozen kind arriving at the registry (cast — the type
  // union is compile-time; the registry must fail closed at runtime).
  const teleportInput = {
    ...definitionInputOf('clip'),
    kind: 'teleport' as never,
    id: 'transform.teleport' as never,
  };
  const teleport = asError(await registry.registerTransformDefinition(teleportInput));
  assert.equal(teleport.error, 'unknown-transform-kind');
  assert.match(teleport.message, /frozen §5 thirteen kinds/);
  assert.match(teleport.message, /teleport/);
  // Nothing was stored.
  assert.equal(
    await registry.getTransformDefinition(scopeOf('tenant-a'), 'transform.teleport' as never),
    null,
  );
});

test('human-contribution and hybrid must declare human participation explicitly', async () => {
  const registry = seededRegistry();
  for (const kind of ['human-contribution', 'hybrid'] as const) {
    const failure = asError(
      await registry.registerTransformDefinition(
        definitionInputOf(kind, 'tenant-a', { humanParticipation: false }),
      ),
    );
    assert.equal(failure.error, 'human-participation-required');
    assert.match(failure.message, new RegExp(kind));
  }
});

test('malformed declarations fail closed with invalid-input', async () => {
  const registry = seededRegistry();
  const cases: readonly [string, Record<string, unknown>][] = [
    ['blank id', { id: '   ' }],
    ['blank constraint name', { inputConstraint: { name: ' ' } }],
    ['empty acceptedTypes', { inputConstraint: { acceptedTypes: [] } }],
    ['bad modality label', { inputConstraint: { acceptedModalities: ['vibe'] } }],
    ['min above max', { inputConstraint: { minInputs: 3, maxInputs: 2 } }],
    ['empty outputTypes', { outputContract: { outputTypes: [] } }],
    ['zero outputCount', { outputContract: { outputCount: 0 } }],
    ['parameters not an object', { parameters: ['not-an-object'] }],
    ['malformed capability requirement', { capabilityRequirements: [{ capabilityId: 'x' }] }],
    ['bad cost basis', { costModel: { basis: 'per-vibe', amount: 1, currency: 'USD' } }],
    ['negative latency', { latencyModel: { p50Ms: -1, p95Ms: 2, p99Ms: 3 } }],
    ['blank lineage rule', { lineageRules: [' '] }],
  ];
  for (const [label, patch] of cases) {
    const input = { ...definitionInputOf('clip'), ...patch } as never;
    const failure = asError(await registry.registerTransformDefinition(input));
    assert.equal(failure.error, 'invalid-input', `case: ${label}`);
    assert.ok(failure.message.length > 0, `case ${label} must carry a message`);
  }
});

test('duplicate definition id fails typed within the tenant scope', async () => {
  const registry = seededRegistry();
  asRecord(await registry.registerTransformDefinition(definitionInputOf('clip')));
  const failure = asError(await registry.registerTransformDefinition(definitionInputOf('clip')));
  assert.equal(failure.error, 'duplicate-definition');
  assert.match(failure.message, /transform\.clip/);
});

// ---------------------------------------------------------------------------
// Versioned append-only corrections
// ---------------------------------------------------------------------------

test('revision appends version + 1 and v1 stays bit-for-bit immutable + resolvable', async () => {
  const registry = seededRegistry();
  const v1 = asRecord(await registry.registerTransformDefinition(definitionInputOf('clip')));
  const v1Snapshot = structuredClone(v1);
  const revisedInput = definitionInputOf('clip', 'tenant-a', {
    constraint: { minInputs: 1, maxInputs: 3, name: 'remixable-source' },
  });
  const v2 = asRecord(await registry.reviseTransformDefinition(revisedInput));
  assert.equal(v2.version, 2);
  assert.equal(v2.inputConstraint.name, 'remixable-source');
  assert.equal(v2.inputConstraint.maxInputs, 3);
  // v1 is resolvable bit-for-bit (deep equal to the pre-revision snapshot).
  const v1Again = await registry.getTransformDefinition(scopeOf('tenant-a'), definitionIdOf('clip'), 1);
  assert.ok(v1Again !== null);
  assert.deepEqual(v1Again, v1Snapshot);
  assert.equal(v1Again.inputConstraint.name, 'source-video');
  // Latest resolution returns v2 — never a silent fallback of v1.
  const latest = await registry.getTransformDefinition(scopeOf('tenant-a'), definitionIdOf('clip'));
  assert.equal(latest?.version, 2);
});

test('revision of an unknown definition fails typed', async () => {
  const registry = seededRegistry();
  const failure = asError(
    await registry.reviseTransformDefinition(
      definitionInputOf('clip', 'tenant-a', { id: 'transform.never-registered' as never }),
    ),
  );
  assert.equal(failure.error, 'definition-not-found');
});

// ---------------------------------------------------------------------------
// Exact-version resolution
// ---------------------------------------------------------------------------

test('exact-version resolution: missing version and unknown id both return null', async () => {
  const registry = seededRegistry();
  asRecord(await registry.registerTransformDefinition(definitionInputOf('clip')));
  const v2 = asRecord(
    await registry.reviseTransformDefinition(definitionInputOf('clip')),
  );
  assert.equal(v2.version, 2);
  assert.equal(await registry.getTransformDefinition(scopeOf('tenant-a'), definitionIdOf('clip'), 3), null);
  assert.equal(await registry.getTransformDefinition(scopeOf('tenant-a'), definitionIdOf('clip'), 99), null);
  assert.equal(
    await registry.getTransformDefinition(scopeOf('tenant-a'), 'transform.unknown' as never, 1),
    null,
  );
});

// ---------------------------------------------------------------------------
// Tenant scoping (no existence leaks)
// ---------------------------------------------------------------------------

test('definitions are tenant-scoped: same id per tenant, no cross-tenant reads', async () => {
  const registry = seededRegistry();
  const forA = asRecord(await registry.registerTransformDefinition(definitionInputOf('clip', 'tenant-a')));
  const forB = asRecord(await registry.registerTransformDefinition(definitionInputOf('clip', 'tenant-b')));
  assert.equal(forA.tenantId, scopeOf('tenant-a').tenantId);
  assert.equal(forB.tenantId, scopeOf('tenant-b').tenantId);
  // Each tenant resolves its own chain; unknown and cross-tenant are
  // indistinguishable on reads (null both ways).
  assert.equal(await registry.getTransformDefinition(scopeOf('tenant-c'), definitionIdOf('clip')), null);
  const listedA = await registry.listTransformDefinitions(scopeOf('tenant-a'));
  const listedB = await registry.listTransformDefinitions(scopeOf('tenant-b'));
  assert.equal(listedA.length, 1);
  assert.equal(listedB.length, 1);
  // Revising in tenant-b does not touch tenant-a's chain.
  const revisedB = asRecord(await registry.reviseTransformDefinition(definitionInputOf('clip', 'tenant-b')));
  assert.equal(revisedB.version, 2);
  const stillA = await registry.getTransformDefinition(scopeOf('tenant-a'), definitionIdOf('clip'));
  assert.equal(stillA?.version, 1);
});

test('cross-tenant revision is indistinguishable from unknown (no existence leak)', async () => {
  const registry = seededRegistry();
  asRecord(await registry.registerTransformDefinition(definitionInputOf('clip', 'tenant-a')));
  const failure = asError(
    await registry.reviseTransformDefinition(definitionInputOf('clip', 'tenant-b')),
  );
  assert.equal(failure.error, 'definition-not-found');
});

// ---------------------------------------------------------------------------
// Immutability + ownership semantics
// ---------------------------------------------------------------------------

test('stored definitions are deep-frozen immutable records', async () => {
  const registry = seededRegistry();
  const record = asRecord(await registry.registerTransformDefinition(definitionInputOf('clip')));
  assert.throws(() => {
    (record as { kind: string }).kind = 'remix';
  });
  assert.throws(() => {
    (record.inputConstraint as { name: string }).name = 'hacked';
  });
  assert.throws(() => {
    (record.capabilityRequirements as unknown[]).push({ capabilityId: 'x', version: 1 });
  });
});

test('clone-then-freeze ownership: caller-owned declaration objects are never frozen or retained', async () => {
  const registry = seededRegistry();
  const input = definitionInputOf('clip');
  const record = asRecord(await registry.registerTransformDefinition(input));
  // The caller's objects are NOT frozen in place.
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(input.inputConstraint), false);
  // Mutating the caller's data after registration cannot rewrite history.
  (input.inputConstraint as { name: string }).name = 'mutated-after-registration';
  (input.inputConstraint as { maxInputs: number }).maxInputs = 99;
  assert.equal(record.inputConstraint.name, 'source-video');
  assert.equal(record.inputConstraint.maxInputs, 1);
});

test('listTransformDefinitions returns the latest version per id in insertion order', async () => {
  const registry = seededRegistry();
  asRecord(await registry.registerTransformDefinition(definitionInputOf('clip')));
  asRecord(await registry.registerTransformDefinition(definitionInputOf('no-op-repost')));
  asRecord(await registry.reviseTransformDefinition(definitionInputOf('clip')));
  const listed = await registry.listTransformDefinitions(scopeOf('tenant-a'));
  assert.deepEqual(
    listed.map((entry) => [String(entry.id), entry.version]),
    [
      ['transform.clip', 2],
      ['transform.no-op-repost', 1],
    ],
  );
});
