/**
 * PROD-002 — engine lifecycle flows (split from engine.ts; pure code motion):
 * propose / start / beginCollection / abort / get / list as functions over
 * the engine ops object.
 */
import { err, failure, ok } from './errors.js';
import type { Failure, Result } from './errors.js';
import { DEFAULT_TENANT_ID_PATTERN, validateTenantId } from './ids.js';
import type { TenantId } from './ids.js';
import { validateExperimentPlan } from './plan-validation.js';
import type { AccessContextInput, ExperimentRecord, ResolvedChain } from './engine-types.js';
import { JOB_KIND } from './engine-types.js';
import type { EngineOps } from './engine-ops.js';

export function runPropose(ops: EngineOps, access: AccessContextInput, plan: unknown): Result<ExperimentRecord, Failure> {
  const accessOk = ops.access(access);
  if (!accessOk.ok) {
    return accessOk;
  }
  const planOk = validateExperimentPlan(plan);
  if (!planOk.ok) {
    return planOk;
  }
  const at = ops.deps.clock.now();
  const experimentId = ops.deps.ids.nextId('exp');
  const record: ExperimentRecord = {
    experimentId,
    tenantId: accessOk.value.tenantId,
    phase: 'proposed',
    plan: planOk.value,
    chain: null,
    jobId: null,
    observations: [],
    observationSet: null,
    evidence: null,
    learning: null,
    abortReason: null,
    createdAt: at,
    updatedAt: at,
  };
  const trailOk = ops.emitTrail('experiment:proposed', record.tenantId, `experiment:${experimentId}`, {
    details: {
      hypothesis: planOk.value.hypothesis,
      missionId: planOk.value.missionRef.missionId,
      requestId: planOk.value.productionRequestRef.requestId,
      bindingId: planOk.value.distributionRef.bindingId,
      metrics: planOk.value.metrics.map((metric) => metric.metricKey).join(','),
    },
  });
  if (!trailOk.ok) {
    return trailOk;
  }
  const putOk = ops.deps.store.put(record);
  if (!putOk.ok) {
    return putOk;
  }
  return ok(record);
}

export function runStart(ops: EngineOps, access: AccessContextInput, experimentId: string): Result<ExperimentRecord, Failure> {
  const accessOk = ops.access(access);
  if (!accessOk.ok) {
    return accessOk;
  }
  const loadOk = ops.load(accessOk.value, experimentId, 'start');
  if (!loadOk.ok) {
    return loadOk;
  }
  const record = loadOk.value;
  if (record.phase !== 'proposed') {
    return err(failure('E_INVALID_TRANSITION', `start requires phase 'proposed' (current: '${record.phase}')`, { experimentId, from: record.phase, to: 'running' }));
  }
  const versionsOk = ops.resolveVersions();
  if (!versionsOk.ok) {
    return versionsOk;
  }
  const versions = versionsOk.value;
  if (record.plan.distributionRef.bindingId !== versions.distributionBindingId) {
    return err(failure(
      'E_CITATION_UNRESOLVED',
      `the plan cites binding '${record.plan.distributionRef.bindingId}' but the live authority resolves '${versions.distributionBindingId}' — unresolvable refs are typed failures, never fabricated`,
      { experimentId, citedBindingId: record.plan.distributionRef.bindingId, liveBindingId: versions.distributionBindingId },
    ));
  }
  const at = ops.deps.clock.now();
  const chain: ResolvedChain = {
    resolvedAt: at,
    missionsModuleVersion: versions.missionsModuleVersion,
    productionModuleVersion: versions.productionModuleVersion,
    distributionBindingVersion: versions.distributionBindingVersion,
    citations: {
      missionRef: { missionId: record.plan.missionRef.missionId, moduleVersion: versions.missionsModuleVersion },
      productionRequestRef: { requestId: record.plan.productionRequestRef.requestId, moduleVersion: versions.productionModuleVersion },
      distributionRef: { bindingId: versions.distributionBindingId, bindingVersion: versions.distributionBindingVersion },
    },
  };
  const enqueueOk = ops.deps.jobs.enqueue({ kind: JOB_KIND, payload: { experimentId, tenantId: record.tenantId } });
  if (!enqueueOk.ok) {
    return enqueueOk;
  }
  const jobId = enqueueOk.value.jobId;
  const jobTrailOk = ops.emitTrail('job:enqueued', record.tenantId, `experiment:${experimentId}`, {
    attribution: { authority: '@mos/jobs', said: `job-enqueued:${jobId}` },
    details: { kind: JOB_KIND, jobId },
  });
  if (!jobTrailOk.ok) {
    return jobTrailOk;
  }
  const startedTrailOk = ops.emitTrail('experiment:started', record.tenantId, `experiment:${experimentId}`, {
    details: {
      bindingId: versions.distributionBindingId,
      bindingVersion: versions.distributionBindingVersion,
      missionsModuleVersion: versions.missionsModuleVersion,
      productionModuleVersion: versions.productionModuleVersion,
    },
  });
  if (!startedTrailOk.ok) {
    return startedTrailOk;
  }
  const next: ExperimentRecord = { ...record, phase: 'running', chain, jobId, updatedAt: at };
  const putOk = ops.deps.store.put(next);
  if (!putOk.ok) {
    return putOk;
  }
  return ok(next);
}

