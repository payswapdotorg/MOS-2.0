import { assertRequiredFields } from '@mos/contracts';
import type { CapabilityRequirement, TenantScope } from '@mos/contracts';
import type { CapabilityRegistryPort } from '@mos/capabilities';
import type {
  ComposedTransformCitation,
  KnownTransformCitation,
  TransformCandidate,
  TransformCandidateDerivation,
} from '../contracts/transform-candidate.js';
import type { TransformDefinitionRegistry } from '../contracts/transform-definition.js';
import type { TransformGraphPort } from '../contracts/transform-graph.js';
import type { IdeaGraph } from '../contracts/idea-graph.js';
import type {
  TransformGateEvidence,
  TransformGateEvidenceInput,
  TransformPromotionGateName,
} from '../contracts/transform-promotion-gates.js';
import type { TransformDiscoveryError, TransformDiscoveryErrorCode } from '../contracts/transform-discovery.js';
import { cloneDeep, deepFreeze, isBlankString, isPlainObject, isPositiveInteger } from './parametric-support.js';
import { validateTransformContractDeclaration } from './transform-contract-validation.js';

/**
 * THE SEVEN §8 GATES — attach-time evidence construction + promotion-time
 * re-checks (LAB-012 adapter internals, shared by the in-memory discovery
 * adapter). Fail-closed by construction: every gate produces a typed,
 * named failure and evidence only attaches when the gate's own validation
 * passes.
 */

/** The narrow dependency views the gate computations need. */
export interface TransformGateDependencies {
  readonly definitions: Pick<TransformDefinitionRegistry, 'getTransformDefinition'>;
  readonly capabilities: Pick<CapabilityRegistryPort, 'get'>;
  readonly graphs: Pick<TransformGraphPort, 'getTransformGraph'>;
  readonly ideaGraph?: Pick<IdeaGraph, 'getIdeaNode'>;
}

/** The seven §8 gates in order — the promotion evaluation order. */
export const GATES: readonly TransformPromotionGateName[] = [
  'contract-validation',
  'capability-feasibility',
  'rights-policy-feasibility',
  'evaluator',
  'bounded-benchmark-evidence',
  'immutable-version',
  'provenance',
];

/** The promotion failure code per gate (§8 order). */
export const PROMOTION_FAILURE_CODE: Readonly<
  Record<TransformPromotionGateName, TransformDiscoveryErrorCode>
> = {
  'contract-validation': 'contract-validation-failed',
  'capability-feasibility': 'capability-feasibility-failed',
  'rights-policy-feasibility': 'rights-policy-declaration-mismatch',
  evaluator: 'evaluator-binding-mismatch',
  'bounded-benchmark-evidence': 'benchmark-not-passed',
  'immutable-version': 'stale-freeze-declaration',
  provenance: 'provenance-incomplete',
};

/** Named missing required fields of a frozen contract record (ENG-004 discipline). */
const benchmarkViolations = (benchmark: object): readonly string[] => {
  try {
    assertRequiredFields(benchmark, 'EngineBenchmark');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fields = message.split('missing required fields:')[1];
    if (fields === undefined) {
      return ['unknown'];
    }
    return fields.split(',').map((field) => field.trim());
  }
  return [];
};

const sameStringArray = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const nonBlankStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string' && !isBlankString(entry));

const hasDerivationRefs = (derivation: TransformCandidateDerivation): boolean =>
  derivation.ideaNodeIds.length > 0 ||
  derivation.featureBundleIds.length > 0 ||
  derivation.corpusId !== null ||
  derivation.learnedStrategyCandidateIds.length > 0 ||
  derivation.organizationSearchResultIds.length > 0;

const gateFail = (
  error: TransformDiscoveryErrorCode,
  message: string,
  gate: TransformPromotionGateName,
): TransformDiscoveryError => ({ error, message, gate });

