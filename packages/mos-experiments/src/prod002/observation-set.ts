import type { Failure, Result } from './errors.js';
import { err, failure, ok } from './errors.js';
import type { TenantId } from './ids.js';
import type { IdGenerator } from './util.js';
import { computeFingerprint, isIsoTimestamp, isPlainRecord } from './util.js';

/** HEALTH-001 restriction classes — provider-CONFIRMED and SUSPECTED never pool. */
export type HealthRestriction = 'provider-CONFIRMED' | 'SUSPECTED';
export type PlatformSaidHealthStatus = 'healthy' | 'degraded' | 'down';

export interface SocialObservationPayload {
  readonly family: 'social';
  readonly metricKey: string;
  readonly trials: number;
  readonly successes: number;
}

export interface MeasureObservationPayload {
  readonly family: 'measure';
  readonly metricKey: string;
  readonly values: readonly number[];
}

export interface PlatformHealthObservationPayload {
  readonly family: 'platform-health';
  readonly provider: string;
  readonly status: PlatformSaidHealthStatus;
  readonly restriction: HealthRestriction;
}

export type ObservationPayload = SocialObservationPayload | MeasureObservationPayload | PlatformHealthObservationPayload;

export function isSocialPayload(payload: ObservationPayload): payload is SocialObservationPayload {
  return payload.family === 'social';
}
export function isMeasurePayload(payload: ObservationPayload): payload is MeasureObservationPayload {
  return payload.family === 'measure';
}
export function isHealthPayload(payload: ObservationPayload): payload is PlatformHealthObservationPayload {
  return payload.family === 'platform-health';
}

/** §24 attribution discipline: what the platform SAID, who said it, through which binding — never causal. */
export interface ObservationAttribution {
  readonly distributionBindingId: string;
  readonly distributionBindingVersion: string;
  readonly saidBy: string;
  readonly channel: string;
}

export interface PlatformSaidObservation {
  readonly observationId: string;
  readonly tenantId: TenantId;
  /** The ONLY evidence channel (§24): 'platform-said'. Simulated/counterfactual records are structurally excluded. */
  readonly source: 'platform-said';
  readonly saidAt: string;
  readonly collectedAt: string;
  readonly attribution: ObservationAttribution;
  readonly degradationFlag: boolean;
  readonly outOfDistributionFlag: boolean;
  readonly payload: ObservationPayload;
  /** Verbatim upstream record — never rewritten, never interpreted. */
  readonly original: Readonly<Record<string, unknown>> | null;
}

export interface PlatformSaidObservationInput {
  readonly observationId: string;
  readonly saidAt: string;
  readonly collectedAt: string;
  readonly attribution: ObservationAttribution;
  readonly degradationFlag: boolean;
  readonly outOfDistributionFlag: boolean;
  readonly payload: ObservationPayload;
  readonly original?: Readonly<Record<string, unknown>>;
}

/** A record whose source channel marks it simulated/counterfactual — exists only to be rejected. */
export interface SimulatedObservation {
  readonly observationId: string;
  readonly source: 'simulated' | 'counterfactual' | 'inferred';
  readonly payload: ObservationPayload;
}

export interface ObservationWindow {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly maxObservations: number | null;
}

export interface ObservationExpectation {
  readonly experimentId: string;
  readonly tenantId: TenantId;
  readonly distributionBindingId: string;
  readonly distributionBindingVersion: string;
  readonly window: ObservationWindow;
}

declare const observationSetBrand: unique symbol;

export interface ObservationSet {
  readonly [observationSetBrand]: true;
  readonly observationSetId: string;
  readonly experimentId: string;
  readonly tenantId: TenantId;
  readonly distributionBinding: { readonly bindingId: string; readonly version: string };
  readonly window: ObservationWindow;
  readonly observations: readonly PlatformSaidObservation[];
  /** sha-256 over the canonical observation stubs — evidence-grade integrity for the audit chain. */
  readonly digest: string;
}

