/**
 * PROD-002 — in-memory adapters for the ports. These are REAL adapters (not
 * test doubles): composition roots and batteries use them; production roots
 * swap them for durable/rights-backed implementations.
 */
import type { Failure, Result } from './errors.js';
import { err, failure, ok } from './errors.js';
import type { TenantId } from './ids.js';
import type { AuthorityVersions, ExperimentRecord } from './engine.js';
import type {
  AuthorityVersionResolver,
  ExperimentStore,
  JobsPort,
  LearningSinkPort,
  RightsAction,
  RightsDecision,
  RightsGatePort,
  RightsRequest,
  TrailEvent,
  TrailPort,
} from './ports.js';
import type { LearningRecord } from './learning.js';

export class MemoryExperimentStore implements ExperimentStore {
  #records = new Map<string, ExperimentRecord>();
  #failNext = 0;
  constructor(options?: { readonly failNext?: number }) {
    this.#failNext = options?.failNext ?? 0;
  }
  get(experimentId: string): Result<ExperimentRecord | null, Failure> {
    if (this.#failNext > 0) {
      this.#failNext -= 1;
      return err(failure('E_STORE_FAILED', 'store: injected failure', { operation: 'get', experimentId }));
    }
    return ok(this.#records.get(experimentId) ?? null);
  }
  put(record: ExperimentRecord): Result<void, Failure> {
    if (this.#failNext > 0) {
      this.#failNext -= 1;
      return err(failure('E_STORE_FAILED', 'store: injected failure', { operation: 'put', experimentId: record.experimentId }));
    }
    this.#records.set(record.experimentId, record);
    return ok(undefined);
  }
  list(tenantId: TenantId): Result<readonly ExperimentRecord[], Failure> {
    if (this.#failNext > 0) {
      this.#failNext -= 1;
      return err(failure('E_STORE_FAILED', 'store: injected failure', { operation: 'list', tenantId }));
    }
    const out: ExperimentRecord[] = [];
    for (const record of this.#records.values()) {
      if (record.tenantId === tenantId) {
        out.push(record);
      }
    }
    return ok(out);
  }
}

export class MemoryTrailSink implements TrailPort {
  readonly events: TrailEvent[] = [];
  #failNext = 0;
  constructor(options?: { readonly failNext?: number }) {
    this.#failNext = options?.failNext ?? 0;
  }
  emit(event: TrailEvent): Result<void, Failure> {
    if (this.#failNext > 0) {
      this.#failNext -= 1;
      return err(failure('E_TRAIL_FAILED', 'trail: injected failure', { kind: event.kind, eventId: event.eventId }));
    }
    this.events.push(event);
    return ok(undefined);
  }
}

export interface MemoryRightsRule {
  readonly actors?: readonly string[];
  readonly actions?: readonly RightsAction[];
  readonly targetTenants?: readonly string[];
  readonly allow: boolean;
  readonly authority?: string;
}

export class MemoryRightsGate implements RightsGatePort {
  readonly #rules: readonly MemoryRightsRule[];
  constructor(rules: readonly MemoryRightsRule[] = []) {
    this.#rules = rules;
  }
  check(request: RightsRequest): Result<RightsDecision, Failure> {
    for (const rule of this.#rules) {
      if (rule.actors !== undefined && !rule.actors.includes(request.actor)) continue;
      if (rule.actions !== undefined && !rule.actions.includes(request.action)) continue;
      if (rule.targetTenants !== undefined && !rule.targetTenants.includes(request.targetTenantId)) continue;
      if (rule.allow) {
        const allowed: RightsDecision = { allowed: true };
        return ok(allowed);
      }
      const denied: RightsDecision = { allowed: false, denial: this.#verbatim(request, rule.authority ?? '@mos/rights', 'rule denies') };
      return ok(denied);
    }
    // Fail-closed: no matching rule denies the cross-tenant access.
    const failClosed: RightsDecision = { allowed: false, denial: this.#verbatim(request, '@mos/rights', 'no matching rule — fail closed') };
    return ok(failClosed);
  }
  #verbatim(request: RightsRequest, authority: string, cause: string): { authority: string; verbatim: string } {
    return {
      authority,
      verbatim: `${authority} said: deny ${request.actor} ${request.action} on ${request.resource} (tenant ${request.tenantId} -> ${request.targetTenantId}) — ${cause}`,
    };
  }
}

export class MemoryLearningSink implements LearningSinkPort {
  readonly records: LearningRecord[] = [];
  #failNext = 0;
  constructor(options?: { readonly failNext?: number }) {
    this.#failNext = options?.failNext ?? 0;
  }
  publish(record: LearningRecord): Result<void, Failure> {
    if (this.#failNext > 0) {
      this.#failNext -= 1;
      return err(failure('E_LEARNING_PUBLISH_FAILED', 'learning sink: injected failure', { learningRecordId: record.learningRecordId }));
    }
    this.records.push(record);
    return ok(undefined);
  }
}

export interface MemoryJobEntry {
  readonly jobId: string;
  readonly kind: string;
  readonly payload: Readonly<Record<string, unknown>>;
  status: 'queued' | 'completed' | 'failed';
  outcome?: Readonly<Record<string, unknown>>;
  failReason?: string;
}

export class MemoryJobQueue implements JobsPort {
  readonly jobs: MemoryJobEntry[] = [];
  #failNext = 0;
  #sequence = 0;
  constructor(options?: { readonly failNext?: number }) {
    this.#failNext = options?.failNext ?? 0;
  }
  enqueue(input: { readonly kind: string; readonly payload: Readonly<Record<string, unknown>> }): Result<{ readonly jobId: string }, Failure> {
    if (this.#failNext > 0) {
      this.#failNext -= 1;
      return err(failure('E_JOB_ENQUEUE_FAILED', 'jobs: injected failure', { kind: input.kind }));
    }
    const payload = input.payload;
    const experimentId = payload['experimentId'];
    if (typeof experimentId !== 'string' || experimentId.length === 0) {
      return err(failure('E_JOB_PAYLOAD_MISMATCH', `job payload for kind '${input.kind}' requires a non-empty experimentId`, { kind: input.kind, field: 'experimentId' }));
    }
    const tenantId = payload['tenantId'];
    if (typeof tenantId !== 'string' || tenantId.length === 0) {
      return err(failure('E_JOB_PAYLOAD_MISMATCH', `job payload for kind '${input.kind}' requires a non-empty tenantId`, { kind: input.kind, field: 'tenantId' }));
    }
    this.#sequence += 1;
    const jobId = `job-${this.#sequence}`;
    this.jobs.push({ jobId, kind: input.kind, payload, status: 'queued' });
    return ok({ jobId });
  }
  complete(jobId: string, outcome: Readonly<Record<string, unknown>>): Result<void, Failure> {
    if (this.#failNext > 0) {
      this.#failNext -= 1;
      return err(failure('E_JOB_COMPLETE_FAILED', 'jobs: injected failure', { jobId }));
    }
    const entry = this.#find(jobId);
    if (entry === null) {
      return err(failure('E_JOB_COMPLETE_FAILED', `no job '${jobId}'`, { jobId }));
    }
    if (entry.status !== 'queued') {
      return err(failure('E_JOB_COMPLETE_FAILED', `job '${jobId}' is already ${entry.status}`, { jobId, status: entry.status }));
    }
    entry.status = 'completed';
    entry.outcome = outcome;
    return ok(undefined);
  }
  fail(jobId: string, reason: string): Result<void, Failure> {
    if (this.#failNext > 0) {
      this.#failNext -= 1;
      return err(failure('E_JOB_FAIL_FAILED', 'jobs: injected failure', { jobId }));
    }
    if (reason.length === 0) {
      return err(failure('E_JOB_FAIL_FAILED', `job '${jobId}' requires a non-empty fail reason`, { jobId }));
    }
    const entry = this.#find(jobId);
    if (entry === null) {
      return err(failure('E_JOB_FAIL_FAILED', `no job '${jobId}'`, { jobId }));
    }
    if (entry.status !== 'queued') {
      return err(failure('E_JOB_FAIL_FAILED', `job '${jobId}' is already ${entry.status}`, { jobId, status: entry.status }));
    }
    entry.status = 'failed';
    entry.failReason = reason;
    return ok(undefined);
  }
  #find(jobId: string): MemoryJobEntry | null {
    for (const entry of this.jobs) {
      if (entry.jobId === jobId) {
        return entry;
      }
    }
    return null;
  }
}

/**
 * A fixed AuthorityVersionResolver for batteries and composition roots.
 * The VALUES it returns must come from the real live modules — this adapter
 * only makes them injectable (never invents versions).
 */
export class StaticAuthorityVersions implements AuthorityVersionResolver {
  readonly #value: AuthorityVersions;
  constructor(value: AuthorityVersions) {
    this.#value = value;
  }
  resolve(): Result<AuthorityVersions, Failure> {
    return ok(this.#value);
  }
}
