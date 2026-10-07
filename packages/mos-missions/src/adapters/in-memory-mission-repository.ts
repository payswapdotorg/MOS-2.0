import type { TenantScope } from '@mos/contracts';
import type { Mission, MissionId, MissionRewardSpec } from '../domain/mission.js';
import type {
  CreateMissionInput,
  MissionRepository,
  MissionRepositoryError,
  MissionRepositoryErrorCode,
} from '../ports/mission-repository.js';

/**
 * Options for {@link createInMemoryMissionRepository}.
 *
 * `now` is injectable so tests (and future golden fixtures) get deterministic
 * timestamps; it defaults to real wall-clock ISO-8601 strings. The default
 * uses only ECMAScript globals — no Node builtin imports in runtime code.
 */
export interface InMemoryMissionRepositoryOptions {
  readonly now?: () => string;
}

/** Valid forward transitions of the mission lifecycle. */
const LIFECYCLE: Record<string, string> = {
  activate: 'draft→active',
  complete: 'active→completed',
  archive: 'completed→archived',
};

/**
 * Build an in-memory {@link MissionRepository}.
 *
 * W1-A GROUNDWORK DISCLOSURE: this adapter is an ephemeral, process-local
 * scaffold used to pin the domain model and the port contract. It is NOT
 * production persistence: no database, no migrations, no durability. The
 * central schema/migration story is owned by the Tech Lead; a durable adapter
 * replaces this one in a later wave without touching the port.
 *
 * History is append-only: every mutation writes a NEW record version to the
 * mission's version chain; prior versions stay retrievable through
 * `getMission(id, version)` and are never mutated or deleted.
 */