/**
 * Derivation validation (proposal, revision and gates 2/7 share it):
 * `provenanceRef` non-blank, reference arrays well-formed, DISCOVERED
 * candidates carry at least one derivation reference, and idea references
 * resolve when an Idea Graph view is wired (LAB-003 discipline; when no
 * view is wired the references are structural declarations — disclosed).
 */
export const validateCandidateDerivation = async (
  deps: TransformGateDependencies,
  scope: TenantScope,
  derivation: TransformCandidateDerivation,
  requireRefs: boolean,
): Promise<TransformDiscoveryError | null> => {
  if (
    !isPlainObject(derivation) ||
    typeof derivation.provenanceRef !== 'string' ||
    isBlankString(derivation.provenanceRef)
  ) {
    return { error: 'invalid-input', message: 'derivation.provenanceRef must be a non-blank provenance reference' };
  }
  if (
    !Array.isArray(derivation.ideaNodeIds) ||
    !nonBlankStringArray(derivation.ideaNodeIds) ||
    !Array.isArray(derivation.featureBundleIds) ||
    !nonBlankStringArray(derivation.featureBundleIds) ||
    !Array.isArray(derivation.learnedStrategyCandidateIds) ||
    !nonBlankStringArray(derivation.learnedStrategyCandidateIds) ||
    !Array.isArray(derivation.organizationSearchResultIds) ||
    !nonBlankStringArray(derivation.organizationSearchResultIds)
  ) {
    return { error: 'invalid-input', message: 'derivation reference arrays must be arrays of non-blank ids' };
  }
  if (requireRefs && !hasDerivationRefs(derivation)) {
    return {
      error: 'empty-derivation',
      message:
        'discovered candidates must carry at least one derivation reference (idea nodes, feature bundles, corpus snapshot, learned candidates or organization search results) — candidates never float free of evidence',
    };
  }
  if (deps.ideaGraph !== undefined) {
    for (const ideaNodeId of derivation.ideaNodeIds) {
      const node = await deps.ideaGraph.getIdeaNode(scope, ideaNodeId);
      if (node === null) {
        return {
          error: 'unknown-derivation-ref',
          message: `derivation idea node does not resolve in this tenant scope: ${String(ideaNodeId)}`,
        };
      }
    }
  }
  return null;
};

/**
 * Construct one gate's evidence from the CURRENT candidate version
 * (attach-time, fail-closed). Derived gates (1, 2, 7) are computed from the
 * candidate; declared gates (3, 4, 5, 6) are validated against the contract
 * they gate. Returns the typed failure when the gate's own validation
 * fails — evidence never attaches otherwise.
 */
