/**
 * Platform-response typing (SOCIAL-001) — parsing the transport seam's
 * platform-said payloads into typed output records.
 *
 * NEVER INVENT: every parse is fail-closed — a response missing the
 * platform refs/timestamps an operation's record requires is a typed
 * `invalid-platform-response` failure; the runtime never mints a post
 * ref, never fabricates a metric, never defaults a timestamp. Absent
 * observation/restriction LISTS are the one honest default: "the
 * platform said nothing" (an empty list), which is recorded as zero
 * records, not invented ones.
 *
 * Internal helpers (not exported from the package index — the call
 * surface is the public contract).
 */

import type { JsonObject, ProviderId, TenantScope } from "@mos/contracts";
import type { ArtifactRef } from "@mos/content";

import type { SocialDistributionFailure } from "../contracts/distribution-record.js";
import type {
  PlatformPostRef,
  SocialChannelId,
  SocialObservationId,
  SocialPublicationId,
  SocialRateLimitObservationId,
  SocialRetractionId,
  SocialRestrictionId,
  SocialScheduleId,
} from "../contracts/ids.js";
import type {
  DeclaredSocialPresentation,
  SocialOperation,
} from "../contracts/social-operation.js";
import { SOCIAL_RATE_LIMIT_POSTURES } from "../contracts/social-rate-limit.js";
import type {
  SocialRateLimitObservationRecord,
  SocialRateLimitPosture,
} from "../contracts/social-rate-limit.js";
import type {
  SocialObservationRecord,
  SocialPublicationRecord,
  SocialRestrictionRecord,
  SocialRetractionRecord,
  SocialScheduleRecord,
} from "../contracts/social-record.js";

/** Either a typed value or the typed invalid-platform-response failure. */
export type PlatformParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: SocialDistributionFailure };

function untypable(message: string, details: Record<string, unknown>): SocialDistributionFailure {
  return {
    code: "invalid-platform-response",
    message,
    retriable: false,
    details,
  };
}

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

/** Type guard: a non-blank string. */
function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/** Context shared by every platform-record builder. */
export interface PlatformRecordContext {
  readonly scope: TenantScope;
  readonly channelRef: SocialChannelId;
  readonly providerId: ProviderId;
  readonly source: string;
  /** When MOS records the output (§30-observable recordedAt). */
  readonly recordedAt: string;
}

// ---------------------------------------------------------------------------
// publish / schedule / delete
// ---------------------------------------------------------------------------

/** Parses the platform-said payload of one `publish` into a publication record. */
export function parsePublication(
  output: JsonObject,
  context: PlatformRecordContext,
  artifact: ArtifactRef,
  presentation: DeclaredSocialPresentation,
  mintId: () => SocialPublicationId,
): PlatformParseResult<SocialPublicationRecord> {
  const postRef = (output as { postRef?: unknown }).postRef;
  const publishedAt = (output as { publishedAt?: unknown }).publishedAt;
  if (!isNonBlankString(postRef)) {
    return { ok: false, failure: untypable("platform response carries no postRef — a post reference is never invented", { operation: "publish" satisfies SocialOperation }) };
  }
  if (!isIso(publishedAt)) {
    return { ok: false, failure: untypable("platform response carries no publishedAt timestamp — never invented", { operation: "publish" satisfies SocialOperation }) };
  }
  return {
    ok: true,
    value: Object.freeze({
      id: mintId(),
      scope: context.scope,
      channelRef: context.channelRef,
      providerId: context.providerId,
      artifact,
      presentation,
      postRef: postRef as PlatformPostRef,
      publishedAt: publishedAt as SocialPublicationRecord["publishedAt"],
      recordedAt: context.recordedAt as SocialPublicationRecord["recordedAt"],
      source: context.source,
    }),
  };
}

/** Parses the platform-said payload of one `schedule` into a schedule record. */
export function parseSchedule(
  output: JsonObject,
  context: PlatformRecordContext,
  artifact: ArtifactRef,
  presentation: DeclaredSocialPresentation,
  requestedAt: string,
  mintId: () => SocialScheduleId,
): PlatformParseResult<SocialScheduleRecord> {
  const scheduleRef = (output as { scheduleRef?: unknown }).scheduleRef;
  const scheduledAt = (output as { scheduledAt?: unknown }).scheduledAt;
  if (!isNonBlankString(scheduleRef)) {
    return { ok: false, failure: untypable("platform response carries no scheduleRef — never invented", { operation: "schedule" satisfies SocialOperation }) };
  }
  if (!isIso(scheduledAt)) {
    return { ok: false, failure: untypable("platform response carries no platform-confirmed scheduledAt — never invented", { operation: "schedule" satisfies SocialOperation }) };
  }
  return {
    ok: true,
    value: Object.freeze({
      id: mintId(),
      scope: context.scope,
      channelRef: context.channelRef,
      providerId: context.providerId,
      artifact,
      presentation,
      requestedAt: requestedAt as SocialScheduleRecord["requestedAt"],
      scheduledAt: scheduledAt as SocialScheduleRecord["scheduledAt"],
      scheduleRef,
      recordedAt: context.recordedAt as SocialScheduleRecord["recordedAt"],
      source: context.source,
    }),
  };
}

