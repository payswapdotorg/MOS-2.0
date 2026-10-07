import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertRequiredFields } from '@mos/contracts';
import type { EngineBenchmark } from '@mos/contracts';
import type {
  TransformCandidate,
  TransformCandidateId,
} from '../contracts/transform-candidate.js';
import type {
  TransformDiscoveryError,
  TransformDiscoveryPort,
} from '../contracts/transform-discovery.js';
import type { TransformPromotionGateName } from '../contracts/transform-promotion-gates.js';
import { GATES, PROMOTION_FAILURE_CODE } from './transform-discovery-gates.js';
import {
  FIXED_NOW,
  scopeOf,
} from '../testing/w5a-transform-fixtures.js';
import {
  attachAllGates,
  benchmarkRecord,
  composedCandidateInput,
  discoveryStack,
  discoveredCandidateInput,
  knownCandidateInput,
  type DiscoveryStack,
} from '../testing/w6a-lab-fixtures.js';

type ProposeResult = Awaited<ReturnType<TransformDiscoveryPort['proposeTransformCandidate']>>;
type EvidenceResult = Awaited<ReturnType<TransformDiscoveryPort['recordTransformGateEvidence']>>;
type PromoteResult = Awaited<ReturnType<TransformDiscoveryPort['promoteTransformCandidate']>>;

