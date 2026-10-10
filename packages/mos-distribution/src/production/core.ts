/**
 * PROD-001 core — the gate-ordered production distribution surface.
 *
 * AC2 chain, in order, per attempt:
 *   1. caller validation        (caller-error shapes record NOTHING)
 *   2. idempotent replay check  (tenant + clientJobKey; no second attempt)
 *   3. capability resolution    (EXACT version; undeclared => caller error)
 *   4. rights gate              \
 *   5. policy gate               > denial: ZERO transport, verbatim reason,
 *   6. health/restrictions      /  exactly ONE §30 record
 *   7. durable enqueue (jobs)   — publishing NEVER executes synchronously
 *   8. job handler              — transport ONLY via DistributionAuthorityPort
 *
 * AC1: this surface composes + records; it never re-implements transport.
 * AC5/§26: both immediate and scheduled publishing ride the jobs authority
 * (a transport-side schedule would be a synchronous-HTTP durability claim).
 * AC7: observation payloads are never stored; only by-reference citations.
 */

import {
  AuthorityFailureSignal,
  DEFAULT_PUBLISH_BACKOFF,
  DEFAULT_PUBLISH_TIMEOUT_MS,
  DistributionCallerError,
  capabilityKeyOf,
  deepFreeze,
  targetKeyOf,
} from './contracts.js';
import type {
  AuthorityRestriction,
  DenialOrigin,
  DistributionAuthorityPort,
  DistributionEvent,
  DistributionEventKind,
  DistributionPlan,
  DistributionSubmitResult,
  HealthExclusion,
  HealthPort,
  HealthRestrictionObservation,
  IntegrationsDirectoryPort,
  JobDeclaration,
  JobHandle,
  JobsPort,
  ObservationRef,
  ObservabilityRecorderPort,
  PolicyGatePort,
  ProviderTarget,
  PublishJobHandler,
  RetractionResult,
  RightsGatePort,
  TenantId,
  TimeSource,
  TypedJobFailure,
} from './contracts.js';
import type { LookupInput, RetractionInput } from './guards.js';
import { validateDistributionRequest, validateLookupInput, validateRetractionInput } from './guards.js';
import type { DistributionRecordStore } from './store.js';

const PUBLISH_JOB_KIND = 'mos-distribution.production.publish';

/** Unknown authority failure kinds preserved verbatim; never retried (AC8). */
export function classifyAuthorityFailure(err: unknown): TypedJobFailure {
  const message = err instanceof Error ? err.message : String(err);
  const failureKind =
    err !== null && typeof err === 'object' && 'failureKind' in err && typeof (err as Record<string, unknown>).failureKind === 'string'
      ? ((err as Record<string, unknown>).failureKind as string)
      : undefined;
  switch (failureKind) {
    case 'transport_error':
      return { kind: 'transport_error', message, retryable: true };
    case 'provider_rejected':
      return { kind: 'provider_rejected', message, retryable: false };
    case 'timeout':
      return { kind: 'timeout', message, retryable: true };
    default:
      return { kind: 'unknown_failure', message, retryable: false, preservedKind: failureKind ?? 'unclassified' };
  }
}

export interface ProductionDistributionDeps {
  readonly rightsGate: RightsGatePort;
  readonly policyGate: PolicyGatePort;
  readonly authority: DistributionAuthorityPort;
  readonly jobs: JobsPort;
  readonly health: HealthPort;
  readonly integrations: IntegrationsDirectoryPort;
  readonly observability: ObservabilityRecorderPort;
  readonly store: DistributionRecordStore;
  readonly time: TimeSource;
}

export class ProductionDistributionService {
  constructor(private readonly deps: ProductionDistributionDeps) {}

  // -- reads (tenant-scoped) ------------------------------------------------

  getPlan(query: LookupInput): DistributionPlan | null {
    return this.deps.store.getPlan(query);
  }

  listPlans(tenant: TenantId): readonly DistributionPlan[] {
    return this.deps.store.listPlans({ tenant });
  }

  listEvents(query: { tenant: TenantId; distributionId?: string }): readonly DistributionEvent[] {
    return this.deps.store.listEvents(query);
  }

  /** AC7: by-reference observation citations; payloads never stored. */
  async readObservationRefs(raw: unknown): Promise<readonly ObservationRef[]> {
    const { tenant, distributionId } = validateLookupInput(raw);
    const plan = this.deps.store.getPlan({ tenant, distributionId });
    if (plan === null) throw new DistributionCallerError([{ path: 'distributionId', rule: 'not-found-for-tenant' }]);
    return collectObservationRefs(this.deps.store.listEvents({ tenant, distributionId }));
  }

  // -- submission -----------------------------------------------------------

