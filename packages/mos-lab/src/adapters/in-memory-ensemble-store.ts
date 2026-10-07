import type { Timestamp, TenantScope, Version } from '@mos/contracts';
import type {
  AddEnsembleMemberInput,
  EnsembleError,
  EnsembleMember,
  EnsembleWeightingPolicy,
  RegisterEnsembleInput,
  WorldModelEnsemble,
  WorldModelEnsembleDraft,
  WorldModelEnsembleId,
} from '../contracts/ensemble.js';
import { deepFreeze } from './parametric-support.js';

/**
 * In-memory ensemble COMPOSITION half (LAB-007): registration, append-only
 * member addition, freeze, and version reads.
 *
 * W4-A DISCLOSURE: ephemeral process-local scaffold (durable persistence is
 * TL-owned). Ensemble versions are APPEND-ONLY immutable snapshots keyed per
 * (tenant, ensemble id): registration creates version 1, member addition
 * appends `version + 1` (prior versions stay retrievable), freezing appends
 * a `frozen` version that blocks further additions. Every stored record is
 * deep-frozen and there is no update or delete method — the only mutations
 * are appends. Structural member validation happens here; world-model
 * VERSION existence is enforced fail-closed at evaluation time by the
 * simulator engine (the store half does not resolve world models).
 */

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

const fail = (error: EnsembleError['error'], message: string): EnsembleError => ({
  error,
  message,
});

const isBlank = (value: string): boolean => value.trim().length === 0;

const validateCoverageRange = (
  range: { readonly min: number; readonly max: number },
  where: string,
  lowerBound: number,
  upperBound: number | null,
): string | null => {
  if (
    typeof range.min !== 'number' ||
    typeof range.max !== 'number' ||
    !Number.isFinite(range.min) ||
    !Number.isFinite(range.max)
  ) {
    return `${where}: coverage bounds must be finite numbers`;
  }
  if (range.min < lowerBound || range.max < lowerBound) {
    return `${where}: coverage bounds must be >= ${lowerBound}`;
  }
  if (upperBound !== null && (range.min > upperBound || range.max > upperBound)) {
    return `${where}: coverage bounds must be <= ${upperBound}`;
  }
  if (range.min > range.max) {
    return `${where}: coverage min must be <= max`;
  }
  return null;
};

/** Structural member validation (world-model existence is evaluation-time). */
export const validateEnsembleMember = (
  member: EnsembleMember,
  policy: EnsembleWeightingPolicy,
  existingIds: ReadonlySet<string>,
): string | null => {
  if (typeof member.id !== 'string' || isBlank(member.id)) {
    return 'member.id must be a non-empty string';
  }
  if (existingIds.has(member.id)) {
    return `duplicate member id: ${member.id}`;
  }
  if (
    !Number.isInteger(member.worldModelVersion) ||
    member.worldModelVersion < 1
  ) {
    return `member ${member.id}: worldModelVersion must be an integer >= 1`;
  }
  if (policy.kind === 'declared-member-weights') {
    if (
      typeof member.weight !== 'number' ||
      !Number.isFinite(member.weight) ||
      member.weight <= 0
    ) {
      return `member ${member.id}: policy kind declared-member-weights requires a finite weight > 0`;
    }
  } else if (member.weight !== undefined) {
    return `member ${member.id}: uniform policy members must not declare weights`;
  }
  if (member.coverage !== undefined) {
    const fault =
      validateCoverageRange(member.coverage.cadencePerWeek, `member ${member.id} coverage cadencePerWeek`, 0, null) ??
      validateCoverageRange(member.coverage.novelty, `member ${member.id} coverage novelty`, 0, 1) ??
      validateCoverageRange(member.coverage.engagementEffort, `member ${member.id} coverage engagementEffort`, 0, 1);
    if (fault !== null) {
      return fault;
    }
  }
  return null;
};

