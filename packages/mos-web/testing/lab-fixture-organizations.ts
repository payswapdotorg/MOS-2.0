import type { TenantId, Timestamp } from '@mos/contracts';
import type {
  OrganizationSearchResultFixture,
  RankedOrganizationCandidateFixture,
} from './lab-fixture-strategy-shapes.js';
import { REACH_SCENARIO } from './lab-fixture-support.js';

/**
 * REAL-shaped LAB-010 fixture RECORDS (the Lab workspace composition seam):
 * the §23 agent organization search result — THE THREE-WAY COMPARISON
 * MANDATE structurally present (generalist single-agent baseline +
 * caller-supplied hand-designed organization + search-generated
 * organizations), the §22 uncertainty set per candidate (expected reward
 * WITH interval, member disagreement, seed robustness, OOD verdict), full
 * twelve-dimension fingerprints + varied-dimension provenance, budget
 * accounting and the declared stopping record. Outputs are
 * counterfactual-labeled (lock rule 29) with the §24 lab-only statement.
 *
 * Coherence pins: the search evaluated under ensemble-reach-primary v3
 * (member world-model versions [4, 2] — the LAB-017 pins) and its
 * generated candidate `org-generated-critic-1` IS the benchmark's
 * 'org-search-7' candidate's producing organization (§23 origin).
 */

const T0: TenantId = 'tenant-demo' as never;
const T_OTHER: TenantId = 'tenant-other' as never;

const ts = (day: string): Timestamp => `2026-${day}T12:00:00.000Z` as never;

// ——— LAB-010: the §23 organization search result ———

const generalistOrg = {
  id: 'org-generalist-1',
  version: 1 as never,
  tenantId: T0,
  nodes: [{ nodeId: 'n1', bodyId: 'body-generalist' as never, role: 'generalist-producer' }],
  edges: [],
  modelAssignments: [{ nodeId: 'n1', modelRef: 'model:mos-default' as never }],
  memoryPolicy: { scope: 'session' as const, sharing: 'isolated' as const },
  budgetPolicy: {
    organization: { maxCost: { amount: 500, currency: 'EUR' }, maxDurationMs: 3_600_000 },
    perNode: { maxCost: { amount: 500, currency: 'EUR' }, maxDurationMs: 3_600_000 },
  },
  terminationPolicy: { maxIterations: 10, timeoutMs: 600_000 },
  evaluator: 'evaluator:org-run-v1' as never,
};

const handDesignedOrg = {
  id: 'org-hand-designed-reach',
  version: 2 as never,
  tenantId: T0,
  nodes: [
    { nodeId: 'n1', bodyId: 'body-scout' as never, role: 'scout' },
    { nodeId: 'n2', bodyId: 'body-editor' as never, role: 'editor' },
    { nodeId: 'n3', bodyId: 'body-publisher' as never, role: 'publisher' },
  ],
  edges: [
    { fromNodeId: 'n1', toNodeId: 'n2', kind: 'reports-to' as const },
    { fromNodeId: 'n2', toNodeId: 'n3', kind: 'delegates-to' as const },
  ],
  modelAssignments: [
    { nodeId: 'n1', modelRef: 'model:mos-default' as never },
    { nodeId: 'n2', modelRef: 'model:mos-editor' as never },
    { nodeId: 'n3', modelRef: 'model:mos-default' as never },
  ],
  memoryPolicy: { scope: 'session' as const, sharing: 'shared' as const },
  budgetPolicy: {
    organization: { maxCost: { amount: 900, currency: 'EUR' }, maxDurationMs: 7_200_000 },
    perNode: { maxCost: { amount: 300, currency: 'EUR' }, maxDurationMs: 3_600_000 },
  },
  terminationPolicy: { maxIterations: 14, timeoutMs: 900_000 },
  evaluator: 'evaluator:org-run-v1' as never,
};