  async submitDistributionRequest(raw: unknown): Promise<DistributionSubmitResult> {
    // 1. caller validation — caller-error shapes record NOTHING (AC2).
    const request = validateDistributionRequest(raw);

    // 2. idempotent replay (tenant + clientJobKey): no second attempt.
    const existing = this.deps.store.findPlanByJobKey({ tenant: request.tenant, clientJobKey: request.clientJobKey });
    if (existing !== null) {
      const handle = await this.currentJobHandle(existing);
      return {
        distributionId: existing.distributionId,
        status: existing.denial !== undefined ? 'denied' : 'queued',
        plan: existing,
        replayed: true,
        ...(existing.denial !== undefined ? { reason: existing.denial.reason } : {}),
        ...(handle !== null ? { job: handle } : {}),
      };
    }

    // 3. capability resolution at EXACT version (AC4); undeclared capability
    //    is a caller-error class: records nothing, transports nothing.
    const providerIds = [...new Set(request.targets.map((t) => t.capability.providerId))];
    const declared = await this.deps.integrations.listCapabilityInstances({ tenant: request.tenant, providerIds });
    const declaredKeys = new Set(declared.map((d) => capabilityKeyOf(d)));
    const undeclared = request.targets.filter((t) => !declaredKeys.has(capabilityKeyOf(t.capability)));
    if (undeclared.length > 0) {
      throw new DistributionCallerError(undeclared.map((t) => ({
        path: `targets(${targetKeyOf(t)})`,
        rule: 'undeclared-capability-refusal',
      })));
    }

    // 4-5. gate chain: rights → policy. Denial: verbatim reason, zero transport.
    const rights = await this.deps.rightsGate.evaluateRights({
      tenant: request.tenant,
      artifactRefs: request.artifactRefs,
      targets: request.targets,
      rightsContext: request.rightsContext,
    });
    let denial: { reason: string; decidedAt: DenialOrigin } | undefined;
    let policyState: 'ALLOW' | 'DENY' | 'not-evaluated' = 'not-evaluated';
    if (rights.decision === 'DENY') {
      denial = { reason: rights.reason, decidedAt: 'rights-gate' };
    } else {
      const policy = await this.deps.policyGate.evaluatePolicy({
        tenant: request.tenant,
        artifactRefs: request.artifactRefs,
        targets: request.targets,
        policyContext: request.policyContext,
      });
      policyState = policy.decision;
      if (policy.decision === 'DENY') denial = { reason: policy.reason, decidedAt: 'policy-gate' };
    }

    // 6. health-respect (AC6) + provider-declared restrictions — consulted
    //    ONLY when the gates allowed the attempt.
    const gateDenied = denial !== undefined;
    let healthRestrictions: readonly HealthRestrictionObservation[] = [];
    let providerRestrictions: readonly AuthorityRestriction[] = [];
    if (!gateDenied) {
      healthRestrictions = await this.deps.health.readRestrictions({ tenant: request.tenant, providerIds });
      providerRestrictions = await this.deps.authority.listRestrictions({ tenant: request.tenant, providerIds });
    }
    const exclusions: HealthExclusion[] = [];
    if (!gateDenied) {
      for (const target of request.targets) {
        const key = targetKeyOf(target);
        for (const h of healthRestrictions) {
          if (h.providerId !== target.capability.providerId) continue;
          if (h.channelRef !== undefined && h.channelRef !== target.capability.channelRef) continue;
          // Only the literal 'CONFIRMED' gates; SUSPECTED/UNKNOWN/other never.
          if (h.status === 'CONFIRMED') {
            exclusions.push({ targetKey: key, source: 'health-confirmed', restrictionId: h.restrictionId, status: h.status });
          }
        }
        for (const r of providerRestrictions) {
          if (r.providerId !== target.capability.providerId || r.state !== 'active') continue;
          if (r.channelRef !== undefined && r.channelRef !== target.capability.channelRef) continue;
          exclusions.push({ targetKey: key, source: 'provider-declared-active', restrictionId: r.restrictionId, status: 'active' });
        }
      }
    }
    const maneuverTargets: readonly ProviderTarget[] = gateDenied
      ? []
      : request.targets.filter((t) => !exclusions.some((e) => e.targetKey === targetKeyOf(t)));
    if (!gateDenied && maneuverTargets.length === 0) {
      // Compliant maneuvers only: nothing may execute. Reason is synthesized
      // from the consulted restriction ids (DISCLOSED — not a gate verbatim).
      denial = {
        reason: `health-restrictions: all targets excluded by [${[...new Set(exclusions.map((e) => `${e.source}:${e.restrictionId}`))].join(', ')}]`,
        decidedAt: 'health-restrictions',
      };
    }

    // Plan + records. Exactly ONE §30 record per attributable attempt.
    const distributionId = this.deps.store.newDistributionId();
    const nowIso = this.deps.time.isoNow();
    const plan: DistributionPlan = deepFreeze({
      distributionId,
      tenant: request.tenant,
      request,
      maneuverTargets,
      exclusions,
      gateChain: { rights: rights.decision, policy: policyState },
      schedule: request.schedule,
      backoff: request.backoffPolicy ?? DEFAULT_PUBLISH_BACKOFF,
      createdAt: nowIso,
      ...(denial !== undefined ? { denial } : {}),
      ...(!gateDenied
        ? {
            healthContextConsulted: {
              consultedAt: nowIso,
              restrictions: healthRestrictions.map((h) => ({ ...h })),
            },
            providerRestrictionsConsulted: providerRestrictions.map((r) => ({ ...r })),
          }
        : {}),
    });
    this.deps.store.recordPlan(plan);
    this.appendEvent(request.tenant, distributionId, 'requested');

    if (denial !== undefined) {
      this.appendEvent(request.tenant, distributionId, 'denied', { reason: denial.reason });
      await this.deps.observability.appendObservabilityRecord({
        tenant: request.tenant,
        recordedAt: nowIso,
        distributionId,
        outcome: 'denied',
        decidedAt: denial.decidedAt,
        reason: denial.reason,
      });
      return { distributionId, status: 'denied', reason: denial.reason, plan };
    }

    // 7. durable enqueue (§26): immediate AND scheduled both ride the jobs
    //    authority; scheduledAt is honored by the queue, never by transport.
    const declaration: JobDeclaration = {
      tenant: request.tenant,
      clientJobKey: request.clientJobKey,
      kind: PUBLISH_JOB_KIND,
      payload: { distributionId, targets: maneuverTargets, artifactRefs: request.artifactRefs },
      backoff: plan.backoff,
      timeoutMs: DEFAULT_PUBLISH_TIMEOUT_MS,
      ...(request.schedule.kind === 'scheduled' ? { scheduledAt: (request.schedule as { scheduledAt: string }).scheduledAt } : {}),
    };
    const job = await this.deps.jobs.enqueue(declaration);
    this.appendEvent(request.tenant, distributionId, 'queued', { jobId: job.jobId });
    await this.deps.observability.appendObservabilityRecord({
      tenant: request.tenant,
      recordedAt: nowIso,
      distributionId,
      outcome: 'allowed',
      decidedAt: 'gate-chain',
    });
    return { distributionId, status: 'queued', job, plan };
  }

