import type { CostBasis } from '@mos/contracts';
import type { ProposedTransformContract, TransformDefinitionError } from '../contracts/transform-definition.js';
import type { TransformKind } from '../contracts/transform-definition.js';
import type { ReferenceModality } from '../contracts/corpus.js';
import { isBlankString, isFiniteNonNegative, isPlainObject, isPositiveInteger } from './parametric-support.js';

/**
 * SHARED structural validation of a transform contract declaration
 * (LAB-011 registry rules, extracted for LAB-012).
 *
 * Both the transform definition registry (W5-A) and the transform discovery
 * adapter (W6-A, LAB-012) validate proposals against EXACTLY these rules —
 * a candidate that cannot become a definition version is rejected at
 * proposal time, and promotion re-runs the same check fail-closed (§8 gate
 * 1). One validator, no drift between the two surfaces.
 */

/** The frozen thirteen kinds (architecture §5) — the complete vocabulary. */
export const TRANSFORM_KINDS: readonly TransformKind[] = [
  'no-op-repost',
  'clip',
  'crop-reframe',
  'remix',
  'compilation',
  'reaction',
  'podcast',
  'translation-dubbing',
  'voiceover',
  'stylization-anime',
  'ai-generated',
  'human-contribution',
  'hybrid',
];

const REFERENCE_MODALITIES: readonly ReferenceModality[] = [
  'text',
  'image',
  'audio',
  'video',
  'structured',
  'mixed',
];

const COST_BASES: readonly CostBasis[] = [
  'per-invocation',
  'per-second',
  'per-minute',
  'per-byte',
  'per-artifact',
  'per-tenant-hour',
];

const isNonBlankStringArray = (value: readonly unknown[]): boolean =>
  value.every((entry) => typeof entry === 'string' && !isBlankString(entry));

const isNonNegativeInteger = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const validateInputConstraint = (
  constraint: ProposedTransformContract['inputConstraint'],
): string | null => {
  if (
    !isPlainObject(constraint) ||
    typeof constraint.name !== 'string' ||
    isBlankString(constraint.name)
  ) {
    return 'inputConstraint.name must be a non-blank string';
  }
  if (
    !Array.isArray(constraint.acceptedTypes) ||
    constraint.acceptedTypes.length === 0 ||
    !isNonBlankStringArray(constraint.acceptedTypes)
  ) {
    return 'inputConstraint.acceptedTypes must be a non-empty array of non-blank artifact types';
  }
  if (
    !Array.isArray(constraint.acceptedModalities) ||
    constraint.acceptedModalities.length === 0 ||
    !constraint.acceptedModalities.every((modality) =>
      REFERENCE_MODALITIES.includes(modality as ReferenceModality),
    )
  ) {
    return 'inputConstraint.acceptedModalities must be a non-empty array of reference modalities (text | image | audio | video | structured | mixed)';
  }
  if (
    !isNonNegativeInteger(constraint.minInputs) ||
    !isNonNegativeInteger(constraint.maxInputs) ||
    constraint.minInputs > constraint.maxInputs
  ) {
    return `inputConstraint input counts must be integers with 0 ≤ minInputs ≤ maxInputs (got ${String(constraint.minInputs)}..${String(constraint.maxInputs)})`;
  }
  if (typeof constraint.requiresRights !== 'boolean') {
    return 'inputConstraint.requiresRights must be a boolean';
  }
  return null;
};

const validateOutputContract = (
  outputContract: ProposedTransformContract['outputContract'],
): string | null => {
  if (
    !Array.isArray(outputContract.outputTypes) ||
    outputContract.outputTypes.length === 0 ||
    !isNonBlankStringArray(outputContract.outputTypes)
  ) {
    return 'outputContract.outputTypes must be a non-empty array of non-blank artifact types';
  }
  if (!isPositiveInteger(outputContract.outputCount)) {
    return `outputContract.outputCount must be an integer ≥ 1 (got ${String(outputContract.outputCount)})`;
  }
  return null;
};

