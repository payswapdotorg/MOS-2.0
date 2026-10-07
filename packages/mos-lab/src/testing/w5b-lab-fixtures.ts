import type { AgentBody, CapabilityId, ModelRef, TenantId, Version } from '@mos/contracts';
import type { AgentOrganizationRecord } from '@mos/agents';
import { createInMemoryAgentBodyRegistry } from '@mos/agents';
import { createInMemoryOrganizationRegistry } from '@mos/agents';
import type { OrganizationRegistryPort } from '@mos/agents';
import type {
  DeclaredOrganizationFeatures,
  SearchedOrganizationCandidate,
} from '../contracts/organization-features.js';
import type {
  OrganizationSearchInput,
  OrganizationSearchPolicy,
} from '../contracts/organization-search.js';
import { createInMemoryOrganizationSearch } from '../adapters/in-memory-organization-search.js';
import type { OrganizationSearchPort } from '../contracts/organization-search.js';
import type { EnsemblePort, WorldModelEnsemble } from '../contracts/ensemble.js';
import {
  ensembleStack,
  FIXED_NOW,
  reachRewardSpec,
  scenarioOf,
  scopeOf,
} from './w4a-lab-fixtures.js';

/**
 * INTERNAL W5-B test fixtures (LAB-010 tests). NOT exported from the package
 * index — test scaffolding only, never production surface.
 *
 * The organization candidates are genuine `@mos/agents` organization record
 * shapes; `registryBackedCandidates` composes the REAL @mos/agents
 * in-memory body + organization registries (the DISCLOSED in-memory
 * doubles) so the search demonstrably consumes registry-grade organization
 * records — the lab itself only ever sees the descriptors BY VALUE.
 */

export const DAY = 86_400_000;

const organizationId = (value: string): AgentOrganizationRecord['id'] => value as AgentOrganizationRecord['id'];
const modelRef = (value: string): ModelRef => value as ModelRef;

/** A structurally valid AgentBody data record (compact test double). */
export const agentBodyOf = (id: string, summary: string): AgentBody => ({
  id: id as AgentBody['id'],
  version: 1 as AgentBody['version'],
  roleContract: { summary, duties: ['Execute the declared role contract within the organization.'] },
  inputContract: { type: 'object', properties: { objective: { type: 'string' } }, required: ['objective'] },
  outputContract: { type: 'object', properties: { result: { type: 'string' } }, required: ['result'] },
  tools: [],
  permissions: [],
  memory: { scope: 'session' },
  communication: { mayInitiate: true, allowedTopics: ['work'] },
  actionInterface: { type: 'object', properties: { act: { type: 'boolean' } }, required: ['act'] },
  capabilities: [] as CapabilityId[],
  budget: { maxCost: { amount: 100, currency: 'USD' }, maxDurationMs: 60_000 },
  latency: { p50Ms: 400, p95Ms: 1_500, p99Ms: 4_000 },
  evaluator: `evaluator:lab:${id}@1` as AgentBody['evaluator'],
  safety: { prohibitions: ['fake-engagement', 'rights-circumvention'] },
});

const noTools = (): DeclaredOrganizationFeatures['toolAllocation'] => ({ perNode: [] });

/** §23 generalist single-agent baseline: ONE node carrying every duty. */
export const baselineCandidate = (
  overrides: { readonly budgetAmount?: number } = {},
): SearchedOrganizationCandidate => ({
  organization: {
    id: organizationId('org-generalist'),
    version: 1 as Version,
    tenantId: 'tenant-a' as TenantId,
    nodes: [{ nodeId: 'agent-1', role: 'generalist', bodyId: 'body-generalist' as never }],
    edges: [],
    modelAssignments: [{ nodeId: 'agent-1', modelRef: modelRef('mos-model:standard') }],
    memoryPolicy: { scope: 'session', sharing: 'isolated' },
    budgetPolicy: {
      organization: {
        maxCost: { amount: overrides.budgetAmount ?? 500, currency: 'USD' },
        maxDurationMs: 14 * DAY,
      },
      perNode: {
        maxCost: { amount: overrides.budgetAmount ?? 500, currency: 'USD' },
        maxDurationMs: 14 * DAY,
      },
    },
    terminationPolicy: { maxIterations: 4, timeoutMs: 60_000 },
    evaluator: 'evaluator:lab:org-search@1',
  },
  features: {
    criticNodeIds: [],
    toolAllocation: {
      perNode: [{ nodeId: 'agent-1', toolRefs: ['tool-research'] }],
    },
    executionOrdering: 'sequential',
  },
  origin: 'generalist-single-agent-baseline',
});

