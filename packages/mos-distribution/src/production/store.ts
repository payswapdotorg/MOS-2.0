/**
 * PROD-001 append-only, tenant-scoped, immutable record store (AC8).
 *
 * - Records are deep-frozen on append; mutation of any returned graph throws.
 * - All lookups are keyed by (tenant, id): cross-tenant reads return null /
 *   empty; cross-tenant aliasing of ids or client job keys is impossible.
 * - There is NO update or delete API: the stream is append-only by construction.
 */

import { deepFreeze } from './contracts.js';
import type { DistributionEvent, DistributionPlan, TenantId } from './contracts.js';

const EVENT_KINDS: ReadonlySet<string> = new Set<string>([
  'requested', 'denied', 'queued', 'publish-succeeded', 'publish-failed',
  'retraction-denied', 'retracted', 'cancelled',
]);

export class DistributionRecordStore {
  private seq = 0;
  private readonly events: DistributionEvent[] = [];
  private readonly plans: DistributionPlan[] = [];
  private readonly planById = new Map<string, DistributionPlan>();
  private readonly planByJobKey = new Map<string, DistributionPlan>();
  private readonly eventIds = new Set<string>();

  newDistributionId(): string {
    return `dist-${(++this.seq).toString(36)}`;
  }

  newEventId(): string {
    return `evt-${(++this.seq).toString(36)}`;
  }

  recordPlan(plan: DistributionPlan): DistributionPlan {
    if (typeof plan.tenant !== 'string' || plan.tenant.length === 0) throw new Error('store: plan.tenant required');
    if (typeof plan.distributionId !== 'string' || plan.distributionId.length === 0) throw new Error('store: plan.distributionId required');
    if (this.planById.has(`${plan.tenant}\u0000${plan.distributionId}`)) {
      throw new Error(`store: duplicate distributionId ${plan.distributionId} (append-only: no overwrite)`);
    }
    const frozen = deepFreeze(plan);
    this.plans.push(frozen);
    this.planById.set(`${plan.tenant}\u0000${plan.distributionId}`, frozen);
    this.planByJobKey.set(`${plan.tenant}\u0000${plan.request.clientJobKey}`, frozen);
    return frozen;
  }

  appendEvent(event: DistributionEvent): DistributionEvent {
    if (typeof event.eventId !== 'string' || event.eventId.length === 0) throw new Error('store: event.eventId required');
    if (this.eventIds.has(event.eventId)) throw new Error(`store: duplicate eventId ${event.eventId}`);
    if (typeof event.tenant !== 'string' || event.tenant.length === 0) throw new Error('store: event.tenant required');
    if (typeof event.distributionId !== 'string' || event.distributionId.length === 0) throw new Error('store: event.distributionId required');
    if (!EVENT_KINDS.has(event.kind)) throw new Error(`store: unknown event kind ${String(event.kind)}`);
    const frozen = deepFreeze(event);
    this.eventIds.add(frozen.eventId);
    this.events.push(frozen);
    return frozen;
  }

  getPlan(query: { tenant: TenantId; distributionId: string }): DistributionPlan | null {
    return this.planById.get(`${query.tenant}\u0000${query.distributionId}`) ?? null;
  }

  findPlanByJobKey(query: { tenant: TenantId; clientJobKey: string }): DistributionPlan | null {
    return this.planByJobKey.get(`${query.tenant}\u0000${query.clientJobKey}`) ?? null;
  }

  listPlans(query: { tenant: TenantId }): readonly DistributionPlan[] {
    return deepFreeze(this.plans.filter((p) => p.tenant === query.tenant));
  }

  listEvents(query: { tenant: TenantId; distributionId?: string }): readonly DistributionEvent[] {
    return deepFreeze(this.events.filter(
      (e) => e.tenant === query.tenant && (query.distributionId === undefined || e.distributionId === query.distributionId),
    ));
  }
}