  // -- retraction (composes delete-retract through the SAME gate chain) ----

  async requestRetraction(raw: unknown): Promise<RetractionResult> {
    const input = validateRetractionInput(raw);
    const plan = this.deps.store.getPlan({ tenant: input.tenant, distributionId: input.distributionId });
    if (plan === null) {
      // Cross-tenant probes and unknown ids share one shape: not-found.
      throw new DistributionCallerError([{ path: 'distributionId', rule: 'not-found-for-tenant' }]);
    }
    const rights = await this.deps.rightsGate.evaluateRights({
      tenant: input.tenant,
      artifactRefs: plan.request.artifactRefs,
      targets: plan.request.targets,
      rightsContext: input.rightsContext,
    });
    if (rights.decision === 'DENY') return this.denyRetraction(input, rights.reason, 'rights-gate');
    const policy = await this.deps.policyGate.evaluatePolicy({
      tenant: input.tenant,
      artifactRefs: plan.request.artifactRefs,
      targets: plan.request.targets,
      policyContext: input.policyContext,
    });
    if (policy.decision === 'DENY') return this.denyRetraction(input, policy.reason, 'policy-gate');

    const refs = collectObservationRefs(this.deps.store.listEvents({ tenant: input.tenant, distributionId: input.distributionId }));
    for (const ref of refs) {
      await this.deps.authority.delete({
        tenant: input.tenant,
        distributionId: input.distributionId,
        observationId: ref.observationId,
        reason: input.reason,
      });
    }
    this.appendEvent(input.tenant, input.distributionId, 'retracted');
    await this.deps.observability.appendObservabilityRecord({
      tenant: input.tenant,
      recordedAt: this.deps.time.isoNow(),
      distributionId: input.distributionId,
      outcome: 'allowed',
      decidedAt: 'gate-chain',
    });
    return { status: 'retracted' };
  }

  private async denyRetraction(input: RetractionInput, reason: string, decidedAt: DenialOrigin): Promise<RetractionResult> {
    this.appendEvent(input.tenant, input.distributionId, 'retraction-denied', { reason });
    await this.deps.observability.appendObservabilityRecord({
      tenant: input.tenant,
      recordedAt: this.deps.time.isoNow(),
      distributionId: input.distributionId,
      outcome: 'denied',
      decidedAt,
      reason,
    });
    return { status: 'denied', reason };
  }

