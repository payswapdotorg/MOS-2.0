/**
 * Platform-confirmed output records of the social operations (SOCIAL-001).
 *
 * Every record in this file is a WHAT-THE-PLATFORM-SAID record: the
 * platform refs, timestamps and payloads the PLATFORM reported through
 * the transport seam, recorded with source attribution and NEVER
 * invented, adjusted or inferred by MOS (§3 — social platforms are never
 * MOS authorities; MOS records what platforms report). Each record
 * carries the transport source label so a disclosed in-memory double can
 * never masquerade as live platform evidence.
 *
 * OBSERVATION PURITY (backlog SOCIAL-001 + ATTRIB-001 separation):
 * {@link SocialObservationRecord} and every other record here is
 * structurally free of causal/attribution semantics — there is no field
 * through which "this observation caused/attributed X" could even be
 * expressed. Transforming platform-said observations into causal claims
 * is ATTRIB-001's later domain and deliberately out of scope (test-pinned
 * by the exact-keyset pins + the exported-vocabulary scan).
 */

import type {
  JsonObject,
  ProviderId,
  TenantScope,
  Timestamp,
} from "@mos/contracts";
import type { ArtifactRef } from "@mos/content";

import type {
  PlatformPostRef,
  SocialChannelId,
  SocialObservationId,
  SocialPublicationId,
  SocialRetractionId,
  SocialRestrictionId,
  SocialScheduleId,
} from "./ids.js";
import type { DeclaredSocialPresentation } from "./social-operation.js";

// ---------------------------------------------------------------------------
// Publication / schedule / retraction (publishing operations)
// ---------------------------------------------------------------------------

/**
 * One recorded platform-confirmed PUBLICATION: the platform's post
 * reference, its published-at timestamp and the artifact/presentation
 * echoes — what the platform said happened, appended immutably to the
 * tenant's publication log.
 */
export interface SocialPublicationRecord {
  readonly id: SocialPublicationId;
  /** Tenant/workspace scope (§31). */
  readonly scope: TenantScope;
  /** The channel the publication went through. */
  readonly channelRef: SocialChannelId;
  /** §30 provider — the platform identity (data). */
  readonly providerId: ProviderId;
  /** The artifact that was published (echo of the input ref — references only). */
  readonly artifact: ArtifactRef;
  /** The declared presentation (echo). */
  readonly presentation: DeclaredSocialPresentation;
  /** The platform's own post reference — WHAT THE PLATFORM RETURNED (data, never minted by MOS). */
  readonly postRef: PlatformPostRef;
  /** When the platform says the post was published (platform-reported timestamp). */
  readonly publishedAt: Timestamp;
  /** When MOS recorded this publication (§30-observable). */
  readonly recordedAt: Timestamp;
  /** Honest transport source label (who reported this). */
  readonly source: string;
}

/**
 * One recorded platform-confirmed SCHEDULE: the platform's schedule
 * reference, the platform-confirmed go-live timestamp and the requested
 * echo. Scheduling is a DECLARED future publication — the platform
 * confirmed it will publish; MOS records the confirmation (a later wave
 * owns executing schedules through the durable-jobs authority).
 */
export interface SocialScheduleRecord {
  readonly id: SocialScheduleId;
  /** Tenant/workspace scope (§31). */
  readonly scope: TenantScope;
  /** The channel the schedule was placed through. */
  readonly channelRef: SocialChannelId;
  /** §30 provider — the platform identity (data). */
  readonly providerId: ProviderId;
  /** The artifact the schedule will publish (echo of the input ref). */
  readonly artifact: ArtifactRef;
  /** The declared presentation (echo). */
  readonly presentation: DeclaredSocialPresentation;
  /** The go-live time the CALLER requested (echo). */
  readonly requestedAt: Timestamp;
  /** The go-live time the PLATFORM confirmed (platform-said; may differ). */
  readonly scheduledAt: Timestamp;
  /** The platform's own schedule reference — WHAT THE PLATFORM RETURNED (data). */
  readonly scheduleRef: string;
  /** When MOS recorded this schedule (§30-observable). */
  readonly recordedAt: Timestamp;
  /** Honest transport source label (who reported this). */
  readonly source: string;
}

/**
 * One recorded platform-confirmed RETRACTION (the `delete` operation): the
 * platform confirmed the post is gone. Appended immutably — retractions
 * never mutate the publication record (append-only corrections; the
 * publication log keeps naming what the platform SAID happened).
 */