const asRecord = (result: ProposeResult): TransformCandidate => {
  if ('error' in result) {
    assert.fail(`unexpected discovery error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asError = (result: ProposeResult | EvidenceResult | PromoteResult): TransformDiscoveryError => {
  assert.ok('error' in result, `expected a typed failure, got a record: ${String(result)}`);
  return result;
};

const asPromotion = async (stack: DiscoveryStack, candidateId: TransformCandidateId) => {
  const result = await stack.discovery.promoteTransformCandidate(scopeOf('tenant-a'), candidateId);
  assert.ok(!('error' in result), `unexpected promotion failure: ${String(result)}`);
  return result;
};

const proposeDiscovered = async (
  stack: DiscoveryStack,
  overrides: { readonly id?: TransformCandidateId } = {},
): Promise<TransformCandidate> =>
  asRecord(
    await stack.discovery.proposeTransformCandidate(
      discoveredCandidateInput(stack.ideaNodeId, 'tenant-a', overrides),
    ),
  );

/** Attach every gate except the named one (§8 order preserved). */
const attachAllGatesExcept = async (
  stack: DiscoveryStack,
  candidateId: TransformCandidateId,
  except: TransformPromotionGateName,
): Promise<void> => {
  const candidate = await stack.discovery.getTransformCandidate(scopeOf('tenant-a'), candidateId);
  assert.ok(candidate !== null);
  const contract = candidate.proposedContract;
  const inputs = [
    { gate: 'contract-validation' } as const,
    { gate: 'capability-feasibility' } as const,
    {
      gate: 'rights-policy-feasibility',
      rightsRequirements: [...contract.rightsRequirements],
      policyRequirements: [...contract.policyRequirements],
    } as const,
    {
      gate: 'evaluator',
      evaluatorRef: contract.evaluator,
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
    } as const,
    { gate: 'bounded-benchmark-evidence', benchmark: benchmarkRecord() } as const,
    { gate: 'immutable-version', candidateVersion: candidate.version, promotionPath: 'registry-append-only' } as const,
    { gate: 'provenance' } as const,
  ].filter((evidence) => evidence.gate !== except);
  for (const evidence of inputs) {
    const entry = await stack.discovery.recordTransformGateEvidence({
      scope: scopeOf('tenant-a'),
      candidateId,
      evidence,
    });
    assert.ok(!('error' in entry), `gate ${evidence.gate} attach failed: ${String(entry)}`);
  }
};

// ---------------------------------------------------------------------------
// The seven §8 gates — order and fail-closed discipline
// ---------------------------------------------------------------------------

test('THE SEVEN GATES: a discovered candidate with all seven evidence records promotes (§8 order pinned)', async () => {
  const stack = await discoveryStack();
  const candidate = await proposeDiscovered(stack);
  await attachAllGates(stack.discovery, scopeOf('tenant-a'), candidate.id);
  const promotion = await asPromotion(stack, candidate.id);
  assert.equal(promotion.candidateId, candidate.id);
  assert.equal(promotion.candidateVersion, 1);
  assert.equal(promotion.origin, 'discovered');
  assert.equal(promotion.promotionPath, 'registry-append-only');
  assert.deepEqual(
    promotion.gates.map((outcome) => outcome.gate),
    GATES,
  );
  assert.deepEqual(GATES, [
    'contract-validation',
    'capability-feasibility',
    'rights-policy-feasibility',
    'evaluator',
    'bounded-benchmark-evidence',
    'immutable-version',
    'provenance',
  ] satisfies TransformPromotionGateName[]);
  for (const outcome of promotion.gates) {
    assert.equal(outcome.passed, true);
    assert.match(outcome.entryId, /^evidence-\d+$/);
  }
  assert.equal(promotion.promotedAt, FIXED_NOW());
});

test('EVERY gate is individually fail-closed: a candidate missing any one gate record cannot promote', async () => {
  for (const gate of GATES) {
    const stack = await discoveryStack();
    const candidate = await proposeDiscovered(stack);
    await attachAllGatesExcept(stack, candidate.id, gate);
    const failure = asError(await stack.discovery.promoteTransformCandidate(scopeOf('tenant-a'), candidate.id));
    assert.equal(failure.error, 'gate-evidence-missing', `gate ${gate}: expected gate-evidence-missing`);
    assert.equal(failure.gate, gate, `gate ${gate}: the failure must name the gate`);
    assert.match(failure.message, new RegExp(gate));
    // The rejection stays recorded with the named gate failure.
    const attempts = await stack.discovery.listTransformPromotionAttempts(scopeOf('tenant-a'), candidate.id);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0]?.outcome, 'rejected');
    assert.equal(attempts[0]?.failedGate, gate);
    // ... and the candidate itself is still recorded (nothing is deleted).
    const stillThere = await stack.discovery.getTransformCandidate(scopeOf('tenant-a'), candidate.id);
    assert.ok(stillThere !== null);
  }
});

test('promotion evaluates the gates in §8 order — the FIRST missing gate is the named failure', async () => {
  const stack = await discoveryStack();
  const candidate = await proposeDiscovered(stack);
  // Attach only the LAST four gates: the first missing is gate 1.
  const contract = candidate.proposedContract;
  for (const evidence of [
    { gate: 'bounded-benchmark-evidence', benchmark: benchmarkRecord() } as const,
    { gate: 'immutable-version', candidateVersion: candidate.version, promotionPath: 'registry-append-only' } as const,
    { gate: 'provenance' } as const,
    {
      gate: 'evaluator',
      evaluatorRef: contract.evaluator,
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
    } as const,
  ]) {
    await stack.discovery.recordTransformGateEvidence({ scope: scopeOf('tenant-a'), candidateId: candidate.id, evidence });
  }
  const failure = asError(await stack.discovery.promoteTransformCandidate(scopeOf('tenant-a'), candidate.id));
  assert.equal(failure.error, 'gate-evidence-missing');
  assert.equal(failure.gate, 'contract-validation');
});

test('each gate maps to its named promotion failure code (§8 order table)', async () => {
  assert.deepEqual(PROMOTION_FAILURE_CODE, {
    'contract-validation': 'contract-validation-failed',
    'capability-feasibility': 'capability-feasibility-failed',
    'rights-policy-feasibility': 'rights-policy-declaration-mismatch',
    evaluator: 'evaluator-binding-mismatch',
    'bounded-benchmark-evidence': 'benchmark-not-passed',
    'immutable-version': 'stale-freeze-declaration',
    provenance: 'provenance-incomplete',
  });
});

// ---------------------------------------------------------------------------
// Gate 2 — capability feasibility (declarative @mos/capabilities resolution)
// ---------------------------------------------------------------------------

test('GATE 2: an unresolved capability requirement fails the attach fail-closed, naming the gate', async () => {
  const stack = await discoveryStack();
  // Propose with an unresolved capability ref (proposal validation is
  // structural; the GATE resolves the refs).
  const unresolvable = asRecord(
    await stack.discovery.proposeTransformCandidate({
      ...discoveredCandidateInput(stack.ideaNodeId, 'tenant-a', { id: 'candidate.unresolvable' as TransformCandidateId }),
      proposedContract: {
        ...discoveredCandidateInput(stack.ideaNodeId).proposedContract,
        capabilityRequirements: [{ capabilityId: 'capability:never-registered' as never, version: 1 as never }],
      },
    }),
  );
  const failure = asError(
    await stack.discovery.recordTransformGateEvidence({
      scope: scopeOf('tenant-a'),
      candidateId: unresolvable.id,
      evidence: { gate: 'capability-feasibility' },
    }),
  );
  assert.equal(failure.error, 'unresolved-capability-requirement');
  assert.equal(failure.gate, 'capability-feasibility');
  assert.match(failure.message, /capability:never-registered@1/);
  // Evidence never attached: the log stays empty for this candidate.
  assert.deepEqual(
    await stack.discovery.listTransformGateEvidence(scopeOf('tenant-a'), unresolvable.id),
    [],
  );
});

test('GATE 2: the no-op candidate passes capability feasibility with ZERO resolved requirements (lock rule 5)', async () => {
  const stack = await discoveryStack();
  const candidate = asRecord(await stack.discovery.proposeTransformCandidate(knownCandidateInput()));
  const entry = await stack.discovery.recordTransformGateEvidence({
    scope: scopeOf('tenant-a'),
    candidateId: candidate.id,
    evidence: { gate: 'capability-feasibility' },
  });
  assert.ok(!('error' in entry));
  assert.equal(entry.evidence.gate, 'capability-feasibility');
  assert.deepEqual(
    (entry.evidence as { resolvedRequirements: readonly unknown[] }).resolvedRequirements,
    [],
  );
});

// ---------------------------------------------------------------------------
// Gate 3 — rights/policy feasibility (structural declarations)
// ---------------------------------------------------------------------------

test('GATE 3: declarations must cover EXACTLY the contract\'s rights/policy requirements', async () => {
  const stack = await discoveryStack();
  const candidate = asRecord(await stack.discovery.proposeTransformCandidate(knownCandidateInput()));
  // The no-op contract declares rights:repost-grant — under-declare it.
  const under = asError(
    await stack.discovery.recordTransformGateEvidence({
      scope: scopeOf('tenant-a'),
      candidateId: candidate.id,
      evidence: { gate: 'rights-policy-feasibility', rightsRequirements: [], policyRequirements: [] },
    }),
  );
  assert.equal(under.error, 'rights-policy-declaration-mismatch');
  const correct = await stack.discovery.recordTransformGateEvidence({
    scope: scopeOf('tenant-a'),
    candidateId: candidate.id,
    evidence: {
      gate: 'rights-policy-feasibility',
      rightsRequirements: [...candidate.proposedContract.rightsRequirements],
      policyRequirements: [...candidate.proposedContract.policyRequirements],
    },
  });
  assert.ok(!('error' in correct));
  const evidence = correct.evidence as { evaluation: string };
  assert.equal(evidence.evaluation, 'structural-declaration-only');
});

// ---------------------------------------------------------------------------
// Gate 4 — evaluator binding (ref + contract shape; execution NOT this item)
// ---------------------------------------------------------------------------

test('GATE 4: the bound evaluator must be the contract\'s own evaluator', async () => {
  const stack = await discoveryStack();
  const candidate = await proposeDiscovered(stack);
  const mismatch = asError(
    await stack.discovery.recordTransformGateEvidence({
      scope: scopeOf('tenant-a'),
      candidateId: candidate.id,
      evidence: {
        gate: 'evaluator',
        evaluatorRef: 'evaluator:someone-else@1' as never,
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
      },
    }),
  );
  assert.equal(mismatch.error, 'evaluator-binding-mismatch');
  assert.match(mismatch.message, /evaluator:lab-seed:reaction@1/);
  const blank = asError(
    await stack.discovery.recordTransformGateEvidence({
      scope: scopeOf('tenant-a'),
      candidateId: candidate.id,
      evidence: {
        gate: 'evaluator',
        evaluatorRef: '' as never,
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
      },
    }),
  );
  assert.equal(blank.error, 'invalid-input');
});

// ---------------------------------------------------------------------------
// Gate 5 — bounded benchmark evidence (complete frozen EngineBenchmark only)
// ---------------------------------------------------------------------------

test('GATE 5: an INCOMPLETE EngineBenchmark record never attaches (every missing field named)', async () => {
  const stack = await discoveryStack();
  const candidate = await proposeDiscovered(stack);
  const incomplete = benchmarkRecord({ result: undefined } as Partial<EngineBenchmark>);
  const failure = asError(
    await stack.discovery.recordTransformGateEvidence({
      scope: scopeOf('tenant-a'),
      candidateId: candidate.id,
      evidence: { gate: 'bounded-benchmark-evidence', benchmark: incomplete },
    }),
  );
  assert.equal(failure.error, 'incomplete-benchmark-record');
  assert.match(failure.message, /result/);
  assert.deepEqual(await stack.discovery.listTransformGateEvidence(scopeOf('tenant-a'), candidate.id), []);
});

test('GATE 5: a complete-but-FAILED benchmark attaches but fails promotion by name', async () => {
  const stack = await discoveryStack();
  const candidate = await proposeDiscovered(stack);
  await attachAllGates(stack.discovery, scopeOf('tenant-a'), candidate.id, benchmarkRecord({ result: 'failed' }));
  const failure = asError(await stack.discovery.promoteTransformCandidate(scopeOf('tenant-a'), candidate.id));
  assert.equal(failure.error, 'benchmark-not-passed');
  assert.equal(failure.gate, 'bounded-benchmark-evidence');
  assert.match(failure.message, /"failed"/);
  const attempts = await stack.discovery.listTransformPromotionAttempts(scopeOf('tenant-a'), candidate.id);
  assert.equal(attempts[0]?.failedGate, 'bounded-benchmark-evidence');
});

// ---------------------------------------------------------------------------
// Gate 6 — immutable version (freeze at the CURRENT version, append-only path)
// ---------------------------------------------------------------------------

test('GATE 6: a stale freeze declaration fails the attach fail-closed', async () => {
  const stack = await discoveryStack();
  const candidate = await proposeDiscovered(stack);
  const failure = asError(
    await stack.discovery.recordTransformGateEvidence({
      scope: scopeOf('tenant-a'),
      candidateId: candidate.id,
      evidence: { gate: 'immutable-version', candidateVersion: 7, promotionPath: 'registry-append-only' },
    }),
  );
  assert.equal(failure.error, 'stale-freeze-declaration');
  assert.match(failure.message, /7/);
  const badPath = asError(
    await stack.discovery.recordTransformGateEvidence({
      scope: scopeOf('tenant-a'),
      candidateId: candidate.id,
      evidence: { gate: 'immutable-version', candidateVersion: candidate.version, promotionPath: 'in-place-mutation' as never },
    }),
  );
  assert.equal(badPath.error, 'invalid-input');
  assert.match(badPath.message, /append-only/);
});

// ---------------------------------------------------------------------------
// Gate 7 — provenance (full derivation chain)
// ---------------------------------------------------------------------------

test('GATE 7: the provenance evidence snapshots the complete derivation chain', async () => {
  const stack = await discoveryStack();
  const candidate = await proposeDiscovered(stack);
  await attachAllGates(stack.discovery, scopeOf('tenant-a'), candidate.id);
  const log = await stack.discovery.listTransformGateEvidence(scopeOf('tenant-a'), candidate.id);
  const provenance = log.find((entry) => entry.evidence.gate === 'provenance');
  assert.ok(provenance !== undefined);
  assert.equal(provenance.evidence.gate, 'provenance');
  const evidence = provenance.evidence as {
    origin: string;
    derivation: { ideaNodeIds: readonly string[]; provenanceRef: string };
    citation: unknown;
  };
  assert.equal(evidence.origin, 'discovered');
  assert.deepEqual(evidence.derivation.ideaNodeIds, [stack.ideaNodeId]);
  assert.equal(evidence.citation, null);
});

test('GATE 7: a composed candidate\'s provenance evidence carries the composition citation with its members', async () => {
  const stack = await discoveryStack();
  const candidate = asRecord(
    await stack.discovery.proposeTransformCandidate(
      composedCandidateInput(stack.graph.graphId, stack.graph.graphVersion),
    ),
  );
  await attachAllGates(stack.discovery, scopeOf('tenant-a'), candidate.id);
  const log = await stack.discovery.listTransformGateEvidence(scopeOf('tenant-a'), candidate.id);
  const provenance = log.find((entry) => entry.evidence.gate === 'provenance');
  assert.ok(provenance !== undefined);
  const evidence = provenance.evidence as { citation: { members: readonly unknown[] } | null };
  assert.ok(evidence.citation !== null);
  assert.equal(evidence.citation.members.length, 2);
});

// ---------------------------------------------------------------------------
// Gate evidence records: complete frozen-shape records
// ---------------------------------------------------------------------------

test('every attached gate evidence entry carries the candidate version it covers and a frozen record', async () => {
  const stack = await discoveryStack();
  const candidate = await proposeDiscovered(stack);
  await attachAllGates(stack.discovery, scopeOf('tenant-a'), candidate.id);
  const log = await stack.discovery.listTransformGateEvidence(scopeOf('tenant-a'), candidate.id);
  assert.equal(log.length, 7);
  assert.deepEqual(
    log.map((entry) => entry.evidence.gate),
    GATES,
  );
  for (const entry of log) {
    assert.equal(entry.candidateId, candidate.id);
    assert.equal(entry.candidateVersion, candidate.version);
    assert.ok(Object.isFrozen(entry));
    assert.ok(Object.isFrozen(entry.evidence));
    assert.equal(entry.recordedAt, FIXED_NOW());
  }
  // The evidence record is deep-frozen NESTED: mutating through a returned
  // entry can never rewrite the append-only log.
  const contractEntry = log.find((entry) => entry.evidence.gate === 'contract-validation');
  assert.ok(contractEntry !== undefined);
  assert.throws(() => {
    (contractEntry.evidence as { validated: { kind?: string } }).validated.kind = 'MUTATED';
  });
  const reread = await stack.discovery.listTransformGateEvidence(scopeOf('tenant-a'), candidate.id);
  const rereadEntry = reread.find((entry) => entry.evidence.gate === 'contract-validation');
  assert.ok(rereadEntry !== undefined);
  assert.notEqual(
    (rereadEntry.evidence as { validated: { kind?: string } }).validated.kind,
    'MUTATED',
  );
  // The benchmark evidence is the COMPLETE frozen EngineBenchmark record.
  const benchmarkEntry = log.find((entry) => entry.evidence.gate === 'bounded-benchmark-evidence');
  assert.ok(benchmarkEntry !== undefined);
  const benchmark = (benchmarkEntry.evidence as { benchmark: EngineBenchmark }).benchmark;
  assertRequiredFields(benchmark, 'EngineBenchmark');
  assert.ok(Object.isFrozen(benchmark));
});