const generatedCriticOrg = {
  id: 'org-generated-critic-1',
  version: 1 as never,
  tenantId: T0,
  nodes: [
    { nodeId: 'n1', bodyId: 'body-scout' as never, role: 'scout' },
    { nodeId: 'n2', bodyId: 'body-editor' as never, role: 'editor' },
    { nodeId: 'n3', bodyId: 'body-critic' as never, role: 'quality-critic' },
    { nodeId: 'n4', bodyId: 'body-publisher' as never, role: 'publisher' },
  ],
  edges: [
    { fromNodeId: 'n1', toNodeId: 'n2', kind: 'reports-to' as const },
    { fromNodeId: 'n2', toNodeId: 'n3', kind: 'communicates-with' as const },
    { fromNodeId: 'n3', toNodeId: 'n4', kind: 'delegates-to' as const },
  ],
  modelAssignments: [
    { nodeId: 'n1', modelRef: 'model:mos-default' as never },
    { nodeId: 'n2', modelRef: 'model:mos-editor' as never },
    { nodeId: 'n3', modelRef: 'model:mos-critic' as never },
    { nodeId: 'n4', modelRef: 'model:mos-default' as never },
  ],
  memoryPolicy: { scope: 'session' as const, sharing: 'hybrid' as const },
  budgetPolicy: {
    organization: { maxCost: { amount: 1100, currency: 'EUR' }, maxDurationMs: 9_000_000 },
    perNode: { maxCost: { amount: 275, currency: 'EUR' }, maxDurationMs: 3_600_000 },
  },
  terminationPolicy: { maxIterations: 16, timeoutMs: 900_000 },
  evaluator: 'evaluator:org-run-v1' as never,
};

const fingerprintOf = (agentCount: number, roles: string, ordering: string): Record<string, string> => ({
  'agent-count': `agents=${agentCount}`,
  roles,
  topology: 'reports-tree',
  delegation: 'editor->publisher',
  communication: 'scout<->critic',
  'memory-sharing': 'hybrid',
  critics: 'n3',
  'tool-allocation': 'none',
  'model-assignment': 'mixed',
  budget: 'eur-1100',
  'execution-ordering': ordering,
  'stopping-conditions': 'iter-16',
});

const RANKED_GENERATED_CRITIC: RankedOrganizationCandidateFixture = {
  rank: 1,
  candidate: {
    organization: generatedCriticOrg,
    features: {
      criticNodeIds: ['n3'],
      toolAllocation: { perNode: [] },
      executionOrdering: 'staged',
    },
    origin: 'generated',
  },
  evaluation: {
    expectedReward: 15.2,
    interval: { lower: 13.1, upper: 17.3 },
    uncertainty: { level: 'moderate', note: 'ensemble disagreement over two members' },
    disagreementHalfWidth: 1.05,
    seedRobustness: { seeds: [11, 23, 37, 41], perSeedExpected: [14.9, 15.4, 15.1, 15.4], spread: 0.5, halfSpread: 0.25 },
    ood: { status: 'in-coverage', flagged: false },
    calibration: { status: 'pending-reality' },
    simulatedMemberSteps: 1920,
    effectiveHorizonSteps: 12,
    counterfactual: true,
    disclosure: 'ensemble-evaluated-simulation-estimate',
  },
  provenance: {
    origin: 'generated',
    simulatorVersion: 4,
    ensembleId: 'ensemble-reach-primary' as never,
    ensembleVersion: 3,
    memberWorldModelVersions: [4, 2],
    rewardSpecVersion: 2,
    seed: 23,
    evaluationSeeds: [11, 23, 37, 41],
    horizonSteps: 12,
    fingerprint: fingerprintOf(4, 'scout+editor+critic+publisher', 'staged'),
    variedDimensions: ['agent-count', 'roles', 'critics', 'execution-ordering'],
    parentFingerprint: fingerprintOf(3, 'scout+editor+publisher', 'sequential'),
    generationIndex: 2,
    pruned: false,
    pruningRule: 'interval-dominance',
    searchedAt: ts('03-17'),
  },
  intervalOverlapWithLeader: null,
};