/** Parses the platform-said payload of one `delete` into a retraction record. */
export function parseRetraction(
  output: JsonObject,
  context: PlatformRecordContext,
  postRef: PlatformPostRef,
  mintId: () => SocialRetractionId,
): PlatformParseResult<SocialRetractionRecord> {
  const retractedAt = (output as { retractedAt?: unknown }).retractedAt;
  if (!isIso(retractedAt)) {
    return { ok: false, failure: untypable("platform response carries no retractedAt timestamp — never invented", { operation: "delete" satisfies SocialOperation }) };
  }
  return {
    ok: true,
    value: Object.freeze({
      id: mintId(),
      scope: context.scope,
      channelRef: context.channelRef,
      providerId: context.providerId,
      postRef,
      retractedAt: retractedAt as SocialRetractionRecord["retractedAt"],
      recordedAt: context.recordedAt as SocialRetractionRecord["recordedAt"],
      source: context.source,
    }),
  };
}

/**
 * Parses the transport-observed RATE-LIMIT posture of one ok response into
 * a rate-limit observation record (SOCIAL-002..006). Absent `rateLimit` =
 * the transport reported no posture → no record (never invented). A
 * PRESENT-but-malformed posture object is reported as `malformed` — the
 * caller surfaces a WARNING (an untypable auxiliary posture can neither
 * fail a completed platform interaction nor be silently dropped).
 *
 * The posture's payload is VERBATIM data the transport reported — the
 * disclosed doubles DECLAREDLY simulate postures and self-label, so
 * simulated numbers can never masquerade as live platform evidence.
 */
export function parseRateLimitObservation(
  output: JsonObject,
  context: PlatformRecordContext,
  operation: SocialOperation,
  mintId: () => SocialRateLimitObservationId,
):
  | { readonly kind: "absent" }
  | { readonly kind: "record"; readonly record: SocialRateLimitObservationRecord }
  | { readonly kind: "malformed"; readonly reason: string } {
  const entry = (output as { rateLimit?: unknown }).rateLimit;
  if (entry === undefined) {
    return { kind: "absent" };
  }
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return { kind: "malformed", reason: "rateLimit is not an object" };
  }
  const posture = (entry as { posture?: unknown }).posture;
  const observed = (entry as { observed?: unknown }).observed;
  const observedAt = (entry as { observedAt?: unknown }).observedAt;
  const providerRefs = (entry as { providerRefs?: unknown }).providerRefs;
  if (typeof posture !== "string" || !SOCIAL_RATE_LIMIT_POSTURES.includes(posture as SocialRateLimitPosture)) {
    return { kind: "malformed", reason: "rateLimit carries no posture in the closed vocabulary" };
  }
  if (typeof observed !== "object" || observed === null || Array.isArray(observed)) {
    return { kind: "malformed", reason: "rateLimit carries no observed payload object" };
  }
  if (!isIso(observedAt)) {
    return { kind: "malformed", reason: "rateLimit carries no observedAt timestamp" };
  }
  if (providerRefs !== undefined && (!Array.isArray(providerRefs) || providerRefs.some((ref) => isBlank(ref)))) {
    return { kind: "malformed", reason: "rateLimit providerRefs is not an array of strings" };
  }
  return {
    kind: "record",
    record: Object.freeze({
      id: mintId(),
      scope: context.scope,
      channelRef: context.channelRef,
      providerId: context.providerId,
      operation,
      posture: posture as SocialRateLimitPosture,
      observed: observed as JsonObject,
      observedAt: observedAt as SocialRateLimitObservationRecord["observedAt"],
      providerRefs: Object.freeze([...((providerRefs as string[] | undefined) ?? [])]) as readonly string[],
      recordedAt: context.recordedAt as SocialRateLimitObservationRecord["recordedAt"],
      source: context.source,
    }),
  };
}

// ---------------------------------------------------------------------------
// read-observations / list-restrictions
// ---------------------------------------------------------------------------

