/**
 * PROD-001 disclosed in-memory doubles (NOT production transports).
 *
 * These are the established REAL-authority twins used by the adversarial and
 * compat batteries: they implement the production ports, mirror the REAL
 * authorities' observable semantics (state machines, verbatim statuses,
 * typed failures, idempotency, send counting), and expose counters/logs for
 * pinning. Production wiring replaces them with real adapters over
 * @mos/distribution / @mos/jobs / rights / policy / health / integrations.
 */

import { deepFreeze, targetKeyOf } from '../contracts.js';
import type {
  AuthorityObservation,
  AuthorityPublishInput,
  AuthorityPublishResult,
  AuthorityRestriction,
  AuthorityRetractInput,
  AuthorityRetractResult,
  AuthorityScheduleInput,
  AuthorityScheduleResult,
  DeclaredCapabilityInstance,
  DistributionAuthorityPort,
  GateDecision,
  HealthPort,
  HealthRestrictionObservation,
  IntegrationsDirectoryPort,
  JobDeclaration,
  JobHandle,
  JobState,
  JobsPort,
  ObservabilityRecord,
  ObservabilityRecordInput,
  ObservabilityRecorderPort,
  PolicyGateInput,
  PolicyGatePort,
  PublishJobHandler,
  RightsGateInput,
  RightsGatePort,
  TenantId,
  TimeSource,
  TypedJobFailure,
} from '../contracts.js';

// ---------------------------------------------------------------------------
// Time sources
// ---------------------------------------------------------------------------

export class SystemTimeSource implements TimeSource {
  nowMs(): number {
    return Date.now();
  }
  isoNow(): string {
    return new Date().toISOString();
  }
}

export class ManualTimeSource implements TimeSource {
  constructor(private ms: number) {}
  nowMs(): number {
    return this.ms;
  }
  isoNow(): string {
    return new Date(this.ms).toISOString();
  }
  advance(deltaMs: number): void {
    this.ms += deltaMs;
  }
}

// ---------------------------------------------------------------------------
// Gates (verbatim reasons; evaluation order observable)
// ---------------------------------------------------------------------------

export type GateConfig =
  | { readonly decision: 'ALLOW' }
  | { readonly decision: 'DENY'; readonly reason: string }
  | { readonly decision: 'DENY'; readonly reason: string; readonly denyOnlyRefs: readonly string[] };

export class InMemoryRightsGate implements RightsGatePort {
  readonly evaluationLog: string[] = [];
  constructor(private readonly config: GateConfig = { decision: 'ALLOW' }) {}
  async evaluateRights(input: RightsGateInput): Promise<GateDecision> {
    this.evaluationLog.push('rights');
    if (this.config.decision === 'DENY') {
      const only = (this.config as { readonly denyOnlyRefs?: readonly string[] }).denyOnlyRefs;
      if (only === undefined || only.includes(input.rightsContext.rightsGrantRef)) {
        return { decision: 'DENY', reason: this.config.reason };
      }
    }
    return { decision: 'ALLOW' };
  }
}

export class InMemoryPolicyGate implements PolicyGatePort {
  readonly evaluationLog: string[] = [];
  constructor(private readonly config: GateConfig = { decision: 'ALLOW' }) {}
  async evaluatePolicy(input: PolicyGateInput): Promise<GateDecision> {
    this.evaluationLog.push('policy');
    if (this.config.decision === 'DENY') {
      const only = (this.config as { readonly denyOnlyRefs?: readonly string[] }).denyOnlyRefs;
      if (only === undefined || only.includes(input.policyContext.policyRef)) {
        return { decision: 'DENY', reason: this.config.reason };
      }
    }
    return { decision: 'ALLOW' };
  }
}

// ---------------------------------------------------------------------------
// Health authority twin (verbatim statuses; verbatim passthrough)
// ---------------------------------------------------------------------------

export class InMemoryHealthAuthority implements HealthPort {
  readonly consultLog: string[][] = [];
  constructor(private readonly restrictions: readonly HealthRestrictionObservation[] = []) {}
  async readRestrictions(query: { tenant: TenantId; providerIds: readonly string[] }): Promise<readonly HealthRestrictionObservation[]> {
    this.consultLog.push([...query.providerIds]);
    return this.restrictions
      .filter((r) => query.providerIds.includes(r.providerId))
      .map((r) => ({ ...r }));
  }
}

// ---------------------------------------------------------------------------
// Integrations directory twin (exact-version capability resolution)
// ---------------------------------------------------------------------------

export class InMemoryIntegrationsDirectory implements IntegrationsDirectoryPort {
  constructor(private readonly declared: readonly DeclaredCapabilityInstance[] = []) {}
  async listCapabilityInstances(query: { tenant: TenantId; providerIds: readonly string[] }): Promise<readonly DeclaredCapabilityInstance[]> {
    return this.declared
      .filter((d) => query.providerIds.includes(d.providerId))
      .map((d) => ({ ...d }));
  }
}