function validateAndCanonicalizePayload(payload: unknown, observationId: string): Result<ObservationPayload, Failure> {
  if (!isPlainRecord(payload)) {
    return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: payload must be a record`, { observationId }));
  }
  const family = payload['family'];
  if (family === 'social') {
    const metricKey = payload['metricKey'];
    const trials = payload['trials'];
    const successes = payload['successes'];
    if (typeof metricKey !== 'string' || metricKey.length === 0) {
      return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: social payload requires a non-empty metricKey`, { observationId, field: 'metricKey' }));
    }
    if (typeof trials !== 'number' || !Number.isInteger(trials) || trials < 1) {
      return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: social payload trials must be an integer >= 1 (got ${String(trials)})`, { observationId, field: 'trials' }));
    }
    if (typeof successes !== 'number' || !Number.isInteger(successes) || successes < 0 || successes > trials) {
      return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: social payload successes must be an integer in [0, trials] (got ${String(successes)}/${String(trials)})`, { observationId, field: 'successes' }));
    }
    return ok({ family: 'social', metricKey, trials, successes });
  }
  if (family === 'measure') {
    const metricKey = payload['metricKey'];
    const values = payload['values'];
    if (typeof metricKey !== 'string' || metricKey.length === 0) {
      return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: measure payload requires a non-empty metricKey`, { observationId, field: 'metricKey' }));
    }
    if (!Array.isArray(values) || values.length === 0) {
      return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: measure payload requires a non-empty values array`, { observationId, field: 'values' }));
    }
    const canonical: number[] = [];
    for (const value of values) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: measure values must be finite numbers (got ${String(value)})`, { observationId, field: 'values' }));
      }
      canonical.push(value);
    }
    return ok({ family: 'measure', metricKey, values: canonical });
  }
  if (family === 'platform-health') {
    const provider = payload['provider'];
    const status = payload['status'];
    const restriction = payload['restriction'];
    if (typeof provider !== 'string' || provider.length === 0) {
      return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: platform-health payload requires a non-empty provider`, { observationId, field: 'provider' }));
    }
    if (status !== 'healthy' && status !== 'degraded' && status !== 'down') {
      return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: platform-said health status must be healthy|degraded|down (got ${JSON.stringify(status)})`, { observationId, field: 'status' }));
    }
    if (restriction !== 'provider-CONFIRMED' && restriction !== 'SUSPECTED') {
      return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: HEALTH-001 restriction must be provider-CONFIRMED or SUSPECTED (got ${JSON.stringify(restriction)}) — the classes are never conflated`, { observationId, field: 'restriction' }));
    }
    return ok({ family: 'platform-health', provider, status, restriction });
  }
  return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: unknown payload family ${JSON.stringify(family)}`, { observationId, family: typeof family === 'string' ? family : null }));
}

/** Validate and stamp a platform-said observation. Every discipline breach is a
 * typed failure, never a silent coercion, never an invented field. */
export function toPlatformSaidObservation(input: unknown, tenantId: TenantId): Result<PlatformSaidObservation, Failure> {
  if (!isPlainRecord(input)) {
    return err(failure('E_OBSERVATION_INVALID', 'observation input must be a record', { observationId: null, field: 'observation' }));
  }
  const observationIdRaw = input['observationId'];
  if (typeof observationIdRaw !== 'string' || observationIdRaw.length === 0) {
    return err(failure('E_OBSERVATION_INVALID', 'observation requires a non-empty observationId', { observationId: null, field: 'observationId' }));
  }
  const observationId: string = observationIdRaw;
  const source = input['source'];
  if (source !== undefined && source !== 'platform-said') {
    return err(failure('E_NON_PLATFORM_SAID_SOURCE', `observation ${observationId} carries source ${JSON.stringify(source)} — only platform-said records can become measured evidence`, { observationId, source: typeof source === 'string' ? source : null }));
  }
  const saidAt = input['saidAt'];
  if (!isIsoTimestamp(saidAt)) {
    return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: saidAt must be an ISO-8601 timestamp`, { observationId, field: 'saidAt' }));
  }
  const collectedAt = input['collectedAt'];
  if (!isIsoTimestamp(collectedAt)) {
    return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: collectedAt must be an ISO-8601 timestamp`, { observationId, field: 'collectedAt' }));
  }
  if (Date.parse(saidAt) > Date.parse(collectedAt)) {
    return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: saidAt must not be after collectedAt (the platform said it before we collected it)`, { observationId, saidAt, collectedAt }));
  }
  const attributionRaw = input['attribution'];
  if (!isPlainRecord(attributionRaw)) {
    return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: attribution must be a record`, { observationId, field: 'attribution' }));
  }
  const bindingId = attributionRaw['distributionBindingId'];
  if (typeof bindingId !== 'string' || bindingId.length === 0) {
    return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: attribution.distributionBindingId must be a non-empty string`, { observationId, field: 'attribution.distributionBindingId' }));
  }
  const bindingVersion = attributionRaw['distributionBindingVersion'];
  if (typeof bindingVersion !== 'string' || bindingVersion.length === 0) {
    return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: attribution.distributionBindingVersion must be a non-empty string`, { observationId, field: 'attribution.distributionBindingVersion' }));
  }
  const saidBy = attributionRaw['saidBy'];
  if (typeof saidBy !== 'string' || saidBy.length === 0) {
    return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: attribution.saidBy must be a non-empty string`, { observationId, field: 'attribution.saidBy' }));
  }
  const channel = attributionRaw['channel'];
  if (typeof channel !== 'string' || channel.length === 0) {
    return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: attribution.channel must be a non-empty string`, { observationId, field: 'attribution.channel' }));
  }
  const payloadResult = validateAndCanonicalizePayload(input['payload'], observationId);
  if (!payloadResult.ok) {
    return payloadResult;
  }
  const degradationFlag = input['degradationFlag'];
  if (typeof degradationFlag !== 'boolean') {
    return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: degradationFlag must be a boolean`, { observationId, field: 'degradationFlag' }));
  }
  const outOfDistributionFlag = input['outOfDistributionFlag'];
  if (typeof outOfDistributionFlag !== 'boolean') {
    return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: outOfDistributionFlag must be a boolean`, { observationId, field: 'outOfDistributionFlag' }));
  }
  const originalRaw = input['original'];
  let original: Readonly<Record<string, unknown>> | null = null;
  if (originalRaw !== undefined && originalRaw !== null) {
    if (!isPlainRecord(originalRaw)) {
      return err(failure('E_OBSERVATION_INVALID', `observation ${observationId}: original must be a record or null`, { observationId, field: 'original' }));
    }
    original = originalRaw;
  }
  const stamped: PlatformSaidObservation = {
    observationId,
    tenantId,
    source: 'platform-said',
    saidAt,
    collectedAt,
    attribution: {
      distributionBindingId: bindingId,
      distributionBindingVersion: bindingVersion,
      saidBy,
      channel,
    },
    degradationFlag,
    outOfDistributionFlag,
    payload: payloadResult.value,
    original,
  };
  return ok(stamped);
}

/**
 * Classify a raw observation record at the boundary. Records whose channel is
 * simulated / counterfactual / inferred are rejected BEFORE any further
 * validation — the measured evidence channel is platform-said only (§20/§24).
 */
export function classifyObservationInput(record: unknown): Result<PlatformSaidObservationInput, Failure> {
  if (!isPlainRecord(record)) {
    return err(failure('E_OBSERVATION_INVALID', 'observation input must be a record', { field: 'observation' }));
  }
  const source = record['source'];
  const observationId: string | null = typeof record['observationId'] === 'string' ? record['observationId'] : null;
  if (source === 'simulated' || source === 'counterfactual' || source === 'inferred') {
    return err(failure(
      'E_NON_PLATFORM_SAID_SOURCE',
      `observation ${observationId ?? '(unidentified)'} carries source '${source}' — simulated/counterfactual/inferred channels can never become measured evidence (§20/§24)`,
      { source, observationId },
    ));
  }
  if (source !== undefined && source !== 'platform-said') {
    return err(failure(
      'E_NON_PLATFORM_SAID_SOURCE',
      `observation ${observationId ?? '(unidentified)'} carries unrecognized source ${JSON.stringify(source)}`,
      { source: typeof source === 'string' ? source : null, observationId },
    ));
  }
  if (source === undefined) {
    return err(failure('E_OBSERVATION_INVALID', 'observation input requires a source', { observationId }));
  }
  // source === 'platform-said': pass through as a typed claim; toPlatformSaidObservation re-validates.
  return ok(record as unknown as PlatformSaidObservationInput);
}

/**
 * Cross-record discipline checks for an already-stamped observation: tenant
 * scope, platform-said channel (runtime defense against casts), attribution
 * match against the resolved §24 chain, and the declared collection window
 * (inclusive bounds).
 */
export function checkStampedObservation(
  observation: PlatformSaidObservation,
  expectation: ObservationExpectation,
): Result<true, Failure> {
  if (observation.tenantId !== expectation.tenantId) {
    return err(failure(
      'E_TENANT_SCOPE_VIOLATION',
      `observation ${observation.observationId} is tenant-scoped to '${observation.tenantId}' but the experiment runs under '${expectation.tenantId}'`,
      { observationId: observation.observationId, observationTenant: observation.tenantId, experimentTenant: expectation.tenantId },
    ));
  }
  if (observation.source !== 'platform-said') {
    return err(failure(
      'E_NON_PLATFORM_SAID_SOURCE',
      `observation ${observation.observationId} is stamped with source '${observation.source}' — only platform-said records are admissible as evidence`,
      { observationId: observation.observationId, source: observation.source },
    ));
  }
  if (
    observation.attribution.distributionBindingId !== expectation.distributionBindingId ||
    observation.attribution.distributionBindingVersion !== expectation.distributionBindingVersion
  ) {
    return err(failure(
      'E_ATTRIBUTION_BINDING_MISMATCH',
      `observation ${observation.observationId} is attributed to binding ${observation.attribution.distributionBindingId}@${observation.attribution.distributionBindingVersion} but the experiment's resolved chain requires ${expectation.distributionBindingId}@${expectation.distributionBindingVersion}`,
      {
        observationId: observation.observationId,
        observationBinding: { bindingId: observation.attribution.distributionBindingId, version: observation.attribution.distributionBindingVersion },
        chainBinding: { bindingId: expectation.distributionBindingId, version: expectation.distributionBindingVersion },
      },
    ));
  }
  const saidAtMs = Date.parse(observation.saidAt);
  if (saidAtMs < Date.parse(expectation.window.startsAt) || saidAtMs > Date.parse(expectation.window.endsAt)) {
    return err(failure(
      'E_OBSERVATION_OUTSIDE_WINDOW',
      `observation ${observation.observationId} was said at ${observation.saidAt}, outside the collection window [${expectation.window.startsAt}, ${expectation.window.endsAt}]`,
      { observationId: observation.observationId, saidAt: observation.saidAt, startsAt: expectation.window.startsAt, endsAt: expectation.window.endsAt },
    ));
  }
  return ok(true);
}