export function createInMemoryMissionRepository(
  options: InMemoryMissionRepositoryOptions = {},
): MissionRepository {
  const now = options.now ?? (() => new Date().toISOString());

  /** Mission id → (record version → record). */
  const chains = new Map<MissionId, Map<number, Mission>>();

  const fail = (
    error: MissionRepositoryErrorCode,
    message: string,
  ): MissionRepositoryError => ({ error, message });

  const isBlank = (value: string): boolean => value.trim().length === 0;

  const latestIn = (chain: Map<number, Mission>): Mission | undefined => {
    let newest: Mission | undefined;
    for (const candidate of chain.values()) {
      if (newest === undefined || candidate.version > newest.version) {
        newest = candidate;
      }
    }
    return newest;
  };

  const validateRewardSpec = (spec: MissionRewardSpec): MissionRepositoryError | null => {
    if (!Number.isInteger(spec.version) || spec.version < 1) {
      return fail('invalid-input', `rewardSpec.version must be a positive integer: ${spec.version}`);
    }
    if (spec.terms.length === 0) {
      return fail('invalid-input', 'rewardSpec must declare at least one term');
    }
    for (const term of spec.terms) {
      if (!Number.isFinite(term.weight)) {
        return fail('invalid-input', 'rewardSpec term weights must be finite numbers');
      }
      if (isBlank(term.definition)) {
        return fail(
          'invalid-input',
          `rewardSpec term ${term.metric} must carry a precise definition`,
        );
      }
    }
    return null;
  };

  const validateObjective = (input: CreateMissionInput): MissionRepositoryError | null => {
    if (isBlank(input.objective.statement)) {
      return fail('invalid-input', 'mission objective statement must not be blank');
    }
    if (input.objective.targetMetrics.length === 0) {
      return fail('invalid-input', 'mission objective must declare at least one target metric');
    }
    for (const metric of input.objective.targetMetrics) {
      if (isBlank(metric.target) || isBlank(metric.unit)) {
        return fail(
          'invalid-input',
          `objective metric ${metric.metric} must carry a target and a unit`,
        );
      }
    }
    for (const constraint of input.objective.constraints) {
      if (isBlank(constraint.description)) {
        return fail('invalid-input', 'mission constraints must not be blank');
      }
    }
    const specError = validateRewardSpec(input.rewardSpec);
    if (specError !== null) {
      return specError;
    }
    if (input.rewardSpec.version !== 1) {
      return fail('invalid-input', 'a new mission starts at rewardSpec.version 1');
    }
    return null;
  };

  const freezeMission = (mission: Mission): Mission =>
    Object.freeze({
      ...mission,
      objective: Object.freeze({
        ...mission.objective,
        targetMetrics: Object.freeze(
          mission.objective.targetMetrics.map((metric) => Object.freeze({ ...metric })),
        ),
        constraints: Object.freeze(
          mission.objective.constraints.map((constraint) => Object.freeze({ ...constraint })),
        ),
      }),
      rewardSpec: Object.freeze({
        ...mission.rewardSpec,
        terms: Object.freeze(mission.rewardSpec.terms.map((term) => Object.freeze({ ...term }))),
      }),
      strategyRefs: Object.freeze([...mission.strategyRefs]),
    });

  const transition = (
    kind: 'activate' | 'complete' | 'archive',
    scope: TenantScope,
    id: MissionId,
  ): Mission | MissionRepositoryError => {
    const chain = chains.get(id);
    const current = chain === undefined ? undefined : latestIn(chain);
    if (current === undefined) {
      return fail('mission-not-found', `mission does not exist: ${id}`);
    }
    if (current.tenantId !== scope.tenantId) {
      return fail(
        'cross-tenant-reference',
        `mission ${id} does not belong to tenant ${scope.tenantId}`,
      );
    }
    const from: Record<string, string> = {
      activate: 'draft',
      complete: 'active',
      archive: 'completed',
    };
    const to: Record<string, string> = {
      activate: 'active',
      complete: 'completed',
      archive: 'archived',
    };
    if (current.status !== from[kind]) {
      return fail(
        'invalid-status-transition',
        `${LIFECYCLE[kind]} requires status '${from[kind]}', mission ${id} is '${current.status}'`,
      );
    }
    const next: Mission = freezeMission({
      ...current,
      version: current.version + 1,
      status: to[kind] as Mission['status'],
      updatedAt: now(),
    });
    chain?.set(next.version, next);
    return next;
  };

  return {
    createMission(input: CreateMissionInput): Mission | MissionRepositoryError {
      const invalid = validateObjective(input);
      if (invalid !== null) {
        return invalid;
      }
      if (chains.has(input.id)) {
        return fail('duplicate-mission', `mission already exists: ${input.id}`);
      }
      const timestamp = now();
      const mission: Mission = freezeMission({
        id: input.id,
        tenantId: input.scope.tenantId,
        version: 1,
        objective: input.objective,
        rewardSpec: input.rewardSpec,
        strategyRefs: input.strategyRefs ?? [],
        status: 'draft',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      const chain = new Map<number, Mission>();
      chain.set(1, mission);
      chains.set(mission.id, chain);
      return mission;
    },

    getMission(id: MissionId, version?: number): Mission | null {
      const chain = chains.get(id);
      if (chain === undefined || chain.size === 0) {
        return null;
      }
      const record = version === undefined ? latestIn(chain) : chain.get(version);
      return record ?? null;
    },

    activateMission(scope: TenantScope, id: MissionId): Mission | MissionRepositoryError {
      return transition('activate', scope, id);
    },

    completeMission(scope: TenantScope, id: MissionId): Mission | MissionRepositoryError {
      return transition('complete', scope, id);
    },

    archiveMission(scope: TenantScope, id: MissionId): Mission | MissionRepositoryError {
      return transition('archive', scope, id);
    },

    updateRewardSpec(
      scope: TenantScope,
      id: MissionId,
      rewardSpec: MissionRewardSpec,
    ): Mission | MissionRepositoryError {
      const specError = validateRewardSpec(rewardSpec);
      if (specError !== null) {
        return specError;
      }
      const chain = chains.get(id);
      const current = chain === undefined ? undefined : latestIn(chain);
      if (current === undefined) {
        return fail('mission-not-found', `mission does not exist: ${id}`);
      }
      if (current.tenantId !== scope.tenantId) {
        return fail(
          'cross-tenant-reference',
          `mission ${id} does not belong to tenant ${scope.tenantId}`,
        );
      }
      if (current.status !== 'draft') {
        return fail(
          'mission-not-editable',
          `rewardSpec updates are draft-only; mission ${id} is '${current.status}'`,
        );
      }
      if (rewardSpec.version !== current.rewardSpec.version + 1) {
        return fail(
          'invalid-input',
          `rewardSpec.version must advance exactly one step: expected ${
            current.rewardSpec.version + 1
          }, got ${rewardSpec.version}`,
        );
      }
      const next: Mission = freezeMission({
        ...current,
        version: current.version + 1,
        rewardSpec,
        updatedAt: now(),
      });
      chain?.set(next.version, next);
      return next;
    },

    listMissions(scope: TenantScope): readonly Mission[] {
      const latest: Mission[] = [];
      for (const chain of chains.values()) {
        const newest = latestIn(chain);
        if (newest !== undefined && newest.tenantId === scope.tenantId) {
          latest.push(newest);
        }
      }
      return latest.sort((a, b) => compareStrings(a.id, b.id));
    },
  };
}

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
