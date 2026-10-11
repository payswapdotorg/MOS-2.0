/**
 * PROD-002 — upstream adaptation. ALL upstream-shape assumptions that cannot
 * be compile-pinned live HERE: the Lab candidate prediction (arrives as raw
 * data from the Lab tier) and the jobs-authority probe. Precise diagnostics
 * on every mismatch — never a silent guess.
 */
import type { Failure, Result } from './errors.js';
import { err, failure, ok } from './errors.js';
import type { HealthRestriction } from './observation-set.js';
import type { JobsPort } from './ports.js';
import { isFiniteNumber, isPlainRecord, pickString } from './util.js';

export interface PredictedPoint {
  readonly metricKey: string;
  readonly stratum?: HealthRestriction;
  readonly point: number;
  readonly lower?: number;
  readonly upper?: number;
}

export interface CitedPrediction {
  readonly labCandidateId: string;
  readonly labModuleVersion: string;
  readonly predictedAt: string;
  readonly points: readonly PredictedPoint[];
}

const CANDIDATE_ID_KEYS = ['labCandidateId', 'candidateId', 'id'] as const;
const CANDIDATE_VERSION_KEYS = ['labModuleVersion', 'labVersion', 'modelVersion', 'version'] as const;
const CANDIDATE_AT_KEYS = ['predictedAt', 'createdAt', 'generatedAt', 'at'] as const;
const CANDIDATE_POINTS_KEYS = ['points', 'predictions', 'forecast', 'predicted'] as const;
const POINT_METRIC_KEYS = ['metricKey', 'key', 'name'] as const;
const POINT_VALUE_KEYS = ['point', 'value', 'predicted', 'prediction'] as const;

/**
 * Extract a CitedPrediction from a raw Lab candidate record. The cited
 * prediction is carried VERBATIM into the learning record — PROD-002 never
 * reshapes what the Lab said.
 */
export function extractCitedPrediction(candidate: unknown): Result<CitedPrediction, Failure> {
  if (!isPlainRecord(candidate)) {
    return err(failure('E_PLAN_INVALID', 'labCandidate must be a record (the cited Lab candidate)', { field: 'labCandidate' }));
  }
  const labCandidateId = pickString(candidate, CANDIDATE_ID_KEYS);
  if (labCandidateId === null) {
    return err(failure('E_PLAN_INVALID', `labCandidate: no candidate identifier found (probed: ${CANDIDATE_ID_KEYS.join(', ')})`, { field: 'labCandidate', probed: [...CANDIDATE_ID_KEYS] }));
  }
  const labModuleVersion = pickString(candidate, CANDIDATE_VERSION_KEYS);
  if (labModuleVersion === null) {
    return err(failure('E_PLAN_INVALID', `labCandidate: no Lab module version found (probed: ${CANDIDATE_VERSION_KEYS.join(', ')})`, { field: 'labCandidate', probed: [...CANDIDATE_VERSION_KEYS] }));
  }
  const predictedAt = pickString(candidate, CANDIDATE_AT_KEYS);
  if (predictedAt === null) {
    return err(failure('E_PLAN_INVALID', `labCandidate: no prediction timestamp found (probed: ${CANDIDATE_AT_KEYS.join(', ')})`, { field: 'labCandidate', probed: [...CANDIDATE_AT_KEYS] }));
  }
  let pointsRaw: unknown = undefined;
  for (const key of CANDIDATE_POINTS_KEYS) {
    const value = candidate[key];
    if (value !== undefined && value !== null) {
      pointsRaw = value;
      break;
    }
  }
  if (!Array.isArray(pointsRaw)) {
    return err(failure('E_PLAN_INVALID', `labCandidate: predicted points must be an array (probed: ${CANDIDATE_POINTS_KEYS.join(', ')})`, { field: 'labCandidate', probed: [...CANDIDATE_POINTS_KEYS] }));
  }
  const points: PredictedPoint[] = [];
  for (const entry of pointsRaw) {
    if (!isPlainRecord(entry)) {
      return err(failure('E_PLAN_INVALID', 'labCandidate: each predicted point must be a record', { field: 'labCandidate.points' }));
    }
    const metricKey = pickString(entry, POINT_METRIC_KEYS);
    if (metricKey === null) {
      return err(failure('E_PLAN_INVALID', `labCandidate: predicted point without a metric key (probed: ${POINT_METRIC_KEYS.join(', ')})`, { field: 'labCandidate.points' }));
    }
    let point: number | null = null;
    for (const valueKey of POINT_VALUE_KEYS) {
      const raw = entry[valueKey];
      if (isFiniteNumber(raw)) {
        point = raw;
        break;
      }
    }
    if (point === null) {
      return err(failure('E_PLAN_INVALID', `labCandidate: predicted point for '${metricKey}' without a finite value (probed: ${POINT_VALUE_KEYS.join(', ')})`, { field: 'labCandidate.points', metricKey }));
    }
    const lower = isFiniteNumber(entry['lower']) ? entry['lower'] : undefined;
    const upper = isFiniteNumber(entry['upper']) ? entry['upper'] : undefined;
    const stratumRaw = entry['stratum'];
    const stratum: HealthRestriction | undefined =
      stratumRaw === 'provider-CONFIRMED' || stratumRaw === 'SUSPECTED' ? stratumRaw : undefined;
    points.push({
      metricKey,
      point,
      ...(lower !== undefined ? { lower } : {}),
      ...(upper !== undefined ? { upper } : {}),
      ...(stratum !== undefined ? { stratum } : {}),
    });
  }
  if (points.length === 0) {
    return err(failure('E_PLAN_INVALID', 'labCandidate: no predicted points found — the learning loop needs the Lab prediction', { field: 'labCandidate.points' }));
  }
  return ok({ labCandidateId, labModuleVersion, predictedAt, points });
}