/**
 * FULL structural validation of a transform contract declaration (the
 * registry's declaration rules, §5/lock rule 5). Returns a typed failure or
 * `null` when well-formed. NO-OP/REPOST IS NEVER SPECIAL-CASED: zero
 * capability requirements is a valid declared state for ANY kind.
 */
export const validateTransformContractDeclaration = (
  contract: ProposedTransformContract,
): TransformDefinitionError | null => {
  if (!TRANSFORM_KINDS.includes(contract.kind)) {
    return {
      error: 'unknown-transform-kind',
      message: `transform kind must be one of the frozen §5 thirteen kinds (got: ${String(contract.kind)})`,
    };
  }
  if (typeof contract.humanParticipation !== 'boolean') {
    return { error: 'invalid-input', message: 'humanParticipation must be a boolean' };
  }
  if (
    (contract.kind === 'human-contribution' || contract.kind === 'hybrid') &&
    contract.humanParticipation !== true
  ) {
    return {
      error: 'human-participation-required',
      message: `transform kind ${contract.kind} must declare humanParticipation: true — human participation is part of the contract`,
    };
  }
  const constraintProblem = validateInputConstraint(contract.inputConstraint);
  if (constraintProblem !== null) {
    return { error: 'invalid-input', message: constraintProblem };
  }
  const outputProblem = validateOutputContract(contract.outputContract);
  if (outputProblem !== null) {
    return { error: 'invalid-input', message: outputProblem };
  }
  if (!isPlainObject(contract.parameters)) {
    return { error: 'invalid-input', message: 'parameters must be a JSON object (the declared parameter space)' };
  }
  if (!Array.isArray(contract.capabilityRequirements)) {
    return {
      error: 'invalid-input',
      message: 'capabilityRequirements must be an array (possibly empty — the declared no-op state)',
    };
  }
  for (const requirement of contract.capabilityRequirements) {
    if (
      !isPlainObject(requirement) ||
      typeof requirement.capabilityId !== 'string' ||
      isBlankString(requirement.capabilityId) ||
      !isPositiveInteger(requirement.version)
    ) {
      return {
        error: 'invalid-input',
        message: `every capability requirement must be a { capabilityId, version } pair with a non-blank id and integer version ≥ 1 (got: ${JSON.stringify(requirement)})`,
      };
    }
  }
  if (typeof contract.evaluator !== 'string' || isBlankString(contract.evaluator)) {
    return { error: 'invalid-input', message: 'evaluator must be a non-blank evaluator reference' };
  }
  const cost = contract.costModel;
  if (
    !isPlainObject(cost) ||
    !COST_BASES.includes(cost.basis as CostBasis) ||
    !isFiniteNonNegative(cost.amount) ||
    typeof cost.currency !== 'string' ||
    isBlankString(cost.currency)
  ) {
    return { error: 'invalid-input', message: 'costModel must be { basis, amount ≥ 0, currency } with a frozen CostBasis' };
  }
  const latency = contract.latencyModel;
  if (
    !isPlainObject(latency) ||
    !isFiniteNonNegative(latency.p50Ms) ||
    !isFiniteNonNegative(latency.p95Ms) ||
    !isFiniteNonNegative(latency.p99Ms)
  ) {
    return { error: 'invalid-input', message: 'latencyModel must be { p50Ms, p95Ms, p99Ms } with finite non-negative values' };
  }
  if (
    !Array.isArray(contract.rightsRequirements) ||
    !isNonBlankStringArray(contract.rightsRequirements) ||
    !Array.isArray(contract.policyRequirements) ||
    !isNonBlankStringArray(contract.policyRequirements) ||
    !Array.isArray(contract.lineageRules) ||
    !isNonBlankStringArray(contract.lineageRules)
  ) {
    return {
      error: 'invalid-input',
      message: 'rightsRequirements, policyRequirements and lineageRules must be arrays of non-blank references',
    };
  }
  return null;
};