/** The caller's hand-designed organization: planner → writer, critic review. */
export const handDesignedCandidate = (
  overrides: { readonly budgetAmount?: number } = {},
): SearchedOrganizationCandidate => ({
  organization: {
    id: organizationId('org-hand-designed'),
    version: 2 as Version,
    tenantId: 'tenant-a' as TenantId,
    nodes: [
      { nodeId: 'planner', role: 'planner', bodyId: 'body-planner' as never },
      { nodeId: 'writer', role: 'writer', bodyId: 'body-writer' as never },
      { nodeId: 'critic', role: 'critic', bodyId: 'body-critic' as never },
    ],
    edges: [
      { fromNodeId: 'planner', toNodeId: 'writer', kind: 'delegates-to' },
      { fromNodeId: 'writer', toNodeId: 'planner', kind: 'reports-to' },
      { fromNodeId: 'writer', toNodeId: 'critic', kind: 'communicates-with' },
    ],
    modelAssignments: [
      { nodeId: 'planner', modelRef: modelRef('mos-model:strong') },
      { nodeId: 'writer', modelRef: modelRef('mos-model:standard') },
      { nodeId: 'critic', modelRef: modelRef('mos-model:fast') },
    ],
    memoryPolicy: { scope: 'session', sharing: 'shared' },
    budgetPolicy: {
      organization: {
        maxCost: { amount: overrides.budgetAmount ?? 900, currency: 'USD' },
        maxDurationMs: 14 * DAY,
      },
      perNode: {
        maxCost: { amount: Math.min(300, overrides.budgetAmount ?? 900), currency: 'USD' },
        maxDurationMs: 5 * DAY,
      },
    },
    terminationPolicy: { maxIterations: 6, timeoutMs: 120_000 },
    evaluator: 'evaluator:lab:org-search@1',
  },
  features: {
    criticNodeIds: ['critic'],
    toolAllocation: {
      perNode: [
        { nodeId: 'planner', toolRefs: ['tool-research', 'tool-analytics'] },
        { nodeId: 'writer', toolRefs: ['tool-drafting'] },
      ],
    },
    executionOrdering: 'staged',
  },
  origin: 'hand-designed',
});

/** An additional composed candidate: researcher + editor pair. */
export const composedCandidate = (): SearchedOrganizationCandidate => ({
  organization: {
    id: organizationId('org-composed'),
    version: 1 as Version,
    tenantId: 'tenant-a' as TenantId,
    nodes: [
      { nodeId: 'researcher', role: 'researcher', bodyId: 'body-generalist' as never },
      { nodeId: 'editor', role: 'editor', bodyId: 'body-generalist' as never },
    ],
    edges: [{ fromNodeId: 'researcher', toNodeId: 'editor', kind: 'communicates-with' }],
    modelAssignments: [
      { nodeId: 'researcher', modelRef: modelRef('mos-model:fast') },
      { nodeId: 'editor', modelRef: modelRef('mos-model:strong') },
    ],
    memoryPolicy: { scope: 'session', sharing: 'hybrid' },
    budgetPolicy: {
      organization: { maxCost: { amount: 600, currency: 'USD' }, maxDurationMs: 10 * DAY },
      perNode: { maxCost: { amount: 300, currency: 'USD' }, maxDurationMs: 5 * DAY },
    },
    terminationPolicy: { maxIterations: 5, timeoutMs: 90_000 },
    evaluator: 'evaluator:lab:org-search@1',
  },
  features: {
    criticNodeIds: [],
    toolAllocation: { perNode: [{ nodeId: 'researcher', toolRefs: ['tool-research'] }] },
    executionOrdering: 'parallel',
  },
  origin: 'composed',
});