/**
 * Seal a batch of already-stamped observations into an evidence-grade
 * ObservationSet: every record re-checked, duplicates rejected, the declared
 * cap enforced, and a sha-256 digest computed over the canonical stubs.
 */
export function buildObservationSet(
  expectation: ObservationExpectation,
  observations: readonly PlatformSaidObservation[],
  ids: IdGenerator,
): Result<ObservationSet, Failure> {
  const cap = expectation.window.maxObservations;
  const accepted: PlatformSaidObservation[] = [];
  const seen = new Set<string>();
  for (const observation of observations) {
    if (cap !== null && accepted.length >= cap) {
      return err(failure(
        'E_OBSERVATION_LIMIT_EXCEEDED',
        `the collection window caps at ${cap} observations (attempted ${observations.length})`,
        { cap, attempted: observations.length },
      ));
    }
    const check = checkStampedObservation(observation, expectation);
    if (!check.ok) {
      return check;
    }
    if (seen.has(observation.observationId)) {
      return err(failure('E_DUPLICATE_OBSERVATION', `observation ${observation.observationId} was already ingested`, { observationId: observation.observationId }));
    }
    seen.add(observation.observationId);
    accepted.push(observation);
  }
  const stubs = accepted.map((observation) => ({
    observationId: observation.observationId,
    saidAt: observation.saidAt,
    collectedAt: observation.collectedAt,
    binding: {
      bindingId: observation.attribution.distributionBindingId,
      version: observation.attribution.distributionBindingVersion,
    },
    saidBy: observation.attribution.saidBy,
    channel: observation.attribution.channel,
    degradation: observation.degradationFlag,
    ood: observation.outOfDistributionFlag,
    payload: observation.payload,
  }));
  const digest = computeFingerprint({
    experimentId: expectation.experimentId,
    tenantId: expectation.tenantId,
    distributionBinding: {
      bindingId: expectation.distributionBindingId,
      version: expectation.distributionBindingVersion,
    },
    window: expectation.window,
    observations: stubs,
  });
  const sealed: ObservationSet = {
    observationSetId: ids.nextId('obsset'),
    experimentId: expectation.experimentId,
    tenantId: expectation.tenantId,
    distributionBinding: {
      bindingId: expectation.distributionBindingId,
      version: expectation.distributionBindingVersion,
    },
    window: expectation.window,
    observations: accepted,
    digest,
  } as unknown as ObservationSet;
  return ok(sealed);
}
