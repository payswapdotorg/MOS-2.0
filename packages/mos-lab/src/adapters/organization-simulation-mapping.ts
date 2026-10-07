import type { StrategyActionCandidate } from '../contracts/simulator.js';
import type { StrategyRef } from '@mos/contracts';
import type { OrganizationSearchPolicy } from '../contracts/organization-search.js';
import type { SearchedOrganizationCandidate } from '../contracts/organization-features.js';
import { longestChainOver, meanToolsPerNode } from './organization-features.js';
import { clamp01, quantizeKnob } from './parametric-support.js';

/**
 * INTERNAL documented synthetic mapping from a searched organization's
 * twelve §23 dimension features onto the LAB-004 simulator's action knobs
 * (NOT exported from the package index).
 *
 * W5-B DISCLOSURE — THE FULL DOCUMENTED MAPPING (deterministic; every one of
 * the twelve dimensions is evaluation-active; no invented sophistication —
 * this is the same disclosure class as the LAB-004/007/009 parametric
 * adapters, and it is NOT a claim about real organizational performance):
 *
 * ```
 * budgetRatio        = clamp01(orgBudgetAmount / refs.fullBudgetAmount)
 * toolCoverage       = clamp01(meanToolsPerNode / refs.fullToolsPerNode)
 * orderingThroughput = sequential 0.8 | staged 0.9 | parallel 1.0
 *                      (fixed declared factors)
 * stoppingFactor     = clamp01(maxIterations / refs.referenceIterations)
 * effectiveAgents    = agentCount × budgetRatio × orderingThroughput
 * cadencePerWeek     = cadencePerAgentPerWeek × effectiveAgents
 *                      × stoppingFactor        (quantized 1e-10)
 *
 * roleDiversity      = clamp01(distinctRoles / roleVocabulary.length)
 * criticRatio        = criticNodeIds.length / agentCount
 * modelDiversity     = clamp01(distinctModels / modelVocabulary.length)
 * novelty            = clamp01(0.25 + 0.35·roleDiversity
 *                              + 0.25·criticRatio + 0.15·modelDiversity)
 *
 * commCapacity       = N·(N−1)/2   (undirected pairs; 0 when N = 1)
 * commDensity        = communicatesWithEdges / commCapacity
 * delegationDepth    = longestDelegationChain / agentCount
 * reportingDepth     = longestReportingChain / agentCount
 * memoryFactor       = shared 1.0 | hybrid 0.6 | isolated 0.3
 *                      (fixed declared factors)
 * engagementEffort   = clamp01(0.20 + 0.30·commDensity + 0.15·memoryFactor
 *                              + 0.15·delegationDepth + 0.10·reportingDepth
 *                              + 0.10·toolCoverage)
 *
 * effectiveHorizon   = min(policy.horizonSteps, maxIterations)
 *                      (an organization that stops after k iterations only
 *                      executes k simulated steps)
 * strategyRef        = `${org.id}@${org.version}` — the organization's own
 *                      identity is the simulation's strategy reference.
 * ```
 *
 * The mapping is a PURE function of (candidate, policy): the same
 * candidate + policy always derives the same action. The kind is always
 * `content` (organizations act; the no-op/repost first-class candidates of
 * lock rule 5 are strategy-level candidates in LAB-008/009 — organization
 * search varies organization structure, not the strategy kind).
 */

/** Fixed declared execution-ordering throughput factors (documented above). */
const ORDERING_THROUGHPUT: Readonly<Record<SearchedOrganizationCandidate['features']['executionOrdering'], number>> = {
  sequential: 0.8,
  staged: 0.9,
  parallel: 1.0,
};

/** Fixed declared memory-sharing factors (documented above). */
const MEMORY_FACTOR: Readonly<Record<SearchedOrganizationCandidate['organization']['memoryPolicy']['sharing'], number>> = {
  shared: 1.0,
  hybrid: 0.6,
  isolated: 0.3,
};

const distinctCount = (values: readonly string[]): number => new Set(values).size;

/**
 * The derived simulator action of one candidate under one policy. Pure.
 */
export function organizationSimulatorAction(
  candidate: SearchedOrganizationCandidate,
  policy: OrganizationSearchPolicy,
): StrategyActionCandidate {
  const org = candidate.organization;
  const refs = policy.evaluationReferences;
  const agentCount = org.nodes.length;

  const budgetRatio = clamp01(org.budgetPolicy.organization.maxCost.amount / refs.fullBudgetAmount);
  const stoppingFactor = clamp01(org.terminationPolicy.maxIterations / refs.referenceIterations);
  const effectiveAgents = agentCount * budgetRatio * ORDERING_THROUGHPUT[candidate.features.executionOrdering];
  const cadencePerWeek = quantizeKnob(
    refs.cadencePerAgentPerWeek * effectiveAgents * stoppingFactor,
  );

  const roleDiversity = clamp01(
    distinctCount(org.nodes.map((node) => node.role)) / policy.roleVocabulary.length,
  );
  const criticRatio = candidate.features.criticNodeIds.length / agentCount;
  const modelDiversity = clamp01(
    distinctCount(org.modelAssignments.map((assignment) => assignment.modelRef)) /
      policy.modelVocabulary.length,
  );
  const novelty = clamp01(0.25 + 0.35 * roleDiversity + 0.25 * criticRatio + 0.15 * modelDiversity);

  const commCapacity = (agentCount * (agentCount - 1)) / 2;
  const commDensity =
    commCapacity === 0
      ? 0
      : org.edges.filter((edge) => edge.kind === 'communicates-with').length / commCapacity;
  const delegationDepth = longestChainOver(org, 'delegates-to') / agentCount;
  const reportingDepth = longestChainOver(org, 'reports-to') / agentCount;
  const memoryFactor = MEMORY_FACTOR[org.memoryPolicy.sharing];
  const toolCoverage = clamp01(meanToolsPerNode(candidate) / refs.fullToolsPerNode);
  const engagementEffort = clamp01(
    0.2 + 0.3 * commDensity + 0.15 * memoryFactor + 0.15 * delegationDepth +
      0.1 * reportingDepth + 0.1 * toolCoverage,
  );

  return {
    strategyRef: `${org.id}@${org.version}` as StrategyRef,
    kind: 'content',
    cadencePerWeek,
    novelty,
    engagementEffort,
  };
}

/**
 * The horizon the candidate actually simulates over: the policy horizon
 * capped by the organization's own stopping policy (maxIterations) — an
 * organization that stops after k iterations only executes k steps.
 */
export function organizationEffectiveHorizon(
  candidate: SearchedOrganizationCandidate,
  policy: OrganizationSearchPolicy,
): number {
  return Math.min(policy.horizonSteps, candidate.organization.terminationPolicy.maxIterations);
}