type RawJobsLike = {
  enqueue: (input: unknown) => unknown;
  complete: (jobId: string, outcome: unknown) => unknown;
  fail: (jobId: string, reason: string) => unknown;
};

/**
 * Adapt a jobs-authority candidate onto the PROD-002 JobsPort contract.
 * Presence probing with precise diagnostics; wrapped calls delegate with
 * PROD-002's argument shapes and normalize the authority's return. A Promise
 * return is reported as E_JOBS_PORT_INCOMPATIBLE — PROD-002 never fakes a
 * durable result and never bridges an async authority silently.
 */
export function adaptJobsPort(candidate: unknown): Result<JobsPort, Failure> {
  if (typeof candidate !== 'object' || candidate === null) {
    return err(failure('E_JOBS_PORT_INCOMPATIBLE', 'jobs authority candidate must be a non-null object', { found: typeof candidate }));
  }
  const holder = candidate as Record<string, unknown>;
  const probe: string[] = [];
  let missing = false;
  for (const method of ['enqueue', 'complete', 'fail'] as const) {
    const value = holder[method];
    if (typeof value === 'function') {
      probe.push(`${method}:function(arity ${value.length})`);
    } else {
      probe.push(`${method}:missing`);
      missing = true;
    }
  }
  if (missing) {
    return err(failure('E_JOBS_PORT_INCOMPATIBLE', 'jobs authority candidate does not expose enqueue/complete/fail', { probe }));
  }
  const raw = candidate as unknown as RawJobsLike;
  return ok({
    enqueue: (input) => {
      const result = unwrapJobsReturn(raw.enqueue(input), 'E_JOB_ENQUEUE_FAILED', 'enqueue');
      if (!result.ok) {
        return result;
      }
      const returned = result.value;
      if (isPlainRecord(returned)) {
        const jobId = returned['jobId'];
        if (typeof jobId === 'string' && jobId.length > 0) {
          return ok({ jobId });
        }
      }
      return err(failure('E_JOB_ENQUEUE_FAILED', 'jobs authority enqueue returned no jobId', { operation: 'enqueue' }));
    },
    complete: (jobId, outcome) => unwrapJobsReturn(raw.complete(jobId, outcome), 'E_JOB_COMPLETE_FAILED', 'complete'),
    fail: (jobId, reason) => unwrapJobsReturn(raw.fail(jobId, reason), 'E_JOB_FAIL_FAILED', 'fail'),
  });
}

function unwrapJobsReturn<T>(
  value: unknown,
  code: 'E_JOB_ENQUEUE_FAILED' | 'E_JOB_COMPLETE_FAILED' | 'E_JOB_FAIL_FAILED',
  operation: string,
): Result<T, Failure> {
  if (typeof value === 'object' && value !== null && 'then' in value && typeof (value as { then?: unknown }).then === 'function') {
    return err(failure(
      'E_JOBS_PORT_INCOMPATIBLE',
      `jobs authority ${operation} returned a Promise — the composition root must provide a synchronous durable driver adapter (PROD-002 never fakes durability)`,
      { operation },
    ));
  }
  if (isPlainRecord(value) && value['ok'] === true) {
    return ok(value['value'] as T);
  }
  if (isPlainRecord(value) && value['ok'] === false && isPlainRecord(value['error'])) {
    const errorRecord = value['error'] as Record<string, unknown>;
    return err(failure(
      typeof errorRecord['code'] === 'string' ? errorRecord['code'] : code,
      typeof errorRecord['message'] === 'string' ? errorRecord['message'] : `jobs authority ${operation} failed`,
      isPlainRecord(errorRecord['details']) ? errorRecord['details'] : {},
    ));
  }
  return err(failure(code, `jobs authority ${operation} returned an unrecognized result shape`, { operation, returned: typeof value }));
}
