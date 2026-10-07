/**
 * Locally-owned branded identifier types for the distribution module
 * (SOCIAL-001).
 *
 * The cross-authority vocabulary (TenantId, ProviderId, AccountRef,
 * IdentityRef, PolicyRef, RightsRef, ArtifactId/ArtifactRef, Version,
 * Timestamp, Milliseconds, ...) is imported from `@mos/contracts` — the
 * canonical CORE-001 authority — and the content publication surface
 * re-imports the artifact-reference types through `@mos/content` (the
 * CORE-004 re-export is the SAME type identity, per the documented W2-A
 * reconciliation). The integrations-owned {@link MerchantClientInstanceId}
 * and {@link RightsContextRef} are imported from `@mos/integrations`
 * (INTEG-001 — a registry-allowed dependency of distribution). The
 * identifiers below are DISTRIBUTION-OWNED record identities that have no
 * canonical form yet; when the core-contract vocabulary grows them, this
 * package reconciles by importing from there (the documented W2 pattern).
 *
 * All brands are compile-time only: at runtime every value is the plain
 * underlying string.
 */

import type { Branded } from "@mos/contracts";

// ---------------------------------------------------------------------------
// Record identifiers (registries and append-only logs)
// ---------------------------------------------------------------------------

/** Identifier of a {@link SocialChannel} registry record. */
export type SocialChannelId = Branded<string, "SocialChannelId">;
/** §30 request id of one recorded social distribution attempt. */
export type SocialDistributionId = Branded<string, "SocialDistributionId">;
/** Identifier of one recorded platform-confirmed publication. */
export type SocialPublicationId = Branded<string, "SocialPublicationId">;
/** Identifier of one recorded platform-confirmed schedule. */
export type SocialScheduleId = Branded<string, "SocialScheduleId">;
/** Identifier of one recorded platform-confirmed retraction (delete). */
export type SocialRetractionId = Branded<string, "SocialRetractionId">;
/** Identifier of one recorded platform-reported observation. */
export type SocialObservationId = Branded<string, "SocialObservationId">;
/** Identifier of one recorded platform-reported restriction observation. */
export type SocialRestrictionId = Branded<string, "SocialRestrictionId">;

// ---------------------------------------------------------------------------
// Platform data references (opaque — what the platform said, never resolved)
// ---------------------------------------------------------------------------

/**
 * Opaque reference to a post ON the social platform, as reported by the
 * platform itself. DATA: the string is whatever the platform returned; MOS
 * records it, echoes it and never interprets its internal structure (§3 —
 * the platform's state remains external; MOS keeps the record of what the
 * platform SAID).
 */
export type PlatformPostRef = Branded<string, "PlatformPostRef">;
