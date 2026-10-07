import type {
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
} from '../contracts/transform-definition.js';
import { cloneDeep, deepFreeze, isBlankString, isPlainObject } from './parametric-support.js';
import { validateTransformContractDeclaration } from './transform-contract-validation.js';

/**
 * Options for {@link createInMemoryTransformDefinitionRegistry}. `now` is
 * injectable for deterministic timestamps.
 */
export interface InMemoryTransformDefinitionRegistryOptions {
  readonly now?: () => Timestamp;
}

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

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

  /**
   * FULL structural validation of a definition declaration — the SHARED
   * transform-contract rules (adapters/transform-contract-validation.ts, also
   * used by LAB-012 discovery so candidates and definitions validate
   * identically) plus the registry-local id check. Returns a typed failure
   * or `null` when well-formed.
   */
  const validateDeclaration = (
    input: TransformDefinitionInput,
  ): TransformDefinitionError | null => {
    if (!isPlainObject(input) || typeof input.id !== 'string' || isBlankString(input.id)) {
      return fail('invalid-input', 'transform definition id must be a non-blank string');
    }
    return validateTransformContractDeclaration(input);
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