const RANKED_HAND_DESIGNED: RankedOrganizationCandidateFixture = {
  rank: 2,
  candidate: {
    organization: handDesignedOrg,
    features: {
      criticNodeIds: [],
      toolAllocation: { perNode: [] },
      executionOrdering: 'sequential',
    },
    origin: 'hand-designed',
  },
  evaluation: {
    expectedReward: 13.6,
    interval: { lower: 11.8, upper: 15.4 },
    uncertainty: { level: 'moderate', note: 'ensemble disagreement over two members' },
    disagreementHalfWidth: 0.9,
    seedRobustness: { seeds: [11, 23, 37, 41], perSeedExpected: [13.3, 13.9, 13.5, 13.7], spread: 0.6, halfSpread: 0.3 },
    ood: { status: 'in-coverage', flagged: false },
    calibration: { status: 'pending-reality' },
    simulatedMemberSteps: 1440,
    effectiveHorizonSteps: 12,
    counterfactual: true,
    disclosure: 'ensemble-evaluated-simulation-estimate',
  },
  provenance: {
    origin: 'hand-designed',
    simulatorVersion: 4,
    ensembleId: 'ensemble-reach-primary' as never,
    ensembleVersion: 3,
    memberWorldModelVersions: [4, 2],
    rewardSpecVersion: 2,
    seed: 23,
    evaluationSeeds: [11, 23, 37, 41],
    horizonSteps: 12,
    fingerprint: fingerprintOf(3, 'scout+editor+publisher', 'sequential'),
    variedDimensions: [
      'agent-count', 'roles', 'topology', 'delegation', 'communication', 'memory-sharing',
      'critics', 'tool-allocation', 'model-assignment', 'budget', 'execution-ordering', 'stopping-conditions',
    ],
    parentFingerprint: null,
    generationIndex: null,
    pruned: false,
    pruningRule: 'interval-dominance',
    searchedAt: ts('03-17'),
  },
  intervalOverlapWithLeader: { overlaps: true, note: 'intervals overlap the rank-1 leader — ranking is not certainty' },
};

const RANKED_GENERALIST_BASELINE: RankedOrganizationCandidateFixture = {
  rank: 3,
  candidate: {
    organization: generalistOrg,
    features: {
      criticNodeIds: [],
      toolAllocation: { perNode: [] },
      executionOrdering: 'sequential',
    },
    origin: 'generalist-single-agent-baseline',
  },
  evaluation: {
    expectedReward: 10.9,
    interval: { lower: 9.2, upper: 12.6 },
    uncertainty: { level: 'moderate', note: 'ensemble disagreement over two members' },
    disagreementHalfWidth: 0.85,
    seedRobustness: { seeds: [11, 23, 37, 41], perSeedExpected: [10.6, 11.2, 10.8, 11.0], spread: 0.6, halfSpread: 0.3 },
    ood: { status: 'in-coverage', flagged: false },
    calibration: { status: 'pending-reality' },
    simulatedMemberSteps: 960,
    effectiveHorizonSteps: 12,
    counterfactual: true,
    disclosure: 'ensemble-evaluated-simulation-estimate',
  },
  provenance: {
    origin: 'generalist-single-agent-baseline',
    simulatorVersion: 4,
    ensembleId: 'ensemble-reach-primary' as never,
    ensembleVersion: 3,
    memberWorldModelVersions: [4, 2],
    rewardSpecVersion: 2,
    seed: 23,
    evaluationSeeds: [11, 23, 37, 41],
    horizonSteps: 12,
    fingerprint: fingerprintOf(1, 'generalist-producer', 'sequential'),
    variedDimensions: [
      'agent-count', 'roles', 'topology', 'delegation', 'communication', 'memory-sharing',
      'critics', 'tool-allocation', 'model-assignment', 'budget', 'execution-ordering', 'stopping-conditions',
    ],
    parentFingerprint: null,
    generationIndex: null,
    pruned: false,
    pruningRule: 'interval-dominance',
    searchedAt: ts('03-17'),
  },
  intervalOverlapWithLeader: { overlaps: false, note: 'the generalist baseline interval sits strictly below the leader' },
};

export const FIXTURE_ORGANIZATION_SEARCH_RESULTS: readonly OrganizationSearchResultFixture[] = [
  {
    id: 'orgsearch-reach-1' as never,
    tenantId: T0,
    ranked: [RANKED_GENERATED_CRITIC, RANKED_HAND_DESIGNED, RANKED_GENERALIST_BASELINE],
    comparison: {
      // THE §23 THREE-WAY COMPARISON, structurally present on the record.
      baseline: RANKED_GENERALIST_BASELINE,
      handDesigned: RANKED_HAND_DESIGNED,
      generated: [RANKED_GENERATED_CRITIC],
    },
    budget: {
      maxMemberSteps: 12000,
      consumedMemberSteps: 8640,
      evaluationsExecuted: 18,
      generatedEvaluated: 6,
    },
    stopping: {
      reason: 'plateau-detected',
      detail: 'plateauWindow 2 consecutive non-improving generations under improvementTolerance 0.5',
      generationsExecuted: 4,
    },
    counterfactual: true,
    disclosure: 'organization-search-over-disclosed-synthetic-simulation',
    labOnly:
      'ranked lab candidates only — never a deployment decision; the real-experiment boundary (§24) is untouched',
  },
];

