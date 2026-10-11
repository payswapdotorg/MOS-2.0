/**
 * PROD-002 — the engine ops bundle: deps + the helper functions the split
 * flows call (the class's #private surface, lifted to module level).
 */
import type {
  AccessContext,
  AuthorityVersions,
  ExperimentEngineDeps,
  ExperimentRecord,
} from './engine-types.js';
import {
  engineAccess,
  engineLoad,
  crossTenantGate,
  emitTrail,
  expectation,
  resolveVersions,
  trailRejection,
} from './engine-helpers.js';
import type { Failure, Result } from './errors.js';
import type { ObservationExpectation } from './observation-set.js';
import type { RightsAction, TrailEventKind } from './ports.js';
import type { TenantId } from './ids.js';

export interface EngineOps {
  readonly deps: ExperimentEngineDeps;
  access(access: unknown): Result<AccessContext, Failure>;
  load(access: AccessContext, experimentId: string, action: RightsAction): Result<ExperimentRecord, Failure>;
  crossTenantGate(access: AccessContext, action: RightsAction, resource: string, targetTenant: string): Result<true, Failure>;
  resolveVersions(): Result<AuthorityVersions, Failure>;
  expectation(record: ExperimentRecord): Result<ObservationExpectation, Failure>;
  trailRejection(record: ExperimentRecord, error: Failure): void;
  emitTrail(
    kind: TrailEventKind,
    tenantId: TenantId,
    subject: string,
    extra?: { attribution?: { authority: string; said: string }; details?: Readonly<Record<string, unknown>> },
  ): Result<true, Failure>;
}

export function makeEngineOps(deps: ExperimentEngineDeps): EngineOps {
  return {
    deps,
    access: (access) => engineAccess(deps, access),
    load: (access, experimentId, action) => engineLoad(deps, access, experimentId, action),
    crossTenantGate: (access, action, resource, targetTenant) => crossTenantGate(deps, access, action, resource, targetTenant),
    resolveVersions: () => resolveVersions(deps),
    expectation: (record) => expectation(deps, record),
    trailRejection: (record, error) => trailRejection(deps, record, error),
    emitTrail: (kind, tenantId, subject, extra) => emitTrail(deps, kind, tenantId, subject, extra),
  };
}
