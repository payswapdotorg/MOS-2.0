/**
 * Social rate-limit OBSERVATION records (SOCIAL-002..006) — the §30-style
 * observed-posture vocabulary of the provider adapters.
 *
 * DISCIPLINE (the frozen backlog acceptance "replay/idempotency and
 * rate-limit observations are explicit" + the W7-C disclosure rule): a
 * rate-limit observation is WHAT THE TRANSPORT OBSERVED — recorded verbatim
 * with `observedAt` + provider refs + the honest source label. NEVER
 * INVENTED NUMBERS: MOS does not fabricate a platform's rate-limit posture;
 * the shipped provider transport bindings are DISCLOSED DOUBLES that may
 * DECLAREDLY simulate a posture for testing — and the simulated payload is
 * self-labeled through the record's `source` so it can never masquerade as
 * live platform evidence (AGENTS.md Verification).
 *
 * An observation is NOT a failure and NOT a rights/policy verdict: it is a
 * recorded posture. A platform actually refusing an over-limit request
 * arrives as a typed transport failure through the seam; the observation
 * record is the accompanying (or standalone) evidence layer.
 */

import type {
  JsonObject,
  ProviderId,
  TenantScope,
  Timestamp,
} from "@mos/contracts";

import type { SocialChannelId, SocialRateLimitObservationId } from "./ids.js";
import type { SocialOperation } from "./social-operation.js";

// ---------------------------------------------------------------------------
// The closed posture vocabulary (observed postures, never verdicts)
// ---------------------------------------------------------------------------

/**
 * The closed vocabulary of rate-limit POSTURES a transport can report
 * observing. Coarse and provider-neutral: where a platform reports richer
 * posture data, the specifics ride verbatim inside `observed`; the typed
 * `posture` stays this conservative vocabulary. A reported posture outside
 * the vocabulary is untypable — surfaced as a WARNING, never silently
 * dropped, never invented into a vocabulary member.
 */
export const SOCIAL_RATE_LIMIT_POSTURES = Object.freeze([
  "within-window",
  "near-limit",
  "limit-reached",
] as const);

/** One of the {@link SOCIAL_RATE_LIMIT_POSTURES} entries. */
export type SocialRateLimitPosture = (typeof SOCIAL_RATE_LIMIT_POSTURES)[number];

// ---------------------------------------------------------------------------
// The observation record
// ---------------------------------------------------------------------------

/**
 * One recorded rate-limit OBSERVATION: what the transport reported
 * observing about the provider's rate-limit posture around ONE social
 * operation attempt — `observedAt` (when the transport says the posture was
 * observed, platform-said) distinct from `recordedAt` (when MOS recorded
 * it), the observed payload VERBATIM, the provider's own references for
 * the observation, and the honest source label (the disclosed transport
 * double self-labels; live adapters label themselves).
 *
 * Tenant-scoped, append-only and immutable like every distribution log
 * record; structurally free of causal semantics (an observed posture is
 * never a claim that the posture caused anything — ATTRIB-001's later
 * domain).
 */
export interface SocialRateLimitObservationRecord {
  readonly id: SocialRateLimitObservationId;
  /** Tenant/workspace scope (§31). */
  readonly scope: TenantScope;
  /** The channel the observed operation went through. */
  readonly channelRef: SocialChannelId;
  /** §30 provider — the platform identity (data). */
  readonly providerId: ProviderId;
  /** Which social operation the posture was observed around. */
  readonly operation: SocialOperation;
  /** The observed posture (closed vocabulary — a posture, never a verdict). */
  readonly posture: SocialRateLimitPosture;
  /** The observed posture payload VERBATIM (what the transport observed — data). */
  readonly observed: JsonObject;
  /** When the transport says the posture was observed (platform-said timestamp). */
  readonly observedAt: Timestamp;
  /** The provider's own references for the reported posture (traceability, platform-said). */
  readonly providerRefs: readonly string[];
  /** When MOS recorded this observation (§30-observable). */
  readonly recordedAt: Timestamp;
  /** Honest transport source label (who observed the posture). */
  readonly source: string;
}

// ---------------------------------------------------------------------------
// Log filter
// ---------------------------------------------------------------------------

/** Filter for reading the rate-limit observation log (all fields optional). */
export interface SocialRateLimitObservationFilter {
  readonly channelRef?: SocialChannelId;
  /** Only observations around this operation. */
  readonly operation?: SocialOperation;
  readonly limit?: number;
}