export function runBeginCollection(ops: EngineOps, access: AccessContextInput, experimentId: string): Result<ExperimentRecord, Failure> {
  const accessOk = ops.access(access);
  if (!accessOk.ok) {
    return accessOk;
  }
  const loadOk = ops.load(accessOk.value, experimentId, 'collect');
  if (!loadOk.ok) {
    return loadOk;
  }
  const record = loadOk.value;
  if (record.phase !== 'running') {
    return err(failure('E_INVALID_TRANSITION', `beginCollection requires phase 'running' (current: '${record.phase}')`, { experimentId, from: record.phase, to: 'collecting' }));
  }
  const at = ops.deps.clock.now();
  const trailOk = ops.emitTrail('collection:opened', record.tenantId, `experiment:${experimentId}`, {
    details: {
      startsAt: record.plan.collectionWindow.startsAt,
      endsAt: record.plan.collectionWindow.endsAt,
      maxObservations: record.plan.collectionWindow.maxObservations,
    },
  });
  if (!trailOk.ok) {
    return trailOk;
  }
  const next: ExperimentRecord = { ...record, phase: 'collecting', updatedAt: at };
  const putOk = ops.deps.store.put(next);
  if (!putOk.ok) {
    return putOk;
  }
  return ok(next);
}

export function runAbort(ops: EngineOps, access: AccessContextInput, experimentId: string, reason: string): Result<ExperimentRecord, Failure> {
  const accessOk = ops.access(access);
  if (!accessOk.ok) {
    return accessOk;
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    return err(failure('E_ABORT_REASON_REQUIRED', 'abort requires a non-empty reason', { experimentId: typeof experimentId === 'string' ? experimentId : null }));
  }
  const loadOk = ops.load(accessOk.value, experimentId, 'abort');
  if (!loadOk.ok) {
    return loadOk;
  }
  const record = loadOk.value;
  if (record.phase === 'learned' || record.phase === 'aborted') {
    return err(failure('E_INVALID_TRANSITION', `cannot abort from '${record.phase}'`, { experimentId, from: record.phase, to: 'aborted' }));
  }
  const at = ops.deps.clock.now();
  if (record.jobId !== null) {
    const failOk = ops.deps.jobs.fail(record.jobId, reason);
    if (!failOk.ok) {
      return failOk;
    }
    const jobTrailOk = ops.emitTrail('job:failed', record.tenantId, `experiment:${experimentId}`, {
      attribution: { authority: '@mos/jobs', said: `job-failed:${record.jobId}` },
      details: { jobId: record.jobId, reason },
    });
    if (!jobTrailOk.ok) {
      return jobTrailOk;
    }
  }
  const trailOk = ops.emitTrail('experiment:aborted', record.tenantId, `experiment:${experimentId}`, { details: { reason, from: record.phase } });
  if (!trailOk.ok) {
    return trailOk;
  }
  const next: ExperimentRecord = { ...record, phase: 'aborted', abortReason: reason, updatedAt: at };
  const putOk = ops.deps.store.put(next);
  if (!putOk.ok) {
    return putOk;
  }
  return ok(next);
}

export function runGet(ops: EngineOps, access: AccessContextInput, experimentId: string): Result<ExperimentRecord, Failure> {
  const accessOk = ops.access(access);
  if (!accessOk.ok) {
    return accessOk;
  }
  return ops.load(accessOk.value, experimentId, 'read');
}

export function runList(ops: EngineOps, access: AccessContextInput, tenantId?: string): Result<readonly ExperimentRecord[], Failure> {
  const accessOk = ops.access(access);
  if (!accessOk.ok) {
    return accessOk;
  }
  let target: string = accessOk.value.tenantId;
  if (tenantId !== undefined) {
    const validate = validateTenantId(tenantId, ops.deps.tenantIdPattern ?? DEFAULT_TENANT_ID_PATTERN);
    if (!validate.ok) {
      return validate;
    }
    target = validate.value;
  }
  if (target !== accessOk.value.tenantId) {
    const gated = ops.crossTenantGate(accessOk.value, 'list', `experiments:${target}`, target);
    if (!gated.ok) {
      return gated;
    }
  }
  return ops.deps.store.list(target as TenantId);
}
