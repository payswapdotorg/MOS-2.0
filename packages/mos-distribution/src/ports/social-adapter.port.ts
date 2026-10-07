/**
 * SocialAdapterPort (SOCIAL-001) — THE provider-neutral social surface:
 * the declared contract of what a social platform interaction can be.
 *
 * Five operations, each typed with input contracts carrying CONTENT
 * ARTIFACT REFS (never inline media bytes in the control plane) and
 * output records carrying PLATFORM REFS + observed posture:
 * - `publish` — publish one content artifact ref with a declared
 *   presentation;
 * - `schedule` — publish + time (a platform-confirmed future publication);
 * - `readObservations` — read platform-reported metrics as AUTHORITATIVE
 *   what-the-platform-said {@link SocialObservationRecord}s (never
 *   invented, never turned into causal claims — ATTRIB-001 is later);
 * - `delete` — retract one platform post (platform-confirmed);
 * - `listRestrictions` — read the platform's observed restrictions.
 *
 * RIGHTS/POLICY GATES PRECEDE EVERY PROVIDER CALL (backlog acceptance,
 * test-pinned): every input carries a {@link RightsContextRef}; the
 * runtime evaluates rights via the REAL injected `evaluateRights`
 * (@mos/rights — denial reasons verbatim) and policy via the declared
 * {@link SocialPolicyGatePort} seam BEFORE consulting the capability
 * matrix and BEFORE any transport invocation. The capability matrix is
 * the distribution authority's own operation gate: undeclared → typed
 * refusal; declared unsupported → typed refusal; declared unknown → its
 * own preserved outcome (parity is never assumed).
 *
 * Every attributable attempt appends an immutable §30 record
 * ({@link SocialDistributionRecord}) to the tenant-scoped audit log;
 * there is no unrecorded path past channel resolution.
 */

import type { TenantId } from "@mos/contracts";

import type {
  DeleteSocialPostInput,
  ListSocialRestrictionsInput,
  PublishSocialPostInput,
  ReadSocialObservationsInput,
  ScheduleSocialPostInput,
} from "../contracts/social-operation.js";
import type {
  SocialAdapterOutcome,
  SocialDistributionRecord,
  SocialDistributionRecordFilter,
} from "../contracts/distribution-record.js";
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
import type {
  SocialRateLimitObservationFilter,
  SocialRateLimitObservationRecord,
} from "../contracts/social-rate-limit.js";
import type { SocialDistributionId } from "../contracts/ids.js";

/**
 * The social adapter call surface. 11 public methods (policy budget: 12):
 * the five operations + six tenant-scoped append-only log reads
 * (publications, observations, restriction observations, rate-limit
 * observations, the §30 audit log, and one §30 record by id). The
 * schedule/retraction logs have no dedicated read method yet — those
 * operations' outputs + the §30 audit log cover this wave's evidence, and
 * the surface grows with later SOCIAL items within the budget.
 */
export interface SocialAdapterPort {
  /** Publishes one artifact ref with a declared presentation. */
  publish(request: PublishSocialPostInput): SocialAdapterOutcome<SocialPublicationRecord>;

  /** Schedules one artifact publication for a declared time. */
  schedule(request: ScheduleSocialPostInput): SocialAdapterOutcome<SocialScheduleRecord>;

  /**
   * Reads platform-reported observations for one subject (or the channel
   * account) and records them as what-the-platform-said records.
   */
  readObservations(
    request: ReadSocialObservationsInput,
  ): SocialAdapterOutcome<readonly SocialObservationRecord[]>;

  /** Retracts one platform post (platform-confirmed). */
  delete(request: DeleteSocialPostInput): SocialAdapterOutcome<SocialRetractionRecord>;

  /** Reads the platform's observed restrictions (recorded with source attribution). */
  listRestrictions(
    request: ListSocialRestrictionsInput,
  ): SocialAdapterOutcome<readonly SocialRestrictionRecord[]>;

  /**
   * Reads the tenant-scoped append-only log of transport-observed
   * RATE-LIMIT postures (SOCIAL-002..006): what the transport observed,
   * verbatim, with observedAt + provider refs + the honest source label —
   * never invented numbers, and DECLAREDLY simulated postures stay
   * self-labeled.
   */
  listRateLimitObservations(
    tenantId: TenantId,
    filter?: SocialRateLimitObservationFilter,
  ): readonly SocialRateLimitObservationRecord[];

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

  /** One §30 record by id, or `undefined` when unknown in this tenant. */
  getDistributionRecord(
    tenantId: TenantId,
    distributionId: SocialDistributionId,
  ): SocialDistributionRecord | undefined;
}