// ---------------------------------------------------------------------------
// §30 observability sink twin (append-only; ids assigned sink-side)
// ---------------------------------------------------------------------------

export class InMemoryObservabilitySink implements ObservabilityRecorderPort {
  private readonly stored: ObservabilityRecord[] = [];
  private seq = 0;
  get records(): readonly ObservabilityRecord[] {
    return deepFreeze([...this.stored]);
  }
  async appendObservabilityRecord(input: ObservabilityRecordInput): Promise<{ recordId: string }> {
    const record: ObservabilityRecord = deepFreeze({ ...input, recordId: `obs-rec-${(++this.seq).toString(36)}` });
    this.stored.push(record);
    return { recordId: record.recordId };
  }
}

// ---------------------------------------------------------------------------
// Distribution authority twin (the REAL SocialAdapterContract mirror)
// ---------------------------------------------------------------------------

export class AuthorityTransportError extends Error {
  readonly failureKind: string;
  constructor(failureKind: string, message: string) {
    super(message);
    this.name = 'AuthorityTransportError';
    this.failureKind = failureKind;
  }
}

export type PublishScript = (input: AuthorityPublishInput, callIndex: number) => AuthorityPublishResult;

export class InMemoryDistributionAuthority implements DistributionAuthorityPort {
  public readonly invocations = {
    publish: 0,
    schedule: 0,
    delete: 0,
    readObservations: 0,
    listRestrictions: 0,
  };
  public readonly publishLog: AuthorityPublishInput[] = [];
  get sendCount(): number {
    return this.invocations.publish + this.invocations.schedule + this.invocations.delete;
  }
  private readonly observations = new Map<string, AuthorityObservation>();
  private readonly publishMemo = new Map<string, AuthorityPublishResult>();
  private readonly retracted = new Set<string>();
  private seq = 0;
  private readonly time: TimeSource;
  private readonly restrictions: readonly AuthorityRestriction[];
  private readonly publishScript: PublishScript | undefined;

  constructor(opts: {
    time?: TimeSource;
    restrictions?: readonly AuthorityRestriction[];
    publishScript?: PublishScript;
  } = {}) {
    this.time = opts.time ?? new SystemTimeSource();
    this.restrictions = opts.restrictions ?? [];
    this.publishScript = opts.publishScript;
  }

  async publish(input: AuthorityPublishInput): Promise<AuthorityPublishResult> {
    this.invocations.publish += 1;
    this.publishLog.push(input);
    const memoKey = `${input.tenant}\u0000${input.distributionId}\u0000${targetKeyOf(input.target)}`;
    const memoized = this.publishMemo.get(memoKey);
    if (memoized !== undefined) return memoized; // idempotent platform semantics
    const result = this.publishScript !== undefined
      ? this.publishScript(input, this.invocations.publish)
      : this.defaultPublishResult(input);
    this.publishMemo.set(memoKey, result);
    this.observations.set(result.observationId, {
      observationId: result.observationId,
      providerId: result.providerId,
      platformPostRef: result.platformPostRef,
      platformSaid: `platform-said:${result.platformPostRef}`,
      sourceAttribution: `authority:@mos/distribution;provider:${result.providerId}`,
      recordedAt: result.recordedAt,
    });
    return result;
  }

  async schedule(input: AuthorityScheduleInput): Promise<AuthorityScheduleResult> {
    this.invocations.schedule += 1;
    const observationId = `obs-${(++this.seq).toString(36)}`;
    return { observationId, providerId: input.target.capability.providerId, scheduledFor: input.scheduledAt };
  }

  async readObservations(query: { tenant: TenantId; observationIds: readonly string[] }): Promise<readonly AuthorityObservation[]> {
    this.invocations.readObservations += 1;
    const found: AuthorityObservation[] = [];
    for (const id of query.observationIds) {
      const obs = this.observations.get(id);
      if (obs !== undefined && !this.retracted.has(id)) found.push(obs);
    }
    return found;
  }

  async delete(input: AuthorityRetractInput): Promise<AuthorityRetractResult> {
    this.invocations.delete += 1;
    if (!this.observations.has(input.observationId)) {
      throw new AuthorityTransportError('provider_rejected', `unknown observation ${input.observationId}`);
    }
    this.retracted.add(input.observationId);
    return { retractedAt: this.time.isoNow() };
  }

  async listRestrictions(query: { tenant: TenantId; providerIds: readonly string[] }): Promise<readonly AuthorityRestriction[]> {
    this.invocations.listRestrictions += 1;
    return this.restrictions
      .filter((r) => query.providerIds.includes(r.providerId))
      .map((r) => ({ ...r }));
  }

