/**
 * PROD-002 — engine collection/measure/learn flows (split from engine.ts;
 * pure code motion): ingestObservation / markMeasured / publishLearning.
 */
import { err, failure, ok } from './errors.js';
import type { Failure, Result } from './errors.js';
import { buildObservationSet, checkStampedObservation, classifyObservationInput, toPlatformSaidObservation } from './observation-set.js';
import type { PlatformSaidObservation } from './observation-set.js';
import { computeEvidence } from './evidence.js';
import { buildLearningRecord } from './learning.js';
import type { AccessContextInput, ExperimentRecord } from './engine-types.js';
import type { EngineOps } from './engine-ops.js';

export function runIngestObservation(ops: EngineOps, access: AccessContextInput, experimentId: string, raw: unknown): Result<PlatformSaidObservation, Failure> {
  const accessOk = ops.access(access);
  if (!accessOk.ok) {
    return accessOk;
  }
  const loadOk = ops.load(accessOk.value, experimentId, 'ingest');
  if (!loadOk.ok) {
    return loadOk;
  }
  const record = loadOk.value;
  if (record.phase !== 'collecting') {
    return err(failure('E_WRONG_STATE', `ingest requires phase 'collecting' (current: '${record.phase}')`, { experimentId, phase: record.phase }));
  }
  const classified = classifyObservationInput(raw);
  if (!classified.ok) {
    ops.trailRejection(record, classified.error);
    return classified;
  }
  const stamped = toPlatformSaidObservation(classified.value, record.tenantId);
  if (!stamped.ok) {
    ops.trailRejection(record, stamped.error);
    return stamped;
  }
  const observation = stamped.value;
  const expectation = ops.expectation(record);
  if (!expectation.ok) {
    return expectation;
  }
  const check = checkStampedObservation(observation, expectation.value);
  if (!check.ok) {
    ops.trailRejection(record, check.error);
    return check;
  }
  if (record.observations.some((existing) => existing.observationId === observation.observationId)) {
    const duplicate = failure('E_DUPLICATE_OBSERVATION', `observation '${observation.observationId}' was already ingested`, { observationId: observation.observationId });
    ops.trailRejection(record, duplicate);
    return err(duplicate);
  }
  const cap = record.plan.collectionWindow.maxObservations;
  if (cap !== null && record.observations.length >= cap) {
    const limited = failure('E_OBSERVATION_LIMIT_EXCEEDED', `the collection window caps at ${cap} observations`, { cap, current: record.observations.length });
    ops.trailRejection(record, limited);
    return err(limited);
  }
  const at = ops.deps.clock.now();
  const trailOk = ops.emitTrail('observation:ingested', record.tenantId, `experiment:${experimentId}`, {
    attribution: { authority: '@mos/distribution', said: `${observation.attribution.saidBy}:${observation.attribution.channel}` },
    details: {
      observationId: observation.observationId,
      family: observation.payload.family,
      bindingId: observation.attribution.distributionBindingId,
      bindingVersion: observation.attribution.distributionBindingVersion,
      saidAt: observation.saidAt,
    },
  });
  if (!trailOk.ok) {
    return trailOk;
  }
  const next: ExperimentRecord = { ...record, observations: [...record.observations, observation], updatedAt: at };
  const putOk = ops.deps.store.put(next);
  if (!putOk.ok) {
    return putOk;
  }
  return ok(observation);
}