export interface SocialRetractionRecord {
  readonly id: SocialRetractionId;
  /** Tenant/workspace scope (§31). */
  readonly scope: TenantScope;
  /** The channel the retraction went through. */
  readonly channelRef: SocialChannelId;
  /** §30 provider — the platform identity (data). */
  readonly providerId: ProviderId;
  /** The platform post that was retracted (echo of the input ref). */
  readonly postRef: PlatformPostRef;
  /** When the platform says the post was retracted (platform-reported timestamp). */
  readonly retractedAt: Timestamp;
  /** When MOS recorded this retraction (§30-observable). */
  readonly recordedAt: Timestamp;
  /** Honest transport source label (who reported this). */
  readonly source: string;
}

// ---------------------------------------------------------------------------
// Observations (read-observations) — WHAT THE PLATFORM SAID, never invented
// ---------------------------------------------------------------------------

/**
 * One platform-reported OBSERVATION — an AUTHORITATIVE
 * what-the-platform-said record (SOCIAL-001): the metrics the platform
 * reported for one subject, verbatim, with source attribution.
 *
 * - `reported` is the platform's own payload VERBATIM (a small JSON
 *   object of metric values) — MOS never invents, adjusts, rounds or
 *   infers a single number;
 * - `observedAt` is the timestamp the PLATFORM says the measurement
 *   covers/ends at (platform-said), while `recordedAt` is when MOS
 *   recorded it — distinct by construction;
 * - `providerRefs` carries the platform's own references for the reported
 *   data (e.g. its insight/report ids) so every number is traceable to
 *   WHAT THE PLATFORM SAID;
 * - `source` names the transport that reported it (the disclosed double
 *   self-labels; live adapters label themselves).
 *
 * STRUCTURALLY PURE: there is no causal/attribution field — converting
 * observations into causal claims is ATTRIB-001's later domain. The
 * record is §30-observable, tenant-scoped and append-only (observations
 * accumulate; there is no mutation API).
 */
export interface SocialObservationRecord {
  readonly id: SocialObservationId;
  /** Tenant/workspace scope (§31). */
  readonly scope: TenantScope;
  /** The channel the observation was read through. */
  readonly channelRef: SocialChannelId;
  /** §30 provider — the platform identity (data). */
  readonly providerId: ProviderId;
  /** WHAT the observation is about: the platform post/account subject it reports on. */
  readonly subjectRef: string;
  /** The metrics THE PLATFORM REPORTED — verbatim payload, never invented. */
  readonly reported: JsonObject;
  /** When the platform says the data was observed (platform-reported timestamp). */
  readonly observedAt: Timestamp;
  /** When MOS recorded this observation (§30-observable). */
  readonly recordedAt: Timestamp;
  /** The platform's own references for the reported data (traceability, platform-said). */
  readonly providerRefs: readonly string[];
  /** Honest transport source label (who reported the numbers). */
  readonly source: string;
}

// ---------------------------------------------------------------------------
// Restrictions (list-restrictions) — observed platform restrictions
// ---------------------------------------------------------------------------

/**
 * One platform-reported RESTRICTION observation — the canonical
 * `RestrictionObservation` (observedAt + description, CORE-001) extended
 * with §30 source attribution: what the platform says it restricts on
 * this channel. An OBSERVATION, never a rights grant (canonical
 * docblock: "an observation, never a rights grant") and never a health
 * inference (HEALTH-001's later domain keeps observable-only health
 * separate).
 */
export interface SocialRestrictionRecord {
  readonly id: SocialRestrictionId;
  /** Tenant/workspace scope (§31). */
  readonly scope: TenantScope;
  /** The channel the restriction was observed through. */
  readonly channelRef: SocialChannelId;
  /** §30 provider — the platform identity (data). */
  readonly providerId: ProviderId;
  /** When the platform says the restriction was observed (platform-reported timestamp). */
  readonly observedAt: Timestamp;
  /** What the platform says the restriction is (verbatim description, data). */
  readonly description: string;
  /** When MOS recorded this restriction (§30-observable). */
  readonly recordedAt: Timestamp;
  /** Honest transport source label (who reported this). */
  readonly source: string;
}

// ---------------------------------------------------------------------------
// Log filters (tenant-scoped append-only reads)
// ---------------------------------------------------------------------------

/** Filter for reading the publication log (all fields optional). */
export interface SocialPublicationFilter {
  readonly channelRef?: SocialChannelId;
  /** Only publications of this artifact id. */
  readonly artifactId?: string;
  readonly limit?: number;
}

/** Filter for reading the observation log (all fields optional). */
export interface SocialObservationFilter {
  readonly channelRef?: SocialChannelId;
  /** Only observations about this subject (post ref / account). */
  readonly subjectRef?: string;
  readonly limit?: number;
}

/** Filter for reading the restriction log (all fields optional). */
export interface SocialRestrictionFilter {
  readonly channelRef?: SocialChannelId;
  readonly limit?: number;
}