/**
 * Parses the platform-said payload of `read-observations` into observation
 * records. Absent `observations` = the platform said nothing → ZERO
 * records (never invented). Each entry must carry its subject, its
 * verbatim `reported` payload, its platform `observedAt` and its
 * platform refs — a malformed entry fails the whole invocation
 * (fail-closed: platform data is never silently dropped or adjusted).
 */
export function parseObservations(
  output: JsonObject,
  context: PlatformRecordContext,
  mintId: () => SocialObservationId,
): PlatformParseResult<readonly SocialObservationRecord[]> {
  const entries = (output as { observations?: unknown }).observations;
  if (entries === undefined) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(entries)) {
    return { ok: false, failure: untypable("platform response observations is not an array", { operation: "read-observations" satisfies SocialOperation }) };
  }
  const records: SocialObservationRecord[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { ok: false, failure: untypable("platform observation entry is not an object", { operation: "read-observations" satisfies SocialOperation }) };
    }
    const subjectRef = (entry as { subjectRef?: unknown }).subjectRef;
    const reported = (entry as { reported?: unknown }).reported;
    const observedAt = (entry as { observedAt?: unknown }).observedAt;
    const providerRefs = (entry as { providerRefs?: unknown }).providerRefs;
    if (isBlank(subjectRef)) {
      return { ok: false, failure: untypable("platform observation entry carries no subjectRef", { operation: "read-observations" satisfies SocialOperation }) };
    }
    if (typeof reported !== "object" || reported === null || Array.isArray(reported)) {
      return { ok: false, failure: untypable("platform observation entry carries no reported payload object", { operation: "read-observations" satisfies SocialOperation }) };
    }
    if (!isIso(observedAt)) {
      return { ok: false, failure: untypable("platform observation entry carries no observedAt timestamp", { operation: "read-observations" satisfies SocialOperation }) };
    }
    if (providerRefs !== undefined && (!Array.isArray(providerRefs) || providerRefs.some((ref) => isBlank(ref)))) {
      return { ok: false, failure: untypable("platform observation entry providerRefs is not an array of strings", { operation: "read-observations" satisfies SocialOperation }) };
    }
    // `reported` is the platform's payload VERBATIM — copied by
    // reference into the frozen record, never adjusted.
    records.push(
      Object.freeze({
        id: mintId(),
        scope: context.scope,
        channelRef: context.channelRef,
        providerId: context.providerId,
        subjectRef: subjectRef as string,
        reported: reported as JsonObject,
        observedAt: observedAt as SocialObservationRecord["observedAt"],
        recordedAt: context.recordedAt as SocialObservationRecord["recordedAt"],
        providerRefs: Object.freeze([...((providerRefs as string[] | undefined) ?? [])]) as readonly string[],
        source: context.source,
      }),
    );
  }
  return { ok: true, value: Object.freeze(records) };
}

/**
 * Parses the platform-said payload of `list-restrictions` into restriction
 * records. Absent `restrictions` = the platform said nothing → ZERO
 * records. Each entry must carry its platform `observedAt` and its
 * verbatim `description` — a malformed entry fails the whole invocation.
 */
export function parseRestrictions(
  output: JsonObject,
  context: PlatformRecordContext,
  mintId: () => SocialRestrictionId,
): PlatformParseResult<readonly SocialRestrictionRecord[]> {
  const entries = (output as { restrictions?: unknown }).restrictions;
  if (entries === undefined) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(entries)) {
    return { ok: false, failure: untypable("platform response restrictions is not an array", { operation: "list-restrictions" satisfies SocialOperation }) };
  }
  const records: SocialRestrictionRecord[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { ok: false, failure: untypable("platform restriction entry is not an object", { operation: "list-restrictions" satisfies SocialOperation }) };
    }
    const observedAt = (entry as { observedAt?: unknown }).observedAt;
    const description = (entry as { description?: unknown }).description;
    if (!isIso(observedAt)) {
      return { ok: false, failure: untypable("platform restriction entry carries no observedAt timestamp", { operation: "list-restrictions" satisfies SocialOperation }) };
    }
    if (isBlank(description)) {
      return { ok: false, failure: untypable("platform restriction entry carries no description", { operation: "list-restrictions" satisfies SocialOperation }) };
    }
    records.push(
      Object.freeze({
        id: mintId(),
        scope: context.scope,
        channelRef: context.channelRef,
        providerId: context.providerId,
        observedAt: observedAt as SocialRestrictionRecord["observedAt"],
        description: description as string,
        recordedAt: context.recordedAt as SocialRestrictionRecord["recordedAt"],
        source: context.source,
      }),
    );
  }
  return { ok: true, value: Object.freeze(records) };
}
