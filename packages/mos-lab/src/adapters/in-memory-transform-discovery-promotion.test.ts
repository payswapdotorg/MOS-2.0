import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertRequiredFields } from '@mos/contracts';
import type { TransformId, Version } from '@mos/contracts';
import { createInMemoryTransformDiscovery } from './in-memory-transform-discovery.js';
import type { InMemoryTransformDiscoveryOptions } from './in-memory-transform-discovery.js';
import type {
  TransformCandidate,
  TransformCandidateId,
} from '../contracts/transform-candidate.js';
import type {
  TransformDiscoveryError,
  TransformDiscoveryPort,
} from '../contracts/transform-discovery.js';
import type { TransformDefinition } from '../contracts/transform-definition.js';
import {
  FIXED_NOW,
  definitionIdOf,
  scopeOf,
} from '../testing/w5a-transform-fixtures.js';
import {
  attachAllGates,
  benchmarkRecord,
  discoveryStack,
  discoveredCandidateInput,
  knownCandidateInput,
  type DiscoveryStack,
} from '../testing/w6a-lab-fixtures.js';

type ProposeResult = Awaited<ReturnType<TransformDiscoveryPort['proposeTransformCandidate']>>;
type PromoteResult = Awaited<ReturnType<TransformDiscoveryPort['promoteTransformCandidate']>>;