  // -- cancellation (rides the jobs authority; no transport) ----------------

  async cancel(raw: unknown): Promise<JobHandle | null> {
    const { tenant, distributionId } = validateLookupInput(raw);
    const plan = this.deps.store.getPlan({ tenant, distributionId });
    if (plan === null) throw new DistributionCallerError([{ path: 'distributionId', rule: 'not-found-for-tenant' }]);
    const queued = this.deps.store
      .listEvents({ tenant, distributionId })
      .find((e) => e.kind === 'queued' && e.jobId !== undefined);
    if (queued === undefined || queued.jobId === undefined) return null;
    const handle = await this.deps.jobs.cancelJob({ tenant, jobId: queued.jobId });
    if (handle !== null && handle.state === 'cancelled') {
      this.appendEvent(tenant, distributionId, 'cancelled');
    }
    return handle;
  }

  // -- durable job handler (invoked by the jobs authority runtime) -----------

  createPublishJobHandler(): PublishJobHandler {
    return async (job) => {
      const { tenant, payload } = job.declaration;
      const succeededKeys = new Set(
        this.deps.store
          .listEvents({ tenant, distributionId: payload.distributionId })
          .filter((e) => e.kind === 'publish-succeeded' && e.targetKey !== undefined)
          .map((e) => e.targetKey),
      );
      let firstFailure: TypedJobFailure | undefined;
      for (const target of payload.targets) {
        const key = targetKeyOf(target);
        if (succeededKeys.has(key)) continue; // durable retry: re-attempt only failures
        try {
          const result = await this.deps.authority.publish({
            tenant,
            target,
            artifactRefs: payload.artifactRefs,
            distributionId: payload.distributionId,
          });
          // Verify the platform-said observation is resolvable + source-attributed
          // (read-only). The payload itself is NEVER stored (AC7).
          const observations = await this.deps.authority.readObservations({ tenant, observationIds: [result.observationId] });
          if (observations.length === 0) {
            throw new AuthorityFailureSignal('provider_rejected', `observation ${result.observationId} not resolvable`);
          }
          this.appendEvent(tenant, payload.distributionId, 'publish-succeeded', {
            targetKey: key,
            observationRefs: [{
              observationId: result.observationId,
              authorityModule: '@mos/distribution',
              providerId: result.providerId,
              recordedAt: result.recordedAt,
            }],
          });
        } catch (err) {
          const failure = classifyAuthorityFailure(err);
          this.appendEvent(tenant, payload.distributionId, 'publish-failed', { targetKey: key, failure });
          if (firstFailure === undefined) firstFailure = failure;
        }
      }
      if (firstFailure !== undefined) return { ok: false, failure: firstFailure };
      return { ok: true };
    };
  }

  // -- internals --------------------------------------------------------------

  private appendEvent(
    tenant: TenantId,
    distributionId: string,
    kind: DistributionEventKind,
    extra: {
      reason?: string;
      failure?: TypedJobFailure;
      observationRefs?: readonly ObservationRef[];
      targetKey?: string;
      jobId?: string;
    } = {},
  ): void {
    const event: DistributionEvent = {
      eventId: this.deps.store.newEventId(),
      tenant,
      distributionId,
      kind,
      recordedAt: this.deps.time.isoNow(),
      ...(extra.reason !== undefined ? { reason: extra.reason } : {}),
      ...(extra.failure !== undefined ? { failure: extra.failure } : {}),
      ...(extra.observationRefs !== undefined ? { observationRefs: extra.observationRefs } : {}),
      ...(extra.targetKey !== undefined ? { targetKey: extra.targetKey } : {}),
      ...(extra.jobId !== undefined ? { jobId: extra.jobId } : {}),
    };
    this.deps.store.appendEvent(event);
  }

  private async currentJobHandle(plan: DistributionPlan): Promise<JobHandle | null> {
    const queued = this.deps.store
      .listEvents({ tenant: plan.tenant, distributionId: plan.distributionId })
      .find((e) => e.kind === 'queued' && e.jobId !== undefined);
    if (queued === undefined || queued.jobId === undefined) return null;
    return this.deps.jobs.getJob({ tenant: plan.tenant, jobId: queued.jobId });
  }
}

function collectObservationRefs(events: readonly DistributionEvent[]): readonly ObservationRef[] {
  const byId = new Map<string, ObservationRef>();
  for (const event of events) {
    for (const ref of event.observationRefs ?? []) {
      if (!byId.has(ref.observationId)) byId.set(ref.observationId, ref);
    }
  }
  return deepFreeze([...byId.values()]);
}