const validatePolicy = (policy: EnsembleWeightingPolicy): string | null => {
  if (typeof policy.id !== 'string' || isBlank(policy.id)) {
    return 'weightingPolicy.id must be a non-empty string';
  }
  if (!Number.isInteger(policy.version) || policy.version < 1) {
    return 'weightingPolicy.version must be an integer >= 1';
  }
  if (policy.kind !== 'uniform' && policy.kind !== 'declared-member-weights') {
    return 'weightingPolicy.kind must be uniform | declared-member-weights';
  }
  if (typeof policy.note !== 'string' || isBlank(policy.note)) {
    return 'weightingPolicy.note must be a non-empty rationale string';
  }
  return null;
};

/** Options for {@link createInMemoryEnsembleStore}. */
export interface InMemoryEnsembleStoreOptions {
  /** Injectable clock for deterministic `createdAt` stamps. */
  readonly now?: () => Timestamp;
}

/** The composition half of the {@link import('../contracts/ensemble.js').EnsemblePort EnsemblePort}. */
export type InMemoryEnsembleStore = Pick<
  import('../contracts/ensemble.js').EnsemblePort,
  | 'registerEnsemble'
  | 'addEnsembleMember'
  | 'freezeEnsemble'
  | 'getEnsemble'
  | 'resolveLatestEnsemble'
  | 'listEnsembleVersions'
>;