/** The declared search policy (budget, pruning, stopping, vocabularies). */
export const searchPolicy = (
  overrides: Partial<OrganizationSearchPolicy> = {},
): OrganizationSearchPolicy => ({
  maxMemberSteps: 4_000,
  pruning: 'none',
  maxGenerations: 3,
  plateauWindow: 2,
  improvementTolerance: 1,
  horizonSteps: 3,
  seedCount: 2,
  roleVocabulary: ['planner', 'writer', 'critic', 'researcher', 'editor', 'generalist'],
  modelVocabulary: [
    modelRef('mos-model:standard'),
    modelRef('mos-model:strong'),
    modelRef('mos-model:fast'),
  ],
  toolVocabulary: ['tool-research', 'tool-analytics', 'tool-drafting', 'tool-render'],
  budgetScaleFactor: 1.5,
  stoppingIterationDelta: 2,
  evaluationReferences: {
    cadencePerAgentPerWeek: 4,
    fullBudgetAmount: 1_000,
    fullToolsPerNode: 2,
    referenceIterations: 8,
  },
  ...overrides,
});

/** The composed organization search over the W4-A fixture ensemble. */
export const orgSearchStack = async (): Promise<{
  readonly search: OrganizationSearchPort;
  readonly ensemble: EnsemblePort;
  readonly registered: WorldModelEnsemble;
}> => {
  const stack = await ensembleStack();
  const search = createInMemoryOrganizationSearch({
    ensemble: stack.ensemble,
    now: FIXED_NOW,
  });
  return { search, ensemble: stack.ensemble, registered: stack.registered };
};

/** A standard search input (baseline + hand-designed over the fixture ensemble). */
export const searchInput = (
  search: OrganizationSearchPort,
  overrides: Partial<OrganizationSearchInput> = {},
): OrganizationSearchInput => ({
  scope: scopeOf('tenant-a'),
  scenario: scenarioOf(),
  ensembleId: 'ensemble-reach' as never,
  ensembleVersion: 1,
  rewardSpec: reachRewardSpec(),
  candidates: {
    baseline: baselineCandidate(),
    handDesigned: handDesignedCandidate(),
    additional: [composedCandidate()],
  },
  seed: 424_242,
  policy: searchPolicy(),
  ...overrides,
});

/**
 * The hand-designed candidate RESOLVED THROUGH the REAL @mos/agents
 * in-memory registries (the disclosed doubles): bodies registered, the
 * organization registered + validated by the agents module, then read back
 * by exact version — proof that the search consumes genuine
 * registry-grade organization records.
 */
export const registryBackedHandDesigned = (): {
  readonly registry: OrganizationRegistryPort;
  readonly candidate: SearchedOrganizationCandidate;
} => {
  const bodyRegistry = createInMemoryAgentBodyRegistry({
    initial: [
      agentBodyOf('body-generalist', 'Generalist single-agent baseline body (test fixture).'),
      agentBodyOf('body-planner', 'Hand-designed planner body (test fixture).'),
      agentBodyOf('body-writer', 'Hand-designed writer body (test fixture).'),
      agentBodyOf('body-critic', 'Hand-designed critic body (test fixture).'),
    ],
  });
  const registry = createInMemoryOrganizationRegistry({ bodyRegistry });
  const template = handDesignedCandidate();
  registry.registerOrganization(scopeOf('tenant-a'), template.organization);
  const resolved = registry.requireOrganization(
    scopeOf('tenant-a'),
    template.organization.id,
    template.organization.version,
  );
  return {
    registry,
    candidate: { organization: resolved, features: template.features, origin: 'hand-designed' },
  };
};

/** A structurally INVALID candidate: a delegates-to cycle (planner↔writer). */
export const cyclicDelegationCandidate = (): SearchedOrganizationCandidate => {
  const template = handDesignedCandidate();
  return {
    organization: {
      ...template.organization,
      id: organizationId('org-cyclic'),
      edges: [
        { fromNodeId: 'planner', toNodeId: 'writer', kind: 'delegates-to' },
        { fromNodeId: 'writer', toNodeId: 'planner', kind: 'delegates-to' },
      ],
    },
    features: { criticNodeIds: [], toolAllocation: noTools(), executionOrdering: 'sequential' },
    origin: 'composed',
  };
};

/** A structurally INVALID candidate: writer has no model assignment. */
export const missingAssignmentCandidate = (): SearchedOrganizationCandidate => {
  const template = handDesignedCandidate();
  return {
    organization: {
      ...template.organization,
      id: organizationId('org-unassigned'),
      modelAssignments: template.organization.modelAssignments.filter(
        (assignment) => assignment.nodeId !== 'writer',
      ),
    },
    features: { criticNodeIds: [], toolAllocation: noTools(), executionOrdering: 'sequential' },
    origin: 'composed',
  };
};
