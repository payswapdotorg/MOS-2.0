import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TransformCandidate, TransformCandidateId } from '../contracts/transform-candidate.js';
import type { TransformDiscoveryError, TransformDiscoveryPort } from '../contracts/transform-discovery.js';
import {
  FIXED_NOW,
  definitionIdOf,
  scopeOf,
} from '../testing/w5a-transform-fixtures.js';
import {
  composedCandidateInput,
  discoveryStack,
  discoveredCandidateInput,
  knownCandidateInput,
  type DiscoveryStack,
} from '../testing/w6a-lab-fixtures.js';

type ProposeResult = Awaited<ReturnType<TransformDiscoveryPort['proposeTransformCandidate']>>;

const asRecord = (result: ProposeResult): TransformCandidate => {
  if ('error' in result) {
    assert.fail(`unexpected discovery error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asError = (result: ProposeResult): TransformDiscoveryError => {
  assert.ok('error' in result, `expected a typed failure, got a record: ${String(result)}`);
  return result;
};

type ProposeInput = Parameters<TransformDiscoveryPort['proposeTransformCandidate']>[0];

const propose = (
  discovery: TransformDiscoveryPort,
  input: ProposeInput,
): Promise<ProposeResult> => discovery.proposeTransformCandidate(input);

// ---------------------------------------------------------------------------
// KNOWN candidates — resolution over the W5-A TransformDefinition registry
// ---------------------------------------------------------------------------

test('KNOWN candidate resolves the cited definition at its EXACT version', async () => {
  const stack = await discoveryStack();
  const candidate = asRecord(await propose(stack.discovery, knownCandidateInput()));
  assert.equal(candidate.version, 1);
  assert.equal(candidate.origin, 'known');
  assert.equal(candidate.tenantId, scopeOf('tenant-a').tenantId);
  assert.deepEqual(candidate.citation, {
    definitionId: definitionIdOf('no-op-repost'),
    definitionVersion: 1,
  });
  assert.equal(candidate.targetDefinitionId, definitionIdOf('no-op-repost'));
  assert.equal(candidate.createdAt, FIXED_NOW());
});

test('KNOWN candidate citing an unknown definition id fails closed', async () => {
  const stack = await discoveryStack();
  const input = knownCandidateInput();
  const failure = asError(
    await propose(stack.discovery, {
      ...input,
      known: { definitionId: 'transform.never-registered' as never, definitionVersion: 1 },
    }),
  );
  assert.equal(failure.error, 'unknown-cited-definition');
});

test('KNOWN candidate citing a future definition version fails closed (exact-version discipline)', async () => {
  const stack = await discoveryStack();
  const failure = asError(
    await propose(stack.discovery, {
      ...knownCandidateInput(),
      known: { definitionId: definitionIdOf('no-op-repost'), definitionVersion: 2 },
    }),
  );
  assert.equal(failure.error, 'unknown-cited-definition');
  assert.match(failure.message, /transform\.no-op-repost@2/);
});

test('KNOWN origin without a citation is invalid input', async () => {
  const stack = await discoveryStack();
  const { known: _omit, ...input } = knownCandidateInput();
  void _omit;
  const failure = asError(await propose(stack.discovery, input));
  assert.equal(failure.error, 'invalid-input');
  assert.match(failure.message, /known citation/);
});

// ---------------------------------------------------------------------------
// COMPOSED candidates — multi-node TransformGraph compositional templates
// ---------------------------------------------------------------------------

test('COMPOSED candidate freezes the graph citation PLUS its member definitions at exact versions', async () => {
  const stack = await discoveryStack();
  const candidate = asRecord(
    await propose(stack.discovery, composedCandidateInput(stack.graph.graphId, stack.graph.graphVersion)),
  );
  assert.equal(candidate.origin, 'composed');
  assert.ok(candidate.citation !== null && 'members' in candidate.citation);
  assert.equal(candidate.citation.graphId, stack.graph.graphId);
  assert.equal(candidate.citation.graphVersion, stack.graph.graphVersion);
  // Members: one entry per graph node, in graph node order (clip → reaction).
  assert.deepEqual(candidate.citation.members, [
    { definitionId: definitionIdOf('clip'), definitionVersion: 1 },
    { definitionId: definitionIdOf('reaction'), definitionVersion: 1 },
  ]);
});

test('COMPOSED candidate citing an unknown graph fails closed', async () => {
  const stack = await discoveryStack();
  const failure = asError(
    await propose(
      stack.discovery,
      composedCandidateInput('graph.never-created' as never, 1),
    ),
  );
  assert.equal(failure.error, 'unknown-cited-graph');
});

test('COMPOSED candidate citing a future graph version fails closed', async () => {
  const stack = await discoveryStack();
  const failure = asError(
    await propose(
      stack.discovery,
      composedCandidateInput(stack.graph.graphId, stack.graph.graphVersion + 1),
    ),
  );
  assert.equal(failure.error, 'unknown-cited-graph');
});

// ---------------------------------------------------------------------------
// DISCOVERED candidates — proposed contract + derivation provenance
// ---------------------------------------------------------------------------

test('DISCOVERED candidate carries its proposed contract and Idea Graph derivation provenance', async () => {
  const stack = await discoveryStack();
  const candidate = asRecord(
    await propose(stack.discovery, discoveredCandidateInput(stack.ideaNodeId)),
  );
  assert.equal(candidate.origin, 'discovered');
  assert.equal(candidate.citation, null);
  assert.deepEqual(candidate.derivation.ideaNodeIds, [stack.ideaNodeId]);
  assert.equal(candidate.derivation.provenanceRef, 'prov-candidate-proposal');
  assert.equal(candidate.proposedContract.kind, 'reaction');
  assert.equal(candidate.proposedContract.humanParticipation, false);
  assert.deepEqual(candidate.proposedContract.capabilityRequirements.map((requirement) => String(requirement.capabilityId)), [
    'segment_person',
    'compose_reaction',
    'render_timeline',
  ]);
});

test('DISCOVERED candidate with an empty derivation is rejected (candidates never float free of evidence)', async () => {
  const stack = await discoveryStack();
  const input = discoveredCandidateInput(stack.ideaNodeId);
  const failure = asError(
    await propose(stack.discovery, {
      ...input,
      derivation: { ...input.derivation, ideaNodeIds: [] },
    }),
  );
  assert.equal(failure.error, 'empty-derivation');
});

test('DISCOVERED candidate citing an unresolvable Idea Graph reference fails closed when a view is wired', async () => {
  const stack = await discoveryStack();
  const input = discoveredCandidateInput(stack.ideaNodeId);
  const failure = asError(
    await propose(stack.discovery, {
      ...input,
      derivation: { ...input.derivation, ideaNodeIds: ['idea-never-added' as never] },
    }),
  );
  assert.equal(failure.error, 'unknown-derivation-ref');
  assert.match(failure.message, /idea-never-added/);
});

test('without a wired Idea Graph view, derivation references stay structural declarations (disclosed)', async () => {
  const stack = await discoveryStack('tenant-a', false);
  assert.equal(stack.ideaGraph, undefined);
  const input = discoveredCandidateInput(stack.ideaNodeId);
  // The stack was built without wiring the idea graph; the reference here
  // resolves against the fixture graph regardless, so use an unknown id to
  // pin the structural-only mode.
  const candidate = asRecord(
    await propose(stack.discovery, {
      ...input,
      derivation: { ...input.derivation, ideaNodeIds: ['idea-structurally-declared' as never] },
    }),
  );
  assert.deepEqual(candidate.derivation.ideaNodeIds, ['idea-structurally-declared' as never]);
});

test('DISCOVERED origin carrying a citation is invalid input (derivation is the evidence surface)', async () => {
  const stack = await discoveryStack();
  const input = discoveredCandidateInput(stack.ideaNodeId);
  const failure = asError(
    await propose(stack.discovery, {
      ...input,
      known: { definitionId: definitionIdOf('no-op-repost'), definitionVersion: 1 },
    }),
  );
  assert.equal(failure.error, 'invalid-input');
  assert.match(failure.message, /derivation provenance is the evidence surface/);
});

// ---------------------------------------------------------------------------
// Proposal validation — the SHARED contract rules (no drift with the registry)
// ---------------------------------------------------------------------------

test('a candidate proposal violating the shared transform-contract rules is rejected at proposal time', async () => {
  const stack = await discoveryStack();
  const input = discoveredCandidateInput(stack.ideaNodeId);
  const failure = asError(
    await propose(stack.discovery, {
      ...input,
      proposedContract: { ...input.proposedContract, kind: 'never-a-kind' as never },
    }),
  );
  assert.equal(failure.error, 'invalid-input');
  assert.match(failure.message, /frozen §5 thirteen kinds/);
});

test('a human-contribution candidate without declared human participation fails at proposal time', async () => {
  const stack = await discoveryStack();
  const input = discoveredCandidateInput(stack.ideaNodeId);
  const failure = asError(
    await propose(stack.discovery, {
      ...input,
      proposedContract: { ...input.proposedContract, kind: 'human-contribution' as never, humanParticipation: false },
    }),
  );
  assert.equal(failure.error, 'invalid-input');
  assert.match(failure.message, /humanParticipation: true/);
});

test('candidate ids, origins and target definition ids are validated fail-closed', async () => {
  const stack = await discoveryStack();
  const blank = asError(
    await propose(stack.discovery, { ...discoveredCandidateInput(stack.ideaNodeId), id: '   ' as TransformCandidateId }),
  );
  assert.equal(blank.error, 'invalid-input');
  const badOrigin = asError(
    await propose(stack.discovery, { ...discoveredCandidateInput(stack.ideaNodeId), origin: 'guessed' as never }),
  );
  assert.equal(badOrigin.error, 'invalid-input');
  assert.match(badOrigin.message, /known \| composed \| discovered/);
  const badTarget = asError(
    await propose(stack.discovery, {
      ...discoveredCandidateInput(stack.ideaNodeId),
      targetDefinitionId: '' as never,
    }),
  );
  assert.equal(badTarget.error, 'invalid-input');
});

// ---------------------------------------------------------------------------
// Versioning, revision and the append-only discipline
// ---------------------------------------------------------------------------

test('duplicate candidate ids are rejected per tenant scope', async () => {
  const stack = await discoveryStack();
  asRecord(await propose(stack.discovery, discoveredCandidateInput(stack.ideaNodeId)));
  const failure = asError(await propose(stack.discovery, discoveredCandidateInput(stack.ideaNodeId)));
  assert.equal(failure.error, 'duplicate-candidate');
});

test('revision appends version + 1 and every prior version stays resolvable bit-for-bit', async () => {
  const stack = await discoveryStack();
  const first = asRecord(await propose(stack.discovery, discoveredCandidateInput(stack.ideaNodeId)));
  const firstSnapshot = JSON.stringify(first);
  const revised = asRecord(
    await stack.discovery.reviseTransformCandidate({
      ...discoveredCandidateInput(stack.ideaNodeId),
      proposedContract: {
        ...discoveredCandidateInput(stack.ideaNodeId).proposedContract,
        lineageRules: ['lineage:parents-recorded', 'lineage:derived-from-idea-graph'],
      },
    }),
  );
  assert.equal(revised.version, 2);
  assert.deepEqual(revised.proposedContract.lineageRules, [
    'lineage:parents-recorded',
    'lineage:derived-from-idea-graph',
  ]);
  const v1 = await stack.discovery.getTransformCandidate(scopeOf('tenant-a'), first.id, 1);
  assert.ok(v1 !== null);
  assert.equal(JSON.stringify(v1), firstSnapshot);
  const latest = await stack.discovery.getTransformCandidate(scopeOf('tenant-a'), first.id);
  assert.ok(latest !== null);
  assert.equal(latest.version, 2);
});

test('revising an unknown candidate fails closed (unknown and cross-tenant indistinguishable)', async () => {
  const stack = await discoveryStack();
  const failure = await stack.discovery.reviseTransformCandidate(
    discoveredCandidateInput(stack.ideaNodeId, 'tenant-b'),
  );
  assert.ok('error' in failure);
  assert.equal(failure.error, 'candidate-not-found');
});

test('listTransformCandidates returns the latest version of every candidate in insertion order', async () => {
  const stack = await discoveryStack();
  asRecord(await propose(stack.discovery, knownCandidateInput()));
  asRecord(await propose(stack.discovery, composedCandidateInput(stack.graph.graphId, stack.graph.graphVersion)));
  asRecord(await propose(stack.discovery, discoveredCandidateInput(stack.ideaNodeId)));
  const listed = await stack.discovery.listTransformCandidates(scopeOf('tenant-a'));
  assert.equal(listed.length, 3);
  assert.deepEqual(
    listed.map((candidate) => candidate.origin),
    ['known', 'composed', 'discovered'],
  );
});

// ---------------------------------------------------------------------------
// Tenant scoping
// ---------------------------------------------------------------------------

test('candidates are tenant-scoped: unknown and cross-tenant are indistinguishable on reads', async () => {
  // Structural derivation mode (no Idea Graph view wired): the same fixture
  // reference is a legal structural declaration in every tenant, so the SAME
  // discovery instance can hold both tenants' candidates.
  const stack = await discoveryStack('tenant-a', false);
  const candidate = asRecord(await propose(stack.discovery, discoveredCandidateInput(stack.ideaNodeId)));
  assert.equal(await stack.discovery.getTransformCandidate(scopeOf('tenant-b'), candidate.id), null);
  assert.deepEqual(await stack.discovery.listTransformCandidates(scopeOf('tenant-b')), []);
  assert.deepEqual(await stack.discovery.listTransformGateEvidence(scopeOf('tenant-b'), candidate.id), []);
  assert.deepEqual(await stack.discovery.listTransformPromotionAttempts(scopeOf('tenant-b'), candidate.id), []);
  // The same candidate id is independently creatable in another tenant.
  const other = asRecord(
    await propose(stack.discovery, discoveredCandidateInput(stack.ideaNodeId, 'tenant-b')),
  );
  assert.equal(other.tenantId, scopeOf('tenant-b').tenantId);
  assert.notEqual(await stack.discovery.getTransformCandidate(scopeOf('tenant-b'), other.id), null);
  // The two tenants' candidates never mix: each list sees exactly its own.
  assert.equal((await stack.discovery.listTransformCandidates(scopeOf('tenant-a'))).length, 1);
  assert.equal((await stack.discovery.listTransformCandidates(scopeOf('tenant-b'))).length, 1);
});

test('with an Idea Graph view wired, derivation references resolve per tenant scope (no cross-tenant bleed)', async () => {
  const stack = await discoveryStack('tenant-a', true);
  // The fixture idea node lives in tenant-a's idea graph; proposing the SAME
  // reference from tenant-b fails closed (the view resolves per scope).
  const failure = asError(
    await propose(stack.discovery, discoveredCandidateInput(stack.ideaNodeId, 'tenant-b')),
  );
  assert.equal(failure.error, 'unknown-derivation-ref');
});

// ---------------------------------------------------------------------------
// The no-op/repost path flows through discovery IDENTICALLY (lock rule 5)
// ---------------------------------------------------------------------------

test('the no-op/repost candidate is a first-class KNOWN candidate with ZERO capability requirements', async () => {
  const stack = await discoveryStack();
  const candidate = asRecord(await propose(stack.discovery, knownCandidateInput()));
  assert.equal(candidate.origin, 'known');
  assert.deepEqual(candidate.proposedContract.capabilityRequirements, []);
  assert.equal(candidate.proposedContract.kind, 'no-op-repost');
  assert.equal(candidate.proposedContract.costModel.amount, 0);
  // The no-op candidate lists and resolves like every other candidate.
  const listed = await stack.discovery.listTransformCandidates(scopeOf('tenant-a'));
  assert.equal(listed.some((entry) => entry.id === candidate.id), true);
});

// ---------------------------------------------------------------------------
// Determinism (fixed clock — no seeds apply on this surface)
// ---------------------------------------------------------------------------

test('deterministic: identical stacks produce bit-identical candidate records', async () => {
  const stackA = await discoveryStack();
  const stackB = await discoveryStack();
  const a = asRecord(await propose(stackA.discovery, discoveredCandidateInput(stackA.ideaNodeId)));
  const b = asRecord(await propose(stackB.discovery, discoveredCandidateInput(stackB.ideaNodeId)));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

// ---------------------------------------------------------------------------
// Surface discipline (§24 no auto-production; port budget)
// ---------------------------------------------------------------------------

test('the discovery port exposes exactly eight methods and NO deploy/publish surface (§24 no auto-production)', async () => {
  const stack = await discoveryStack();
  const methods = Object.keys(stack.discovery).sort();
  assert.deepEqual(methods, [
    'getTransformCandidate',
    'listTransformCandidates',
    'listTransformGateEvidence',
    'listTransformPromotionAttempts',
    'promoteTransformCandidate',
    'proposeTransformCandidate',
    'recordTransformGateEvidence',
    'reviseTransformCandidate',
  ]);
  assert.ok(methods.length <= 12, 'port method budget: 12');
  // The frozen §24 boundary: nothing in the surface can deploy or publish.
  assert.equal(
    methods.some((method) => /deploy|publish|distribute|execute|run/i.test(method)),
    false,
  );
});

test('candidate records are deep-frozen (append-only ownership discipline)', async () => {
  const stack = await discoveryStack();
  const candidate = asRecord(await propose(stack.discovery, discoveredCandidateInput(stack.ideaNodeId)));
  assert.ok(Object.isFrozen(candidate));
  assert.ok(Object.isFrozen(candidate.proposedContract));
  assert.ok(Object.isFrozen(candidate.derivation));
  assert.throws(() => {
    (candidate as { mutable?: boolean }).mutable = true;
  });
});

test('the discovery stack composes the REAL @mos/capabilities seed vocabulary (gate 2 surface)', async () => {
  const stack: DiscoveryStack = await discoveryStack();
  const reactionRequirements = (await stack.definitions.getTransformDefinition(
    scopeOf('tenant-a'),
    definitionIdOf('reaction'),
    1,
  ))?.capabilityRequirements;
  assert.ok(reactionRequirements !== undefined);
  for (const requirement of reactionRequirements) {
    assert.ok(stack.capabilities.get(requirement.capabilityId, requirement.version) !== undefined);
  }
});
