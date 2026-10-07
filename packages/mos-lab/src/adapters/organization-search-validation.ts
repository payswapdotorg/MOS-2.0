import type { OrganizationSearchError } from '../contracts/organization-search.js';
import type { OrganizationSearchPolicy } from '../contracts/organization-search.js';
import type { OrganizationSearchInput } from '../contracts/organization-search.js';
import type {
  OrganizationCandidateOrigin,
  SearchedOrganizationCandidate,
} from '../contracts/organization-features.js';
import { validateRewardSpec } from './reward-computation.js';
import { organizationCandidateFaults } from './organization-features.js';

/**
 * INTERNAL input validation for the LAB-010 organization search (NOT
 * exported from the package index). Fail-closed with named codes; also the
 * ownership boundary: caller-supplied candidates are CLONED into lab-owned
 * copies here (caller data is never mutated or frozen in place).
 */

const fail = (error: OrganizationSearchError['error'], message: string): OrganizationSearchError => ({
  error,
  message,
});

/** Structural validation of the declared search policy (null = valid). */
export function validateOrganizationSearchPolicy(
  policy: OrganizationSearchPolicy,
): string | null {
  const faults: readonly [boolean, string][] = [
    [!Number.isInteger(policy.maxMemberSteps) || policy.maxMemberSteps < 1, 'maxMemberSteps must be an integer >= 1'],
    [policy.pruning !== 'none' && policy.pruning !== 'interval-dominance', 'pruning must be none | interval-dominance'],
    [!Number.isInteger(policy.maxGenerations) || policy.maxGenerations < 1, 'maxGenerations must be an integer >= 1'],
    [!Number.isInteger(policy.plateauWindow) || policy.plateauWindow < 1, 'plateauWindow must be an integer >= 1'],
    [typeof policy.improvementTolerance !== 'number' || !Number.isFinite(policy.improvementTolerance) || policy.improvementTolerance < 0, 'improvementTolerance must be a finite number >= 0'],
    [!Number.isInteger(policy.horizonSteps) || policy.horizonSteps < 1, 'horizonSteps must be an integer >= 1'],
    [!Number.isInteger(policy.seedCount) || policy.seedCount < 2, 'seedCount must be an integer >= 2 (seed robustness requires two seeds)'],
    [!Array.isArray(policy.roleVocabulary) || policy.roleVocabulary.length === 0 || policy.roleVocabulary.some((role) => typeof role !== 'string' || role.trim().length === 0), 'roleVocabulary must be a non-empty array of non-blank roles'],
    [!Array.isArray(policy.modelVocabulary) || policy.modelVocabulary.length === 0, 'modelVocabulary must be a non-empty array of model refs'],
    [!Array.isArray(policy.toolVocabulary) || policy.toolVocabulary.some((tool) => typeof tool !== 'string' || tool.trim().length === 0), 'toolVocabulary must be an array of non-blank tool refs'],
    [typeof policy.budgetScaleFactor !== 'number' || !Number.isFinite(policy.budgetScaleFactor) || policy.budgetScaleFactor <= 1, 'budgetScaleFactor must be a finite number > 1'],
    [!Number.isInteger(policy.stoppingIterationDelta) || policy.stoppingIterationDelta < 1, 'stoppingIterationDelta must be an integer >= 1'],
  ];
  for (const [bad, detail] of faults) {
    if (bad) {
      return `searchPolicy.${detail}`;
    }
  }
  const refs = policy.evaluationReferences;
  if (
    !refs || typeof refs.cadencePerAgentPerWeek !== 'number' || !Number.isFinite(refs.cadencePerAgentPerWeek) || refs.cadencePerAgentPerWeek <= 0 ||
    typeof refs.fullBudgetAmount !== 'number' || !Number.isFinite(refs.fullBudgetAmount) || refs.fullBudgetAmount <= 0 ||
    typeof refs.fullToolsPerNode !== 'number' || !Number.isFinite(refs.fullToolsPerNode) || refs.fullToolsPerNode <= 0 ||
    typeof refs.referenceIterations !== 'number' || !Number.isFinite(refs.referenceIterations) || refs.referenceIterations <= 0
  ) {
    return 'searchPolicy.evaluationReferences must declare positive finite cadencePerAgentPerWeek, fullBudgetAmount, fullToolsPerNode and referenceIterations';
  }
  return null;
}