const asRecord = (result: ProposeResult): TransformCandidate => {
  if ('error' in result) {
    assert.fail(`unexpected discovery error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asError = (result: PromoteResult): TransformDiscoveryError => {
  assert.ok('error' in result, `expected a typed failure, got a record: ${String(result)}`);
  return result;
};

const asPromotion = (result: PromoteResult): Exclude<PromoteResult, TransformDiscoveryError> => {
  assert.ok(!('error' in result), `unexpected promotion failure: ${String(result)}`);
  return result;
};

const proposeDiscovered = async (
  discovery: TransformDiscoveryPort,
  stack: DiscoveryStack,
  id?: TransformCandidateId,
): Promise<TransformCandidate> =>
  asRecord(
    await discovery.proposeTransformCandidate(
      discoveredCandidateInput(stack.ideaNodeId, 'tenant-a', id === undefined ? {} : { id }),
    ),
  );

// ---------------------------------------------------------------------------
// Promotion → registry version append (immutable, never in place)
// ---------------------------------------------------------------------------

test('promotion materializes a NEW definition version through the registry REGISTER path (new target id → version 1)', async () => {
  const stack = await discoveryStack();
  const candidate = await proposeDiscovered(stack.discovery, stack);
  await attachAllGates(stack.discovery, scopeOf('tenant-a'), candidate.id);
  const promotion = asPromotion(
    await stack.discovery.promoteTransformCandidate(scopeOf('tenant-a'), candidate.id),
  );
  assert.equal(promotion.definitionId, candidate.targetDefinitionId);
  assert.equal(promotion.definitionVersion, 1);

  // The definition landed in the W5-A registry and satisfies the canonical
  // CORE-001 Transform contract (required fields by construction).
  const definition = await stack.definitions.getTransformDefinition(
    scopeOf('tenant-a'),
    candidate.targetDefinitionId,
    promotion.definitionVersion,
  );
  assert.ok(definition !== null);
  assertRequiredFields(definition, 'Transform');
  assert.equal(definition.kind, 'reaction');
  assert.equal(definition.tenantId, scopeOf('tenant-a').tenantId);
  // The promoted definition's content is the candidate's proposed contract.
  assert.deepEqual(definition.inputConstraint, candidate.proposedContract.inputConstraint);
  assert.deepEqual(definition.outputContract, candidate.proposedContract.outputContract);
  assert.deepEqual(definition.capabilityRequirements, candidate.proposedContract.capabilityRequirements);
  assert.equal(definition.evaluator, candidate.proposedContract.evaluator);
  assert.deepEqual(definition.rightsRequirements, candidate.proposedContract.rightsRequirements);
  assert.deepEqual(definition.policyRequirements, candidate.proposedContract.policyRequirements);
  assert.deepEqual(definition.lineageRules, candidate.proposedContract.lineageRules);
  // Derived canonical inputTypes/outputTypes (sorted unique from the constraints).
  assert.deepEqual(definition.inputTypes, ['video/mp4']);
  assert.deepEqual(definition.outputTypes, ['video/mp4']);
  // The promoted definition is enumerable — AVAILABLE to program search.
  const listed = await stack.definitions.listTransformDefinitions(scopeOf('tenant-a'));
  assert.equal(
    listed.some((entry) => entry.id === candidate.targetDefinitionId && entry.version === 1),
    true,
  );
  // The promotion attempt trail records the promoted outcome.
  const attempts = await stack.discovery.listTransformPromotionAttempts(scopeOf('tenant-a'), candidate.id);
  assert.deepEqual(
    attempts.map((attempt) => ({ outcome: attempt.outcome, definitionVersion: attempt.definitionVersion })),
    [{ outcome: 'promoted', definitionVersion: 1 }],
  );
});

test('promotion through the REVISE path appends version + 1 — the prior definition version stays resolvable bit-for-bit (never in place)', async () => {
  const stack = await discoveryStack();
  // The KNOWN no-op candidate targets the EXISTING no-op definition id.
  const candidate = asRecord(await stack.discovery.proposeTransformCandidate(knownCandidateInput()));
  const before = await stack.definitions.getTransformDefinition(
    scopeOf('tenant-a'),
    definitionIdOf('no-op-repost'),
    1,
  );
  assert.ok(before !== null);
  const beforeSnapshot = JSON.stringify(before);
  await attachAllGates(stack.discovery, scopeOf('tenant-a'), candidate.id);
  const promotion = asPromotion(
    await stack.discovery.promoteTransformCandidate(scopeOf('tenant-a'), candidate.id),
  );
  assert.equal(promotion.definitionId, definitionIdOf('no-op-repost'));
  assert.equal(promotion.definitionVersion, 2);
  // The revision appended: v1 is bit-for-bit unchanged and still resolvable.
  const v1 = await stack.definitions.getTransformDefinition(
    scopeOf('tenant-a'),
    definitionIdOf('no-op-repost'),
    1,
  );
  assert.ok(v1 !== null);
  assert.equal(JSON.stringify(v1), beforeSnapshot);
  const latest = await stack.definitions.getTransformDefinition(
    scopeOf('tenant-a'),
    definitionIdOf('no-op-repost'),
  );
  assert.ok(latest !== null);
  assert.equal(latest.version, 2);
  assert.equal(latest.kind, 'no-op-repost');
});

test('the candidate itself is FROZEN at the promoted version (§8 gate 6) and stays resolvable afterwards', async () => {
  const stack = await discoveryStack();
  const candidate = await proposeDiscovered(stack.discovery, stack);
  const snapshot = JSON.stringify(candidate);
  await attachAllGates(stack.discovery, scopeOf('tenant-a'), candidate.id);
  const promotion = asPromotion(await stack.discovery.promoteTransformCandidate(scopeOf('tenant-a'), candidate.id));
  const frozen = await stack.discovery.getTransformCandidate(scopeOf('tenant-a'), candidate.id, 1);
  assert.ok(frozen !== null);
  assert.equal(JSON.stringify(frozen), snapshot);
  assert.equal(Object.isFrozen(frozen), true);
  // The promotion result is deep-frozen: the gate outcome entries cannot be
  // mutated through the returned record.
  assert.ok(Object.isFrozen(promotion));
  assert.ok(Object.isFrozen(promotion.gates));
  assert.ok(promotion.gates.every((outcome) => Object.isFrozen(outcome)));
  assert.throws(() => {
    (promotion.gates[0] as { gate?: string }).gate = 'MUTATED';
  });
});

// ---------------------------------------------------------------------------
// already-promoted — the same candidate version cannot promote twice
// ---------------------------------------------------------------------------

test('an already-promoted candidate version fails closed (already-promoted) and appends no attempt', async () => {
  const stack = await discoveryStack();
  const candidate = await proposeDiscovered(stack.discovery, stack);
  await attachAllGates(stack.discovery, scopeOf('tenant-a'), candidate.id);
  asPromotion(await stack.discovery.promoteTransformCandidate(scopeOf('tenant-a'), candidate.id));
  const second = asError(await stack.discovery.promoteTransformCandidate(scopeOf('tenant-a'), candidate.id));
  assert.equal(second.error, 'already-promoted');
  assert.match(second.message, /revise the candidate/);
  // Caller errors (already-promoted) are not gate evaluations — the audit
  // trail stays at exactly the one promoted attempt.
  const attempts = await stack.discovery.listTransformPromotionAttempts(scopeOf('tenant-a'), candidate.id);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0]?.outcome, 'promoted');
});

test('a REVISED candidate (new version) can promote again after the old evidence goes stale', async () => {
  const stack = await discoveryStack();
  const candidate = await proposeDiscovered(stack.discovery, stack);
  await attachAllGates(stack.discovery, scopeOf('tenant-a'), candidate.id);
  asPromotion(await stack.discovery.promoteTransformCandidate(scopeOf('tenant-a'), candidate.id));
  // Revise: version 2 with fresh content (a different target id — the
  // registry-append-only path is per candidate version, not per candidate).
  const revised = asRecord(
    await stack.discovery.reviseTransformCandidate({
      ...discoveredCandidateInput(stack.ideaNodeId),
      targetDefinitionId: 'transform.discovered-reaction-v2' as TransformId,
    }),
  );
  assert.equal(revised.version, 2);
  // All prior evidence is stale at v2: promotion fails closed naming the FIRST gate.
  const stale = asError(await stack.discovery.promoteTransformCandidate(scopeOf('tenant-a'), candidate.id));
  assert.equal(stale.error, 'gate-evidence-missing');
  assert.equal(stale.gate, 'contract-validation');
  assert.match(stale.message, /stale/);
  // The rejection stays recorded; then fresh evidence unblocks promotion.
  const attemptsAfterRejection = await stack.discovery.listTransformPromotionAttempts(scopeOf('tenant-a'), candidate.id);
  assert.equal(attemptsAfterRejection.length, 2);
  assert.equal(attemptsAfterRejection[1]?.outcome, 'rejected');
  assert.equal(attemptsAfterRejection[1]?.failedGate, 'contract-validation');
  await attachAllGates(stack.discovery, scopeOf('tenant-a'), candidate.id);
  const promotion = asPromotion(await stack.discovery.promoteTransformCandidate(scopeOf('tenant-a'), candidate.id));
  assert.equal(promotion.candidateVersion, 2);
  assert.equal(promotion.definitionId, 'transform.discovered-reaction-v2');
  assert.equal(promotion.definitionVersion, 1);
  // The evidence log is append-only: 7 entries for v1 + 7 entries for v2.
  const log = await stack.discovery.listTransformGateEvidence(scopeOf('tenant-a'), candidate.id);
  assert.equal(log.length, 14);
  assert.deepEqual(
    log.filter((entry) => entry.candidateVersion === 2).map((entry) => entry.evidence.gate),
    log.filter((entry) => entry.candidateVersion === 1).map((entry) => entry.evidence.gate),
  );
});

// ---------------------------------------------------------------------------
// Re-recording a gate appends (never rewrites); latest wins at promotion
// ---------------------------------------------------------------------------

test('re-recording a gate appends a new entry and the LATEST evidence wins at promotion', async () => {
  const stack = await discoveryStack();
  const candidate = await proposeDiscovered(stack.discovery, stack);
  // A FAILING benchmark first, then the passing one: the latest must win.
  await attachAllGates(stack.discovery, scopeOf('tenant-a'), candidate.id, benchmarkRecord({ result: 'failed' }));
  await stack.discovery.recordTransformGateEvidence({
    scope: scopeOf('tenant-a'),
    candidateId: candidate.id,
    evidence: { gate: 'bounded-benchmark-evidence', benchmark: benchmarkRecord({ result: 'passed' }) },
  });
  const log = await stack.discovery.listTransformGateEvidence(scopeOf('tenant-a'), candidate.id);
  assert.equal(log.length, 8);
  assert.deepEqual(
    log.filter((entry) => entry.evidence.gate === 'bounded-benchmark-evidence').map((entry) => entry.entryId),
    ['evidence-5', 'evidence-8'],
  );
  const promotion = asPromotion(
    await stack.discovery.promoteTransformCandidate(scopeOf('tenant-a'), candidate.id),
  );
  // The satisfying entry for gate 5 is the LATEST (passing) one.
  const gate5 = promotion.gates.find((outcome) => outcome.gate === 'bounded-benchmark-evidence');
  assert.ok(gate5 !== undefined);
  assert.equal(gate5.entryId, 'evidence-8');
});

test('a passing benchmark superseded by a failing one fails promotion by name (latest wins, both ways)', async () => {
  const stack = await discoveryStack();
  const candidate = await proposeDiscovered(stack.discovery, stack);
  await attachAllGates(stack.discovery, scopeOf('tenant-a'), candidate.id, benchmarkRecord({ result: 'passed' }));
  await stack.discovery.recordTransformGateEvidence({
    scope: scopeOf('tenant-a'),
    candidateId: candidate.id,
    evidence: { gate: 'bounded-benchmark-evidence', benchmark: benchmarkRecord({ result: 'failed' }) },
  });
  const failure = asError(await stack.discovery.promoteTransformCandidate(scopeOf('tenant-a'), candidate.id));
  assert.equal(failure.error, 'benchmark-not-passed');
  assert.equal(failure.gate, 'bounded-benchmark-evidence');
});

// ---------------------------------------------------------------------------
// The no-op/repost path promotes end-to-end IDENTICALLY (§8, lock rule 5)
// ---------------------------------------------------------------------------

test('the no-op/repost candidate promotes end-to-end through discovery (the §8 no-op original repost example)', async () => {
  const stack = await discoveryStack();
  const candidate = asRecord(await stack.discovery.proposeTransformCandidate(knownCandidateInput()));
  assert.equal(candidate.proposedContract.kind, 'no-op-repost');
  await attachAllGates(stack.discovery, scopeOf('tenant-a'), candidate.id);
  const promotion = asPromotion(
    await stack.discovery.promoteTransformCandidate(scopeOf('tenant-a'), candidate.id),
  );
  assert.equal(promotion.origin, 'known');
  assert.equal(promotion.definitionId, definitionIdOf('no-op-repost'));
  assert.equal(promotion.definitionVersion, 2);
  // The promoted no-op definition keeps ZERO capability requirements and the
  // declared rights requirement — a REAL definition, never special-cased.
  const definition = await stack.definitions.getTransformDefinition(
    scopeOf('tenant-a'),
    definitionIdOf('no-op-repost'),
    2,
  );
  assert.ok(definition !== null);
  assert.deepEqual(definition.capabilityRequirements, []);
  assert.deepEqual(definition.rightsRequirements, ['rights:repost-grant']);
  assert.equal(definition.costModel.amount, 0);
});

// ---------------------------------------------------------------------------
// Unknown / cross-tenant promotion attempts + registry write failures
// ---------------------------------------------------------------------------

test('promoting an unknown candidate fails closed (candidate-not-found, no audit entry)', async () => {
  const stack = await discoveryStack();
  const failure = asError(
    await stack.discovery.promoteTransformCandidate(
      scopeOf('tenant-b'),
      'candidate.never-proposed' as TransformCandidateId,
    ),
  );
  assert.equal(failure.error, 'candidate-not-found');
  assert.deepEqual(
    await stack.discovery.listTransformPromotionAttempts(
      scopeOf('tenant-b'),
      'candidate.never-proposed' as TransformCandidateId,
    ),
    [],
  );
});

test('a registry write rejection surfaces as promotion-registry-failure with the attempt recorded', async () => {
  const stack = await discoveryStack();
  // A rejecting definitions view over the fixture registry: reviseTransformDefinition
  // always fails (the candidate targets an EXISTING definition id, so the
  // promotion takes the revise path).
  const rejecting: InMemoryTransformDiscoveryOptions['definitions'] = {
    getTransformDefinition: (scope, id: TransformId, version?: Version) =>
      stack.definitions.getTransformDefinition(scope, id, version),
    registerTransformDefinition: (input) => stack.definitions.registerTransformDefinition(input),
    reviseTransformDefinition: async () => ({
      error: 'invalid-input' as const,
      message: 'fixture-injected registry rejection',
    }),
  };
  const discovery = createInMemoryTransformDiscovery({
    definitions: rejecting,
    capabilities: stack.capabilities,
    graphs: stack.graphs,
    ...(stack.ideaGraph === undefined ? {} : { ideaGraph: stack.ideaGraph }),
    now: FIXED_NOW,
  });
  const candidate = asRecord(await discovery.proposeTransformCandidate(knownCandidateInput()));
  await attachAllGates(discovery, scopeOf('tenant-a'), candidate.id);
  const failure = asError(await discovery.promoteTransformCandidate(scopeOf('tenant-a'), candidate.id));
  assert.equal(failure.error, 'promotion-registry-failure');
  assert.match(failure.message, /fixture-injected registry rejection/);
  // The registry rejection is a real promotion attempt — recorded as rejected.
  const attempts = await discovery.listTransformPromotionAttempts(scopeOf('tenant-a'), candidate.id);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0]?.outcome, 'rejected');
  assert.equal(attempts[0]?.failedGate, null);
  // The registry itself is untouched (the rejection prevented the write).
  const noop = await stack.definitions.getTransformDefinition(scopeOf('tenant-a'), definitionIdOf('no-op-repost'));
  assert.ok(noop !== null);
  assert.equal(noop.version, 1);
});

// ---------------------------------------------------------------------------
// Determinism of the promotion path
// ---------------------------------------------------------------------------

test('deterministic promotion: identical stacks produce bit-identical promotions', async () => {
  const promoteOn = async (stack: DiscoveryStack): Promise<string> => {
    const candidate = await proposeDiscovered(stack.discovery, stack);
    await attachAllGates(stack.discovery, scopeOf('tenant-a'), candidate.id);
    const promotion = await stack.discovery.promoteTransformCandidate(scopeOf('tenant-a'), candidate.id);
    assert.ok(!('error' in promotion));
    const definition: TransformDefinition | null = await stack.definitions.getTransformDefinition(
      scopeOf('tenant-a'),
      candidate.targetDefinitionId,
      promotion.definitionVersion,
    );
    assert.ok(definition !== null);
    return JSON.stringify({ promotion, definition });
  };
  const stackA = await discoveryStack();
  const stackB = await discoveryStack();
  assert.equal(await promoteOn(stackA), await promoteOn(stackB));
});
