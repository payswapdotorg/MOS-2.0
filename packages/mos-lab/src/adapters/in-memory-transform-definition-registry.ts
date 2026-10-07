import type {
  CostBasis,
  TenantScope,
  Timestamp,
  TransformId,
  Version,
} from '@mos/contracts';
import type {
  TransformDefinition,
  TransformDefinitionError,
  TransformDefinitionInput,
  TransformDefinitionRegistry,
  TransformInputConstraint,
  TransformKind,
  TransformOutputContract,
} from '../contracts/transform-definition.js';
import type { ReferenceModality } from '../contracts/corpus.js';
import {
  cloneDeep,
  deepFreeze,
  isBlankString,
  isFiniteNonNegative,
  isPlainObject,
  isPositiveInteger,
} from './parametric-support.js';

/**
 * Options for {@link createInMemoryTransformDefinitionRegistry}. `now` is
 * injectable for deterministic timestamps.
 */
export interface InMemoryTransformDefinitionRegistryOptions {
  readonly now?: () => Timestamp;
}

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

/** The frozen thirteen kinds (architecture §5) — the complete vocabulary. */
const TRANSFORM_KINDS: readonly TransformKind[] = [
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

/** Sorted, de-duplicated copy (the derived canonical `inputTypes`/`outputTypes` form). */
const sortedUnique = (values: readonly string[]): readonly string[] => [
  ...new Set(values),
].sort();

/**
 * Build an in-memory {@link TransformDefinitionRegistry}.
 *
 * W5-A GROUNDWORK DISCLOSURE: ephemeral, process-local scaffold (no durable
 * persistence — TL-owned). Definitions are versioned append-only: revision
 * appends version + 1 and every prior version stays resolvable through
 * `getTransformDefinition(scope, id, version)`; records are deep-frozen;
 * nothing is ever hard-deleted. Records are keyed per (tenant, id) so
 * tenants never share id namespaces and unknown/cross-tenant are
 * indistinguishable.
 *
 * NO SPECIAL-CASING OF NO-OP: the registry validates every definition
 * identically regardless of kind — zero capability requirements is a valid
 * declared state for ANY kind (lock rule 5; the no-op/repost seed definition
 * simply declares none). The only kind-conditional rule is the explicit
 * human-participation requirement for `human-contribution` / `hybrid`.
 */
export function createInMemoryTransformDefinitionRegistry(
  options: InMemoryTransformDefinitionRegistryOptions = {},
): TransformDefinitionRegistry {
  const now = options.now ?? nowDefault;

  /** Definition version chains keyed per (tenant, id): composite key → versions, oldest first. */
  const chains = new Map<string, TransformDefinition[]>();

  const key = (tenantId: string, id: TransformId): string => `${tenantId}\u0000${id}`;

  const fail = (error: TransformDefinitionError['error'], message: string): TransformDefinitionError => ({
    error,
    message,
  });

  const validateInputConstraint = (
    constraint: TransformInputConstraint,
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
    outputContract: TransformOutputContract,
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
   * FULL structural validation of a definition declaration. Returns a typed
   * failure or `null` when well-formed.
   */
  const validateDeclaration = (
    input: TransformDefinitionInput,
  ): TransformDefinitionError | null => {
    if (!isPlainObject(input) || typeof input.id !== 'string' || isBlankString(input.id)) {
      return fail('invalid-input', 'transform definition id must be a non-blank string');
    }
    if (!TRANSFORM_KINDS.includes(input.kind)) {
      return fail(
        'unknown-transform-kind',
        `transform kind must be one of the frozen §5 thirteen kinds (got: ${String(input.kind)})`,
      );
    }
    if (typeof input.humanParticipation !== 'boolean') {
      return fail('invalid-input', 'humanParticipation must be a boolean');
    }
    if (
      (input.kind === 'human-contribution' || input.kind === 'hybrid') &&
      input.humanParticipation !== true
    ) {
      return fail(
        'human-participation-required',
        `transform kind ${input.kind} must declare humanParticipation: true — human participation is part of the contract`,
      );
    }
    const constraintProblem = validateInputConstraint(input.inputConstraint);
    if (constraintProblem !== null) {
      return fail('invalid-input', constraintProblem);
    }
    const outputProblem = validateOutputContract(input.outputContract);
    if (outputProblem !== null) {
      return fail('invalid-input', outputProblem);
    }
    if (!isPlainObject(input.parameters)) {
      return fail('invalid-input', 'parameters must be a JSON object (the declared parameter space)');
    }
    if (!Array.isArray(input.capabilityRequirements)) {
      return fail('invalid-input', 'capabilityRequirements must be an array (possibly empty — the declared no-op state)');
    }
    for (const requirement of input.capabilityRequirements) {
      if (
        !isPlainObject(requirement) ||
        typeof requirement.capabilityId !== 'string' ||
        isBlankString(requirement.capabilityId) ||
        !isPositiveInteger(requirement.version)
      ) {
        return fail(
          'invalid-input',
          `every capability requirement must be a { capabilityId, version } pair with a non-blank id and integer version ≥ 1 (got: ${JSON.stringify(requirement)})`,
        );
      }
    }
    if (typeof input.evaluator !== 'string' || isBlankString(input.evaluator)) {
      return fail('invalid-input', 'evaluator must be a non-blank evaluator reference');
    }
    const cost = input.costModel;
    if (
      !isPlainObject(cost) ||
      !COST_BASES.includes(cost.basis as CostBasis) ||
      !isFiniteNonNegative(cost.amount) ||
      typeof cost.currency !== 'string' ||
      isBlankString(cost.currency)
    ) {
      return fail('invalid-input', 'costModel must be { basis, amount ≥ 0, currency } with a frozen CostBasis');
    }
    const latency = input.latencyModel;
    if (
      !isPlainObject(latency) ||
      !isFiniteNonNegative(latency.p50Ms) ||
      !isFiniteNonNegative(latency.p95Ms) ||
      !isFiniteNonNegative(latency.p99Ms)
    ) {
      return fail('invalid-input', 'latencyModel must be { p50Ms, p95Ms, p99Ms } with finite non-negative values');
    }
    if (
      !Array.isArray(input.rightsRequirements) ||
      !isNonBlankStringArray(input.rightsRequirements) ||
      !Array.isArray(input.policyRequirements) ||
      !isNonBlankStringArray(input.policyRequirements) ||
      !Array.isArray(input.lineageRules) ||
      !isNonBlankStringArray(input.lineageRules)
    ) {
      return fail('invalid-input', 'rightsRequirements, policyRequirements and lineageRules must be arrays of non-blank references');
    }
    return null;
  };

  const buildRecord = (
    input: TransformDefinitionInput,
    version: Version,
  ): TransformDefinition => {
    // CLONE-THEN-FREEZE ownership: every caller-supplied nested record is
    // cloned first, so the stored immutable version never freezes or retains
    // data the caller still owns.
    const record: TransformDefinition = {
      id: input.id,
      kind: input.kind,
      inputConstraint: deepFreeze(cloneDeep(input.inputConstraint)),
      outputContract: deepFreeze(cloneDeep(input.outputContract)),
      parameters: deepFreeze(cloneDeep(input.parameters)),
      capabilityRequirements: deepFreeze(cloneDeep(input.capabilityRequirements)),
      humanParticipation: input.humanParticipation,
      evaluator: input.evaluator,
      costModel: deepFreeze(cloneDeep(input.costModel)),
      latencyModel: deepFreeze(cloneDeep(input.latencyModel)),
      rightsRequirements: deepFreeze(cloneDeep(input.rightsRequirements)),
      policyRequirements: deepFreeze(cloneDeep(input.policyRequirements)),
      lineageRules: deepFreeze(cloneDeep(input.lineageRules)),
      version,
      tenantId: input.scope.tenantId,
      // Derived so the canonical CORE-001 `Transform` contract is satisfied
      // BY CONSTRUCTION (sorted, de-duplicated).
      inputTypes: sortedUnique(input.inputConstraint.acceptedTypes),
      outputTypes: sortedUnique(input.outputContract.outputTypes),
      createdAt: now(),
    };
    return Object.freeze(record);
  };

  const latestOf = (tenantId: string, id: TransformId): TransformDefinition | undefined => {
    const chain = chains.get(key(tenantId, id));
    return chain === undefined || chain.length === 0 ? undefined : chain[chain.length - 1];
  };

  return {
    async registerTransformDefinition(
      input: TransformDefinitionInput,
    ): Promise<TransformDefinition | TransformDefinitionError> {
      const declarationProblem = validateDeclaration(input);
      if (declarationProblem !== null) {
        return declarationProblem;
      }
      const existing = latestOf(input.scope.tenantId, input.id);
      if (existing !== undefined) {
        return fail(
          'duplicate-definition',
          `transform definition already exists in this tenant scope: ${input.id} (latest version ${existing.version})`,
        );
      }
      const record = buildRecord(input, 1 as Version);
      chains.set(key(input.scope.tenantId, input.id), [record]);
      return record;
    },

    async reviseTransformDefinition(
      input: TransformDefinitionInput,
    ): Promise<TransformDefinition | TransformDefinitionError> {
      const declarationProblem = validateDeclaration(input);
      if (declarationProblem !== null) {
        return declarationProblem;
      }
      const current = latestOf(input.scope.tenantId, input.id);
      if (current === undefined) {
        return fail(
          'definition-not-found',
          `transform definition does not exist in this tenant scope: ${input.id}`,
        );
      }
      // Append-only revision: the prior version stays resolvable.
      const revised = buildRecord(input, (current.version + 1) as Version);
      chains.get(key(input.scope.tenantId, input.id))?.push(revised);
      return revised;
    },

    async getTransformDefinition(
      scope: TenantScope,
      id: TransformId,
      version?: number,
    ): Promise<TransformDefinition | null> {
      const chain = chains.get(key(scope.tenantId, id));
      if (chain === undefined) {
        return null;
      }
      const record =
        version === undefined ? chain[chain.length - 1] : chain.find((entry) => entry.version === version);
      return record === undefined ? null : record;
    },

    async listTransformDefinitions(scope: TenantScope): Promise<readonly TransformDefinition[]> {
      const latest: TransformDefinition[] = [];
      for (const [compositeKey, chain] of chains) {
        if (compositeKey.startsWith(`${scope.tenantId}\u0000`)) {
          const record = chain[chain.length - 1];
          if (record !== undefined) {
            latest.push(record);
          }
        }
      }
      return latest;
    },
  };
}