/** Clone a caller-supplied candidate into a lab-owned copy (ownership). */
export function ownedCandidateOf(
  candidate: SearchedOrganizationCandidate,
  origin: OrganizationCandidateOrigin,
): SearchedOrganizationCandidate {
  const org = candidate.organization;
  return {
    organization: {
      id: org.id,
      version: org.version,
      tenantId: org.tenantId,
      nodes: org.nodes.map((node) => ({ ...node })),
      edges: org.edges.map((edge) => ({ ...edge })),
      modelAssignments: org.modelAssignments.map((assignment) => ({ ...assignment })),
      memoryPolicy: { ...org.memoryPolicy },
      budgetPolicy: {
        organization: {
          maxCost: { ...org.budgetPolicy.organization.maxCost },
          maxDurationMs: org.budgetPolicy.organization.maxDurationMs,
        },
        perNode: {
          maxCost: { ...org.budgetPolicy.perNode.maxCost },
          maxDurationMs: org.budgetPolicy.perNode.maxDurationMs,
        },
      },
      terminationPolicy: { ...org.terminationPolicy },
      evaluator: org.evaluator,
    },
    features: {
      criticNodeIds: [...candidate.features.criticNodeIds],
      toolAllocation: {
        perNode: candidate.features.toolAllocation.perNode.map((entry) => ({
          nodeId: entry.nodeId,
          toolRefs: [...entry.toolRefs],
        })),
      },
      executionOrdering: candidate.features.executionOrdering,
    },
    origin,
  };
}

/**
 * Validate the whole search input and collect the lab-owned initial
 * candidates in slot order (baseline, hand-designed, additional). The §23
 * comparison mandate is enforced here: both required slots must be present,
 * every candidate must be structurally valid, tenant-scoped to the search
 * scope, and the baseline must be a SINGLE-agent organization.
 */
export function collectInitialCandidates(
  input: OrganizationSearchInput,
): { readonly error: OrganizationSearchError } | { readonly candidates: readonly SearchedOrganizationCandidate[] } {
  const slots = input.candidates as Partial<OrganizationSearchInput['candidates']>;
  if (slots?.baseline === undefined || slots?.baseline === null) {
    return {
      error: fail(
        'missing-required-candidate',
        'the §23 comparison mandate requires candidates.baseline (the generalist single-agent baseline)',
      ),
    };
  }
  if (slots?.handDesigned === undefined || slots?.handDesigned === null) {
    return {
      error: fail(
        'missing-required-candidate',
        'the §23 comparison mandate requires candidates.handDesigned (the caller-supplied hand-designed organization)',
      ),
    };
  }
  const initialSpecs: readonly {
    readonly slot: OrganizationCandidateOrigin;
    readonly candidate: SearchedOrganizationCandidate;
  }[] = [
    { slot: 'generalist-single-agent-baseline', candidate: slots.baseline },
    { slot: 'hand-designed', candidate: slots.handDesigned },
    ...(slots.additional ?? []).map((candidate) => ({ slot: 'composed' as const, candidate })),
  ];
  const owned: SearchedOrganizationCandidate[] = [];
  for (const spec of initialSpecs) {
    const candidate = ownedCandidateOf(spec.candidate, spec.slot);
    const faults = organizationCandidateFaults(candidate);
    if (faults.length > 0) {
      return {
        error: fail(
          'invalid-candidate-organization',
          `candidate ${candidate.organization.id}@${candidate.organization.version} (${spec.slot}) is structurally invalid: ${faults.map((f) => `${f.code}: ${f.detail}`).join('; ')}`,
        ),
      };
    }
    if (candidate.organization.tenantId !== input.scope.tenantId) {
      return {
        error: fail(
          'tenant-scope-mismatch',
          `candidate ${candidate.organization.id}@${candidate.organization.version} belongs to tenant ${candidate.organization.tenantId} but the search runs under tenant ${input.scope.tenantId}`,
        ),
      };
    }
    if (spec.slot === 'generalist-single-agent-baseline' && candidate.organization.nodes.length !== 1) {
      return {
        error: fail(
          'baseline-not-single-agent',
          `the §23 generalist baseline must be a SINGLE-agent organization (got ${candidate.organization.nodes.length} nodes)`,
        ),
      };
    }
    owned.push(candidate);
  }
  const policyFault = validateOrganizationSearchPolicy(input.policy);
  if (policyFault !== null) {
    return { error: fail('invalid-input', policyFault) };
  }
  if (typeof input.seed !== 'number' || !Number.isFinite(input.seed)) {
    return { error: fail('invalid-input', 'seed is required and must be a finite number') };
  }
  const specFault = validateRewardSpec(input.rewardSpec);
  if (specFault !== null) {
    return { error: fail('invalid-input', specFault) };
  }
  return { candidates: owned };
}