export function runMarkMeasured(ops: EngineOps, access: AccessContextInput, experimentId: string): Result<ExperimentRecord, Failure> {
  const accessOk = ops.access(access);
  if (!accessOk.ok) {
    return accessOk;
  }
  const loadOk = ops.load(accessOk.value, experimentId, 'measure');
  if (!loadOk.ok) {
    return loadOk;
  }
  const record = loadOk.value;
  if (record.phase !== 'collecting') {
    return err(failure('E_INVALID_TRANSITION', `markMeasured requires phase 'collecting' (current: '${record.phase}')`, { experimentId, from: record.phase, to: 'measured' }));
  }
  const at = ops.deps.clock.now();
  if (Date.parse(at) < Date.parse(record.plan.collectionWindow.endsAt)) {
    return err(failure('E_COLLECTION_WINDOW_OPEN', `the collection window is still open (now ${at}, ends ${record.plan.collectionWindow.endsAt}) — §26 long-running windows are not cut short`, { now: at, endsAt: record.plan.collectionWindow.endsAt }));
  }
  const expectation = ops.expectation(record);
  if (!expectation.ok) {
    return expectation;
  }
  const sealed = buildObservationSet(expectation.value, record.observations, ops.deps.ids);
  if (!sealed.ok) {
    return sealed;
  }
  const evidence = computeEvidence({
    observationSet: sealed.value,
    specs: record.plan.metrics,
    evidenceId: ops.deps.ids.nextId('evidence'),
    computedAt: at,
  });
  if (!evidence.ok) {
    return evidence;
  }
  const trailOk = ops.emitTrail('evidence:measured', record.tenantId, `experiment:${experimentId}`, {
    details: {
      observationSetDigest: sealed.value.digest,
      evidenceId: evidence.value.evidenceId,
      outcomes: evidence.value.outcomes.map((outcome) => outcome.metricKey).join(','),
      totalObservations: sealed.value.observations.length,
    },
  });
  if (!trailOk.ok) {
    return trailOk;
  }
  const next: ExperimentRecord = { ...record, phase: 'measured', observationSet: sealed.value, evidence: evidence.value, updatedAt: at };
  const putOk = ops.deps.store.put(next);
  if (!putOk.ok) {
    return putOk;
  }
  return ok(next);
}

export function runPublishLearning(ops: EngineOps, access: AccessContextInput, experimentId: string): Result<ExperimentRecord, Failure> {
  const accessOk = ops.access(access);
  if (!accessOk.ok) {
    return accessOk;
  }
  const loadOk = ops.load(accessOk.value, experimentId, 'learn');
  if (!loadOk.ok) {
    return loadOk;
  }
  const record = loadOk.value;
  if (record.phase !== 'measured') {
    return err(failure('E_INVALID_TRANSITION', `publishLearning requires phase 'measured' (current: '${record.phase}')`, { experimentId, from: record.phase, to: 'learned' }));
  }
  if (record.plan.prediction === null) {
    return err(failure('E_LEARNING_MISSING_PREDICTION', 'the plan carries no cited Lab prediction — the learning loop needs the prediction to compute prediction errors', { experimentId }));
  }
  if (record.evidence === null || record.observationSet === null || record.chain === null) {
    return err(failure('E_WRONG_STATE', 'measured phase without sealed evidence/observation set/chain (invariant breach)', { experimentId }));
  }
  const publishedAt = ops.deps.clock.now();
  const built = buildLearningRecord({
    experimentId,
    tenantId: record.tenantId,
    citedPrediction: record.plan.prediction,
    evidence: record.evidence,
    chain: record.chain,
    publishedAt,
    ids: ops.deps.ids,
  });
  if (!built.ok) {
    return built;
  }
  const publishOk = ops.deps.learningSink.publish(built.value);
  if (!publishOk.ok) {
    return publishOk;
  }
  const jobId = record.jobId;
  if (jobId === null) {
    return err(failure('E_JOB_COMPLETE_FAILED', 'measured experiment has no durable job to complete (invariant breach)', { experimentId }));
  }
  const completeOk = ops.deps.jobs.complete(jobId, { status: 'completed', learningRecordId: built.value.learningRecordId });
  if (!completeOk.ok) {
    return completeOk;
  }
  const learnTrailOk = ops.emitTrail('learning:published', record.tenantId, `experiment:${experimentId}`, {
    attribution: { authority: '@mos/experiments', said: `learning-published:${built.value.learningRecordId}` },
    details: { learningRecordId: built.value.learningRecordId, predictionErrors: built.value.predictionErrors.length, evidenceDigest: built.value.evidenceDigest },
  });
  if (!learnTrailOk.ok) {
    return learnTrailOk;
  }
  const jobTrailOk = ops.emitTrail('job:completed', record.tenantId, `experiment:${experimentId}`, {
    attribution: { authority: '@mos/jobs', said: `job-completed:${jobId}` },
    details: { jobId },
  });
  if (!jobTrailOk.ok) {
    return jobTrailOk;
  }
  const next: ExperimentRecord = { ...record, phase: 'learned', learning: { learningRecordId: built.value.learningRecordId, publishedAt }, updatedAt: publishedAt };
  const putOk = ops.deps.store.put(next);
  if (!putOk.ok) {
    return putOk;
  }
  return ok(next);
}
