/**
 * PROD-002 — engine private-helper surface (split from engine.ts; pure code
 * motion: the class's #private methods as module functions over deps).
 */
import { err, failure, ok } from './errors.js';
import type { Failure, Result } from './errors.js';
import { DEFAULT_TENANT_ID_PATTERN, validateTenantId } from './ids.js';
import type { TenantId } from './ids.js';
import { isPlainRecord } from './util.js';
import type { ObservationExpectation } from './observation-set.js';
import type {
  AccessContext,
  AuthorityVersions,
  ExperimentEngineDeps,
  ExperimentRecord,
} from './engine-types.js';
import type { RightsAction, TrailEventKind } from './ports.js';

export function engineAccess(deps: ExperimentEngineDeps, access: unknown): Result<AccessContext, Failure> {
  if (!isPlainRecord(access)) {
    return err(failure('E_INVALID_TENANT_ID', 'access context must be a record { actor, tenantId }', { field: 'access' }));
  }
  const actor = access['actor'];
  if (typeof actor !== 'string' || actor.length === 0) {
    return err(failure('E_INVALID_TENANT_ID', 'access context requires a non-empty actor', { field: 'access.actor' }));
  }
  const tenantOk = validateTenantId(access['tenantId'], deps.tenantIdPattern ?? DEFAULT_TENANT_ID_PATTERN);
  if (!tenantOk.ok) {
    return tenantOk;
  }
  return ok({ actor, tenantId: tenantOk.value });
}

export function engineLoad(deps: ExperimentEngineDeps, access: AccessContext, experimentId: string, action: RightsAction): Result<ExperimentRecord, Failure> {
  if (typeof experimentId !== 'string' || experimentId.length === 0) {
    return err(failure('E_EXPERIMENT_NOT_FOUND', 'experimentId must be a non-empty string', { experimentId: null }));
  }
  const found = deps.store.get(experimentId);
  if (!found.ok) {
    return found;
  }
  const record = found.value;
  if (record === null) {
    return err(failure('E_EXPERIMENT_NOT_FOUND', `no experiment '${experimentId}'`, { experimentId }));
  }
  if (record.tenantId !== access.tenantId) {
    const gated = crossTenantGate(deps, access, action, `experiment:${experimentId}`, record.tenantId);
    if (!gated.ok) {
      return gated;
    }
  }
  return ok(record);
}

export function crossTenantGate(deps: ExperimentEngineDeps, access: AccessContext, action: RightsAction, resource: string, targetTenant: string): Result<true, Failure> {
  const decision = deps.rights.check({
    actor: access.actor,
    tenantId: access.tenantId,
    action,
    resource,
    targetTenantId: targetTenant as TenantId,
  });
  if (!decision.ok) {
    return decision;
  }
  if (!decision.value.allowed) {
    const denial = decision.value.denial;
    // Best-effort rejection trail; the denial itself is the primary truth.
    emitTrail(deps, 'rights:denied', access.tenantId, resource, {
      attribution: { authority: denial.authority, said: denial.verbatim },
      details: { actor: access.actor, action, authority: denial.authority, verbatim: denial.verbatim },
    });
    return err(failure('E_RIGHTS_DENIED', `the rights authority denied ${action} on ${resource}`, {
      authority: denial.authority,
      verbatim: denial.verbatim,
      actor: access.actor,
      action,
      resource,
    }));
  }
  return ok(true);
}

export function resolveVersions(deps: ExperimentEngineDeps): Result<AuthorityVersions, Failure> {
  const resolved = deps.authorityVersions.resolve();
  if (!resolved.ok) {
    return err(failure('E_AUTHORITY_VERSION_UNAVAILABLE', 'the authority version resolver failed — the §24 chain cannot cite versions that were not resolved', {
      resolverFailure: { code: resolved.error.code, message: resolved.error.message },
    }));
  }
  const versions = resolved.value;
  const missing: string[] = [];
  if (typeof versions.missionsModuleVersion !== 'string' || versions.missionsModuleVersion.length === 0) missing.push('missionsModuleVersion');
  if (typeof versions.productionModuleVersion !== 'string' || versions.productionModuleVersion.length === 0) missing.push('productionModuleVersion');
  if (typeof versions.distributionBindingId !== 'string' || versions.distributionBindingId.length === 0) missing.push('distributionBindingId');
  if (typeof versions.distributionBindingVersion !== 'string' || versions.distributionBindingVersion.length === 0) missing.push('distributionBindingVersion');
  if (missing.length > 0) {
    return err(failure('E_AUTHORITY_VERSION_UNAVAILABLE', `authority versions incomplete: ${missing.join(', ')}`, { missing }));
  }
  return ok(versions);
}

export function expectation(deps: ExperimentEngineDeps, record: ExperimentRecord): Result<ObservationExpectation, Failure> {
  if (record.chain === null) {
    return err(failure('E_WRONG_STATE', 'the experiment has no resolved chain (start must resolve it first)', { experimentId: record.experimentId, phase: record.phase }));
  }
  return ok({
    experimentId: record.experimentId,
    tenantId: record.tenantId,
    distributionBindingId: record.chain.citations.distributionRef.bindingId,
    distributionBindingVersion: record.chain.citations.distributionRef.bindingVersion,
    window: record.plan.collectionWindow,
  });
}

export function trailRejection(deps: ExperimentEngineDeps, record: ExperimentRecord, error: Failure): void {
  // Best-effort on the rejection path: the typed rejection is the primary truth.
  emitTrail(deps, 'observation:rejected', record.tenantId, `experiment:${record.experimentId}`, {
    details: { code: error.code, message: error.message },
  });
}

export function emitTrail(
deps: ExperimentEngineDeps,
kind: TrailEventKind,
tenantId: TenantId,
subject: string,
extra?: { attribution?: { authority: string; said: string }; details?: Readonly<Record<string, unknown>> },
): Result<true, Failure> {
  const event = {
    eventId: deps.ids.nextId('trail'),
    at: deps.clock.now(),
    tenantId,
    kind,
    subject,
    ...(extra?.attribution !== undefined ? { attribution: extra.attribution } : {}),
    ...(extra?.details !== undefined ? { details: extra.details } : {}),
  };
  const emitted = deps.trail.emit(event);
  if (!emitted.ok) {
    return emitted;
  }
  return ok(true);
}