// ——— cross-tenant isolation (§31) ———

/** A minimal foreign search result (never listed in the demo scope). */
const foreignOrg = {
  id: 'org-other-generalist',
  version: 1 as never,
  tenantId: T_OTHER,
  nodes: [{ nodeId: 'n1', bodyId: 'body-generalist' as never, role: 'generalist-producer' }],
  edges: [],
  modelAssignments: [{ nodeId: 'n1', modelRef: 'model:mos-default' as never }],
  memoryPolicy: { scope: 'session' as const, sharing: 'isolated' as const },
  budgetPolicy: {
    organization: { maxCost: { amount: 100, currency: 'EUR' }, maxDurationMs: 600_000 },
    perNode: { maxCost: { amount: 100, currency: 'EUR' }, maxDurationMs: 600_000 },
  },
  terminationPolicy: { maxIterations: 5, timeoutMs: 300_000 },
  evaluator: 'evaluator:org-run-v1' as never,
};

const foreignRankedOf = (
  rank: number,
  origin: RankedOrganizationCandidateFixture['candidate']['origin'],
  reward: number,
): RankedOrganizationCandidateFixture => ({
  rank,
  candidate: {
    organization: foreignOrg,
    features: { criticNodeIds: [], toolAllocation: { perNode: [] }, executionOrdering: 'sequential' },
    origin,
  },
  evaluation: {
    expectedReward: reward,
    interval: { lower: reward - 0.9, upper: reward + 0.9 },
    uncertainty: { level: 'high', note: 'foreign fixture' },
    disagreementHalfWidth: 0.9,
    seedRobustness: { seeds: [3, 5], perSeedExpected: [reward - 0.1, reward + 0.1], spread: 0.2, halfSpread: 0.1 },
    ood: { status: 'in-coverage', flagged: false },
    calibration: { status: 'pending-reality' },
    simulatedMemberSteps: 60,
    effectiveHorizonSteps: 6,
    counterfactual: true,
    disclosure: 'ensemble-evaluated-simulation-estimate',
  },
  provenance: {
    origin,
    simulatorVersion: 4,
    ensembleId: 'ensemble-other-1' as never,
    ensembleVersion: 1,
    memberWorldModelVersions: [1],
    rewardSpecVersion: 1,
    seed: 3,
    evaluationSeeds: [3, 5],
    horizonSteps: 6,
    fingerprint: fingerprintOf(1, 'generalist-producer', 'sequential'),
    variedDimensions: ['agent-count', 'roles', 'stopping-conditions'],
    parentFingerprint: null,
    generationIndex: null,
    pruned: false,
    pruningRule: 'none',
    searchedAt: ts('03-18'),
  },
  intervalOverlapWithLeader: null,
});

const FOREIGN_BASELINE = foreignRankedOf(3, 'generalist-single-agent-baseline', 4.1);
const FOREIGN_HAND_DESIGNED = foreignRankedOf(2, 'hand-designed', 4.8);
const FOREIGN_GENERATED = foreignRankedOf(1, 'generated', 5.4);

export const FIXTURE_OTHER_TENANT_SEARCH: readonly OrganizationSearchResultFixture[] = [
  {
    id: 'orgsearch-other-1' as never,
    tenantId: T_OTHER,
    ranked: [FOREIGN_GENERATED, FOREIGN_HAND_DESIGNED, FOREIGN_BASELINE],
    comparison: {
      baseline: FOREIGN_BASELINE,
      handDesigned: FOREIGN_HAND_DESIGNED,
      generated: [FOREIGN_GENERATED],
    },
    budget: { maxMemberSteps: 200, consumedMemberSteps: 180, evaluationsExecuted: 3, generatedEvaluated: 1 },
    stopping: { reason: 'budget-exhausted', detail: 'foreign fixture stops at the floor', generationsExecuted: 1 },
    counterfactual: true,
    disclosure: 'organization-search-over-disclosed-synthetic-simulation',
    labOnly:
      'ranked lab candidates only — never a deployment decision; the real-experiment boundary (§24) is untouched',
  },
];