  private readonly defaultPublishResult = (input: AuthorityPublishInput): AuthorityPublishResult => {
    const n = ++this.seq;
    return {
      observationId: `obs-${n.toString(36)}`,
      providerId: input.target.capability.providerId,
      platformPostRef: `post-${n.toString(36)}`,
      recordedAt: this.time.isoNow(),
    };
  };
}

// ---------------------------------------------------------------------------
// Durable jobs twin (REAL @mos/jobs JobQueuePort mirror)
// ---------------------------------------------------------------------------

export function backoffDelayMs(backoff: { readonly baseMs: number }, attempt: number): number {
  const exponent = Math.max(0, attempt - 1);
  return backoff.baseMs * 2 ** exponent;
}

interface TwinJob {
  readonly jobId: string;
  readonly tenant: TenantId;
  readonly declaration: JobDeclaration;
  state: JobState;
  attempts: number;
  nextAttemptAtMs: number;
  lastFailure?: TypedJobFailure;
}

export class InMemoryJobsAuthority implements JobsPort {
  private readonly jobs: TwinJob[] = [];
  private readonly byId = new Map<string, TwinJob>();
  private readonly byClientKey = new Map<string, TwinJob>();
  private readonly handlers = new Map<string, PublishJobHandler>();
  private seq = 0;
  private readonly time: TimeSource;

  constructor(opts: { time?: TimeSource } = {}) {
    this.time = opts.time ?? new SystemTimeSource();
  }

  get size(): number {
    return this.jobs.length;
  }

  registerHandler(kind: string, handler: PublishJobHandler): void {
    this.handlers.set(kind, handler);
  }

  async enqueue(declaration: JobDeclaration): Promise<JobHandle> {
    const key = `${declaration.tenant}\u0000${declaration.clientJobKey}`;
    const existing = this.byClientKey.get(key);
    if (existing !== undefined) return this.snapshot(existing); // idempotent by client job key
    const scheduled = declaration.scheduledAt !== undefined ? Date.parse(declaration.scheduledAt) : Number.NaN;
    const job: TwinJob = {
      jobId: `job-${(++this.seq).toString(36)}`,
      tenant: declaration.tenant,
      declaration,
      state: 'queued',
      attempts: 0,
      nextAttemptAtMs: Number.isFinite(scheduled) ? scheduled : this.time.nowMs(),
    };
    this.jobs.push(job);
    this.byId.set(job.jobId, job);
    this.byClientKey.set(key, job);
    return this.snapshot(job);
  }

  async getJob(query: { tenant: TenantId; jobId: string }): Promise<JobHandle | null> {
    const job = this.byId.get(query.jobId);
    if (job === undefined || job.tenant !== query.tenant) return null;
    return this.snapshot(job);
  }

  async cancelJob(query: { tenant: TenantId; jobId: string }): Promise<JobHandle | null> {
    const job = this.byId.get(query.jobId);
    if (job === undefined || job.tenant !== query.tenant) return null;
    if (job.state === 'queued') job.state = 'cancelled';
    return this.snapshot(job);
  }

  /** Twin-only: next attempt time for a queued job (backoff pinning). */
  nextRunAtMs(jobId: string): number | null {
    const job = this.byId.get(jobId);
    if (job === undefined || job.state !== 'queued') return null;
    return job.nextAttemptAtMs;
  }

  /** Twin-only runtime: drains due jobs; retries from declared backoff. */
  async runDue(nowMs: number = this.time.nowMs()): Promise<void> {
    for (const job of this.jobs) {
      if (job.state !== 'queued') continue;
      if (job.nextAttemptAtMs > nowMs) continue;
      if (job.attempts >= job.declaration.backoff.maxAttempts) continue;
      const handler = this.handlers.get(job.declaration.kind);
      if (handler === undefined) continue; // unregistered handler: stays queued
      job.state = 'running';
      job.attempts += 1;
      let outcome: { ok: true } | { ok: false; failure: TypedJobFailure };
      try {
        outcome = await handler({ jobId: job.jobId, declaration: job.declaration });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        outcome = { ok: false, failure: { kind: 'unknown_failure', message, retryable: false, preservedKind: 'handler-threw' } };
      }
      if (outcome.ok) {
        job.state = 'succeeded';
        delete job.lastFailure;
        continue;
      }
      const failure = outcome.failure;
      job.lastFailure = failure;
      const canRetry = failure.retryable && job.attempts < job.declaration.backoff.maxAttempts;
      if (canRetry) {
        job.state = 'queued';
        job.nextAttemptAtMs = nowMs + backoffDelayMs(job.declaration.backoff, job.attempts);
      } else {
        job.state = failure.kind === 'timeout' ? 'timed_out' : 'failed';
      }
    }
  }

  private readonly snapshot = (job: TwinJob): JobHandle => {
    const base = { jobId: job.jobId, clientJobKey: job.declaration.clientJobKey, state: job.state, attempts: job.attempts };
    return job.lastFailure === undefined ? base : { ...base, lastFailure: job.lastFailure };
  };
}