export const buildGateEvidence = async (
  deps: TransformGateDependencies,
  scope: TenantScope,
  current: TransformCandidate,
  input: TransformGateEvidenceInput,
): Promise<TransformGateEvidence | TransformDiscoveryError> => {
  const contract = current.proposedContract;
  switch (input.gate) {
    case 'contract-validation': {
      const problem = validateTransformContractDeclaration(contract);
      if (problem !== null) {
        return gateFail('contract-validation-failed', problem.message, 'contract-validation');
      }
      return {
        gate: 'contract-validation',
        validated: {
          kind: contract.kind,
          inputConstraintName: contract.inputConstraint.name,
          outputTypes: [...contract.outputContract.outputTypes],
          humanParticipation: contract.humanParticipation,
        },
      };
    }
    case 'capability-feasibility': {
      const resolved: CapabilityRequirement[] = [];
      for (const requirement of contract.capabilityRequirements) {
        if (deps.capabilities.get(requirement.capabilityId, requirement.version) === undefined) {
          return gateFail(
            'unresolved-capability-requirement',
            `declared capability requirement does not resolve in the @mos/capabilities vocabulary: ${String(requirement.capabilityId)}@${String(requirement.version)}`,
            'capability-feasibility',
          );
        }
        resolved.push(requirement);
      }
      return { gate: 'capability-feasibility', resolvedRequirements: Object.freeze(resolved) };
    }
    case 'rights-policy-feasibility': {
      if (!nonBlankStringArray(input.rightsRequirements) || !nonBlankStringArray(input.policyRequirements)) {
        return gateFail(
          'invalid-input',
          'rights/policy feasibility declarations must be arrays of non-blank references',
          'rights-policy-feasibility',
        );
      }
      if (
        !sameStringArray(input.rightsRequirements, contract.rightsRequirements) ||
        !sameStringArray(input.policyRequirements, contract.policyRequirements)
      ) {
        return gateFail(
          'rights-policy-declaration-mismatch',
          "declared rights/policy requirements must cover EXACTLY the proposed contract's declared requirements (same refs, same order)",
          'rights-policy-feasibility',
        );
      }
      return {
        gate: 'rights-policy-feasibility',
        rightsRequirements: Object.freeze([...input.rightsRequirements]),
        policyRequirements: Object.freeze([...input.policyRequirements]),
        evaluation: 'structural-declaration-only',
      };
    }
    case 'evaluator': {
      if (isBlankString(input.evaluatorRef)) {
        return gateFail('invalid-input', 'evaluator binding requires a non-blank evaluator reference', 'evaluator');
      }
      if (input.evaluatorRef !== contract.evaluator) {
        return gateFail(
          'evaluator-binding-mismatch',
          `the bound evaluator must be the proposed contract's own evaluator (contract: ${String(contract.evaluator)}, bound: ${String(input.evaluatorRef)})`,
          'evaluator',
        );
      }
      if (!isPlainObject(input.inputSchema) || !isPlainObject(input.outputSchema)) {
        return gateFail('invalid-input', 'evaluator contract shape must declare inputSchema and outputSchema objects', 'evaluator');
      }
      return {
        gate: 'evaluator',
        evaluatorRef: input.evaluatorRef,
        inputSchema: deepFreeze(cloneDeep(input.inputSchema)),
        outputSchema: deepFreeze(cloneDeep(input.outputSchema)),
      };
    }
    case 'bounded-benchmark-evidence': {
      if (!isPlainObject(input.benchmark)) {
        return gateFail(
          'incomplete-benchmark-record',
          'bounded benchmark evidence must be a frozen-shape EngineBenchmark record',
          'bounded-benchmark-evidence',
        );
      }
      const violations = benchmarkViolations(input.benchmark);
      if (violations.length > 0) {
        return gateFail(
          'incomplete-benchmark-record',
          `benchmark record is missing required fields: ${violations.join(', ')} — incomplete records never become gate evidence`,
          'bounded-benchmark-evidence',
        );
      }
      return { gate: 'bounded-benchmark-evidence', benchmark: deepFreeze(cloneDeep(input.benchmark)) };
    }
    case 'immutable-version': {
      if (!isPositiveInteger(input.candidateVersion)) {
        return gateFail(
          'invalid-input',
          'the immutable-version freeze declaration requires an integer candidate version ≥ 1',
          'immutable-version',
        );
      }
      if (input.candidateVersion !== current.version) {
        return gateFail(
          'stale-freeze-declaration',
          `the freeze declaration cites candidate version ${String(input.candidateVersion)} but the current version is ${String(current.version)} — promotion freezes the CURRENT version`,
          'immutable-version',
        );
      }
      if (input.promotionPath !== 'registry-append-only') {
        return gateFail(
          'invalid-input',
          `the only legal promotion path is the registry's append-only register/revise (got: ${String(input.promotionPath)})`,
          'immutable-version',
        );
      }
      return { gate: 'immutable-version', candidateVersion: input.candidateVersion, promotionPath: 'registry-append-only' };
    }
    case 'provenance': {
      const derivationProblem = await validateCandidateDerivation(deps, scope, current.derivation, current.origin === 'discovered');
      if (derivationProblem !== null) {
        return gateFail('provenance-incomplete', derivationProblem.message, 'provenance');
      }
      if (current.origin === 'known') {
        const citation = current.citation as KnownTransformCitation;
        const definition = await deps.definitions.getTransformDefinition(scope, citation.definitionId, citation.definitionVersion);
        if (definition === null) {
          return gateFail('provenance-incomplete', `the cited known definition no longer resolves: ${String(citation.definitionId)}@${String(citation.definitionVersion)}`, 'provenance');
        }
      }
      if (current.origin === 'composed') {
        const citation = current.citation as ComposedTransformCitation;
        const graph = await deps.graphs.getTransformGraph(scope, citation.graphId, citation.graphVersion);
        if (graph === null) {
          return gateFail('provenance-incomplete', `the cited composition graph no longer resolves: ${String(citation.graphId)}@${String(citation.graphVersion)}`, 'provenance');
        }
      }
      return {
        gate: 'provenance',
        origin: current.origin,
        derivation: deepFreeze(cloneDeep(current.derivation)),
        citation: current.citation === null ? null : deepFreeze(cloneDeep(current.citation)),
      };
    }
  }
};