export function createInMemoryEnsembleStore(
  options: InMemoryEnsembleStoreOptions = {},
): InMemoryEnsembleStore {
  const now = options.now ?? nowDefault;
  /** Version chains keyed by (tenant, ensemble id) — tenants never share a chain. */
  const chains = new Map<string, WorldModelEnsemble[]>();
  const chainKey = (scope: TenantScope, id: WorldModelEnsembleId): string =>
    `${scope.tenantId}\u0000${id}`;

  const scoped = (
    scope: TenantScope,
    id: WorldModelEnsembleId,
  ): readonly WorldModelEnsemble[] => chains.get(chainKey(scope, id)) ?? [];

  const appendVersion = (
    scope: TenantScope,
    id: WorldModelEnsembleId,
    record: WorldModelEnsemble,
  ): WorldModelEnsemble => {
    const key = chainKey(scope, id);
    const chain = chains.get(key) ?? [];
    chain.push(record);
    chains.set(key, chain);
    return record;
  };

  const validateDraft = (
    draft: WorldModelEnsembleDraft,
  ): EnsembleError | null => {
    if (draft === null || typeof draft !== 'object') {
      return fail('invalid-input', 'ensemble draft must be an object');
    }
    if (typeof draft.id !== 'string' || isBlank(draft.id)) {
      return fail('invalid-input', 'ensemble id must be a non-empty string');
    }
    if (isBlank(draft.niche) || isBlank(draft.platform)) {
      return fail('invalid-input', 'ensemble niche and platform must be non-empty strings');
    }
    const policyFault = validatePolicy(draft.weightingPolicy);
    if (policyFault !== null) {
      return fail('invalid-input', policyFault);
    }
    if (!Array.isArray(draft.members) || draft.members.length < 2) {
      return fail(
        'invalid-input',
        'an ensemble requires at least two members — empty and single-member ensembles are structurally rejected (no model disagreement is computable)',
      );
    }
    const seen = new Set<string>();
    for (const member of draft.members) {
      const fault = validateEnsembleMember(member, draft.weightingPolicy, seen);
      if (fault !== null) {
        return fail('invalid-input', fault);
      }
      seen.add(member.id);
    }
    return null;
  };

  return {
    async registerEnsemble(
      input: RegisterEnsembleInput,
    ): Promise<WorldModelEnsemble | EnsembleError> {
      const invalid = validateDraft(input.ensemble);
      if (invalid !== null) {
        return invalid;
      }
      const draft = input.ensemble;
      const record: WorldModelEnsemble = deepFreeze({
        id: draft.id,
        version: 1 as Version,
        tenantId: input.scope.tenantId,
        niche: draft.niche,
        platform: draft.platform,
        members: draft.members,
        weightingPolicy: draft.weightingPolicy,
        status: 'active',
        createdAt: now(),
        notes: draft.notes ?? null,
        disclosure: 'synthetic-ensemble-of-disclosed-response-functions',
      });
      return appendVersion(input.scope, draft.id, record);
    },

    async addEnsembleMember(
      input: AddEnsembleMemberInput,
    ): Promise<WorldModelEnsemble | EnsembleError> {
      const latest = scoped(input.scope, input.ensembleId);
      if (latest.length === 0) {
        return fail(
          'unknown-ensemble',
          `no ensemble ${input.ensembleId} visible in this tenant scope`,
        );
      }
      const parent = latest[latest.length - 1] as WorldModelEnsemble;
      if (parent.status === 'frozen') {
        return fail(
          'ensemble-frozen',
          `ensemble ${input.ensembleId} latest version ${parent.version} is frozen — member additions require an active latest version`,
        );
      }
      const existingIds = new Set(parent.members.map((member) => member.id));
      if (existingIds.has(input.member.id)) {
        return fail(
          'duplicate-member',
          `member id ${input.member.id} already exists in ensemble ${input.ensembleId} v${parent.version}`,
        );
      }
      const fault = validateEnsembleMember(
        input.member,
        parent.weightingPolicy,
        existingIds,
      );
      if (fault !== null) {
        return fail('invalid-input', fault);
      }
      const record: WorldModelEnsemble = deepFreeze({
        id: parent.id,
        version: (parent.version + 1) as Version,
        tenantId: input.scope.tenantId,
        niche: parent.niche,
        platform: parent.platform,
        members: [...parent.members, input.member],
        weightingPolicy: parent.weightingPolicy,
        status: 'active',
        createdAt: now(),
        notes: parent.notes,
        disclosure: 'synthetic-ensemble-of-disclosed-response-functions',
      });
      return appendVersion(input.scope, input.ensembleId, record);
    },

    async freezeEnsemble(
      scope: TenantScope,
      ensembleId: WorldModelEnsembleId,
    ): Promise<WorldModelEnsemble | EnsembleError> {
      const latest = scoped(scope, ensembleId);
      if (latest.length === 0) {
        return fail(
          'unknown-ensemble',
          `no ensemble ${ensembleId} visible in this tenant scope`,
        );
      }
      const parent = latest[latest.length - 1] as WorldModelEnsemble;
      if (parent.status === 'frozen') {
        return fail(
          'invalid-input',
          `ensemble ${ensembleId} latest version ${parent.version} is already frozen`,
        );
      }
      const record: WorldModelEnsemble = deepFreeze({
        id: parent.id,
        version: (parent.version + 1) as Version,
        tenantId: scope.tenantId,
        niche: parent.niche,
        platform: parent.platform,
        members: parent.members,
        weightingPolicy: parent.weightingPolicy,
        status: 'frozen',
        createdAt: now(),
        notes: parent.notes,
        disclosure: 'synthetic-ensemble-of-disclosed-response-functions',
      });
      return appendVersion(scope, ensembleId, record);
    },

    async getEnsemble(
      scope: TenantScope,
      id: WorldModelEnsembleId,
      version: number,
    ): Promise<WorldModelEnsemble | null> {
      return scoped(scope, id).find((record) => record.version === version) ?? null;
    },

    async resolveLatestEnsemble(
      scope: TenantScope,
      id: WorldModelEnsembleId,
    ): Promise<WorldModelEnsemble | null> {
      const visible = scoped(scope, id);
      return visible.length === 0 ? null : (visible[visible.length - 1] ?? null);
    },

    async listEnsembleVersions(
      scope: TenantScope,
      id: WorldModelEnsembleId,
    ): Promise<readonly WorldModelEnsemble[]> {
      return [...scoped(scope, id)];
    },
  };
}
