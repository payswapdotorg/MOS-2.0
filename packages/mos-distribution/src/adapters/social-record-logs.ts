/**
 * Social record log store (SOCIAL-001) — the tenant-scoped append-only
 * logs of the adapter runtime.
 *
 * Six immutable logs (publications, schedules, retractions, observations,
 * restrictions, and the §30 distribution audit log), each keyed per
 * tenant and append-only: records are pushed in record order and read
 * back with tenant-scoped filters (cross-tenant reads see nothing — §31
 * no existence leaks; foreign tenant ≡ unknown). There is no mutation or
 * removal surface anywhere — a retraction APPENDS a record, it never
 * edits the publication log (append-only corrections).
 *
 * DISCLOSED LIMIT: ephemeral process-local logs (no durability claim);
 * durable persistence is TL-owned later work behind the same shape.
 *
 * Internal machinery (not exported from the package index — the adapter
 * port is the public surface).
 */

import type { TenantId } from "@mos/contracts";

import type {
  SocialDistributionRecord,
  SocialDistributionRecordFilter,
} from "../contracts/distribution-record.js";
import type { SocialDistributionId } from "../contracts/ids.js";
import type {
  SocialObservationFilter,
  SocialObservationRecord,
  SocialPublicationFilter,
  SocialPublicationRecord,
  SocialRestrictionFilter,
  SocialRestrictionRecord,
  SocialRetractionRecord,
  SocialScheduleRecord,
} from "../contracts/social-record.js";

/** The append-only log store of the adapter runtime. Internal helper. */
export interface SocialRecordLogStore {
  appendPublication(record: SocialPublicationRecord): void;
  appendSchedule(record: SocialScheduleRecord): void;
  appendRetraction(record: SocialRetractionRecord): void;
  appendObservation(record: SocialObservationRecord): void;
  appendRestriction(record: SocialRestrictionRecord): void;
  /** Appends one immutable §30 distribution record (every attributable attempt). */
  appendDistributionRecord(record: SocialDistributionRecord): void;

  /** The tenant-scoped append-only publication log (ascending record order). */
  listPublications(tenantId: TenantId, filter?: SocialPublicationFilter): readonly SocialPublicationRecord[];
  /** The tenant-scoped append-only observation log (ascending record order). */
  listObservations(tenantId: TenantId, filter?: SocialObservationFilter): readonly SocialObservationRecord[];
  /** The tenant-scoped append-only restriction-observation log (ascending record order). */
  listRestrictionRecords(
    tenantId: TenantId,
    filter?: SocialRestrictionFilter,
  ): readonly SocialRestrictionRecord[];
  /** The tenant-scoped append-only §30 audit log (ascending time order, then id). */
  listDistributionRecords(
    tenantId: TenantId,
    filter?: SocialDistributionRecordFilter,
  ): readonly SocialDistributionRecord[];
  /** One §30 record by id, or `undefined` when unknown IN THIS TENANT. */
  getDistributionRecord(
    tenantId: TenantId,
    distributionId: SocialDistributionId,
  ): SocialDistributionRecord | undefined;
}

interface TenantScoped {
  readonly scope: { readonly tenantId: TenantId };
}

function applyLimit<T>(records: readonly T[], limit?: number): readonly T[] {
  if (limit !== undefined && Number.isInteger(limit) && limit >= 0) {
    return records.slice(0, limit);
  }
  return records;
}

/**
 * Creates the in-memory {@link SocialRecordLogStore} — plain per-tenant
 * arrays in insertion (record) order; every stored record is expected to
 * be deep-frozen by its producer (the pipeline freezes what it builds).
 */
export function createSocialRecordLogStore(): SocialRecordLogStore {
  /** tenantKey → append-only log (insertion = record order). */
  const publications = new Map<string, SocialPublicationRecord[]>();
  const schedules = new Map<string, SocialScheduleRecord[]>();
  const retractions = new Map<string, SocialRetractionRecord[]>();
  const observations = new Map<string, SocialObservationRecord[]>();
  const restrictions = new Map<string, SocialRestrictionRecord[]>();
  const auditLog = new Map<string, SocialDistributionRecord[]>();

  function append<T extends TenantScoped>(log: Map<string, T[]>, record: T): void {
    const key = record.scope.tenantId as string;
    const entries = log.get(key) ?? [];
    entries.push(record);
    log.set(key, entries);
  }

  return {
    appendPublication: (record) => append(publications, record),
    appendSchedule: (record) => append(schedules, record),
    appendRetraction: (record) => append(retractions, record),
    appendObservation: (record) => append(observations, record),
    appendRestriction: (record) => append(restrictions, record),
    appendDistributionRecord: (record) => append(auditLog, record),

    listPublications(tenantId, filter = {}) {
      const log = publications.get(tenantId as string) ?? [];
      const out = log.filter(
        (record) =>
          (filter.channelRef === undefined || (record.channelRef as string) === (filter.channelRef as string)) &&
          (filter.artifactId === undefined || (record.artifact.artifactId as string) === filter.artifactId),
      );
      return applyLimit(out, filter.limit);
    },

    listObservations(tenantId, filter = {}) {
      const log = observations.get(tenantId as string) ?? [];
      const out = log.filter(
        (record) =>
          (filter.channelRef === undefined || (record.channelRef as string) === (filter.channelRef as string)) &&
          (filter.subjectRef === undefined || record.subjectRef === filter.subjectRef),
      );
      return applyLimit(out, filter.limit);
    },

    listRestrictionRecords(tenantId, filter = {}) {
      const log = restrictions.get(tenantId as string) ?? [];
      const out = log.filter(
        (record) => filter.channelRef === undefined || (record.channelRef as string) === (filter.channelRef as string),
      );
      return applyLimit(out, filter.limit);
    },

    listDistributionRecords(tenantId, filter = {}) {
      const log = auditLog.get(tenantId as string) ?? [];
      const out = log.filter(
        (record) =>
          (filter.channelRef === undefined || (record.channelRef as string) === (filter.channelRef as string)) &&
          (filter.operation === undefined || record.operation === filter.operation) &&
          (filter.actor === undefined || (record.actor as string) === (filter.actor as string)) &&
          (filter.failureCode === undefined || record.failure?.code === filter.failureCode),
      );
      return applyLimit(out, filter.limit);
    },

    getDistributionRecord(tenantId, distributionId) {
      return (auditLog.get(tenantId as string) ?? []).find(
        (record) => (record.id as string) === (distributionId as string),
      );
    },
  };
}