/**
 * Promotion-time re-check of one gate's evidence against the candidate
 * version being promoted (defense-in-depth: the same checks attach-time,
 * re-run fail-closed). Returns the failure reason or `null` when the gate
 * passes. Gates whose evidence is derived (1, 2, 7) re-validate; gates with
 * declared evidence (3, 4, 5, 6) re-compare against the current contract.
 */
export const checkGateAtPromotion = async (
  deps: TransformGateDependencies,
  scope: TenantScope,
  current: TransformCandidate,
  evidence: TransformGateEvidence,
): Promise<string | null> => {
  const contract = current.proposedContract;
  switch (evidence.gate) {
    case 'contract-validation': {
      const problem = validateTransformContractDeclaration(contract);
      return problem === null ? null : problem.message;
    }
    case 'capability-feasibility': {
      for (const requirement of contract.capabilityRequirements) {
        if (deps.capabilities.get(requirement.capabilityId, requirement.version) === undefined) {
          return `declared capability requirement no longer resolves: ${String(requirement.capabilityId)}@${String(requirement.version)}`;
        }
      }
      return null;
    }
    case 'rights-policy-feasibility': {
      if (
        !sameStringArray(evidence.rightsRequirements, contract.rightsRequirements) ||
        !sameStringArray(evidence.policyRequirements, contract.policyRequirements)
      ) {
        return "the recorded rights/policy declarations no longer cover the proposed contract's requirements";
      }
      return null;
    }
    case 'evaluator': {
      return evidence.evaluatorRef === contract.evaluator
        ? null
        : "the bound evaluator no longer matches the proposed contract's evaluator";
    }
    case 'bounded-benchmark-evidence': {
      return evidence.benchmark.result === 'passed'
        ? null
        : `the attached benchmark record is complete but its result is "${String(evidence.benchmark.result)}" — bounded benchmark evidence must be passing evidence`;
    }
    case 'immutable-version': {
      return evidence.candidateVersion === current.version && evidence.promotionPath === 'registry-append-only'
        ? null
        : 'the freeze declaration no longer matches the candidate version being promoted';
    }
    case 'provenance': {
      const derivationProblem = await validateCandidateDerivation(deps, scope, current.derivation, current.origin === 'discovered');
      if (derivationProblem !== null) {
        return derivationProblem.message;
      }
      // Citation re-resolution (defense-in-depth, symmetric with attach-time):
      // the origin citation must still resolve at its EXACT version(s).
      if (current.origin === 'known') {
        const citation = current.citation as KnownTransformCitation;
        const definition = await deps.definitions.getTransformDefinition(scope, citation.definitionId, citation.definitionVersion);
        if (definition === null) {
          return `the cited known definition no longer resolves: ${String(citation.definitionId)}@${String(citation.definitionVersion)}`;
        }
      }
      if (current.origin === 'composed') {
        const citation = current.citation as ComposedTransformCitation;
        const graph = await deps.graphs.getTransformGraph(scope, citation.graphId, citation.graphVersion);
        if (graph === null) {
          return `the cited composition graph no longer resolves: ${String(citation.graphId)}@${String(citation.graphVersion)}`;
        }
      }
      return null;
    }
  }
};
