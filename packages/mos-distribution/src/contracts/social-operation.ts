/**
 * Social operation vocabulary, declared presentation and the per-provider
 * capability matrix (SOCIAL-001).
 *
 * THE PROVIDER-NEUTRAL SOCIAL SURFACE: a DECLARED, closed set of what a
 * social platform interaction can be — publish, schedule,
 * read-observations, delete/retract, list-restrictions. Every operation is
 * typed with input contracts carrying CONTENT ARTIFACT REFS (never inline
 * media bytes in the control plane — §6/AGENTS.md "Media") and output
 * records carrying PLATFORM REFS + observed posture (what the platform
 * said, never what MOS wishes it had said).
 *
 * CAPABILITY MATRIX — parity is never assumed (backlog acceptance): every
 * social provider declares, per operation, a
 * {@link SocialProviderCapability} whose `support` is the INTEG-001
 * provider-contract vocabulary (`CapabilitySupportLevel` imported from
 * `@mos/integrations` — a registry-allowed dependency of distribution):
 * supported / unsupported / unknown.
 * - UNDECLARED operation → typed refusal `operation-not-declared`: the
 *   matrix is the declared surface and NOTHING outside it exists (never
 *   parity with another provider, never a default);
 * - declared `unsupported` → typed refusal `operation-unsupported`;
 * - declared `unknown` → its OWN typed outcome `operation-support-unknown`
 *   — preserved first-class and NEVER coerced to unsupported (the W5-C
 *   implementation-status-unknown discipline).
 *
 * CANONICAL CONTRACT RECONCILIATION (spec/contracts/core-contracts-v2.0.yaml
 * `SocialAdapter.required` = [provider, version, capabilityMatrix,
 * accountOperations, contentOperations, analyticsOperations,
 * publishingOperations, restrictionObservations] — the W2-A documented
 * pattern: the frozen YAML pins the field NAMES, the typed projection here
 * distributes them):
 * - `provider`/`version`/`capabilityMatrix` → the SocialChannel record
 *   (see social-channel.ts); its TYPED matrix is the operative surface;
 * - the canonical `capabilityMatrix: Record<string, boolean>` projection
 *   maps supported→true and unsupported→false; the `unknown` declaration
 *   has NO canonical boolean — which is exactly why the TYPED layer, never
 *   the boolean projection, is authoritative (a boolean projection of
 *   `unknown` would coerce it to false; the typed layer preserves it
 *   first-class with its own outcome);
 * - `publishingOperations` ↔ publish / schedule / delete;
 * - `analyticsOperations` ↔ read-observations;
 * - `restrictionObservations` ↔ list-restrictions;
 * - `accountOperations`/`contentOperations` ↔ the channel's integrations
 *   binding (the MerchantClientInstance account boundary) and the artifact
 *   refs carried on every publish/schedule input.
 */

import type {
  IdentityRef,
  JsonObject,
  TenantScope,
  Timestamp,
} from "@mos/contracts";
import type { ArtifactRef } from "@mos/content";
import type { CapabilitySupportLevel, RightsContextRef } from "@mos/integrations";
import type { RightsAction } from "@mos/rights";

import type { PlatformPostRef, SocialChannelId } from "./ids.js";

// ---------------------------------------------------------------------------
// The closed operation vocabulary (the provider-neutral social surface)
// ---------------------------------------------------------------------------

/**
 * The closed vocabulary of social operations the adapter surface exposes.
 * Deliberately provider-neutral: "which category of social interaction",
 * never "which vendor feature" — anything more specific is provider DATA.
 */
export const SOCIAL_OPERATIONS = Object.freeze([
  "publish",
  "schedule",
  "read-observations",
  "delete",
  "list-restrictions",
] as const);

/** One of the {@link SOCIAL_OPERATIONS} entries. */
export type SocialOperation = (typeof SOCIAL_OPERATIONS)[number];

// ---------------------------------------------------------------------------
// Declared presentation (small control-plane data, never media bytes)
// ---------------------------------------------------------------------------

/**
 * Generic presentation kinds a publication can declare. Provider-neutral:
 * how the artifact is intended to appear on the platform surface — the
 * concrete rendering is the platform's own behavior (observed, never
 * assumed).
 */
export const SOCIAL_PRESENTATION_KINDS = Object.freeze([
  "single-artifact",
  "artifact-with-caption",
  "link-preview",
  "text-only",
] as const);

/** One of the {@link SOCIAL_PRESENTATION_KINDS} entries. */
export type SocialPresentationKind = (typeof SOCIAL_PRESENTATION_KINDS)[number];

/**
 * The DECLARED presentation accompanying one published artifact: small
 * control-plane data only. There is structurally NO field through which
 * media bytes could enter (the artifact travels as an {@link ArtifactRef}
 * — a storage reference with digest; §6/AGENTS.md "Media").
 */
export interface DeclaredSocialPresentation {
  /** Generic presentation kind (provider-neutral closed vocabulary). */
  readonly kind: SocialPresentationKind;
  /** Caption text accompanying the artifact (small control-plane text). */
  readonly caption?: string;
  /** Free-form presentation parameters (small JSON DATA). */
  readonly parameters?: JsonObject;
}

// ---------------------------------------------------------------------------
// The capability matrix (SocialProviderCapability declarations)
// ---------------------------------------------------------------------------

/**
 * ONE declared capability-matrix entry: which social operation, and the
 * provider's own declared support for it — expressed in the INTEG-001
 * provider-contract vocabulary (`CapabilitySupportLevel` of
 * `@mos/integrations`). The declaration is provider-authored DATA; it is
 * the OPERATIVE surface for whether the operation can be invoked through
 * this channel (parity is never assumed — see module docblock).
 */
export interface SocialProviderCapability {
  /** Which social operation the entry declares support for. */
  readonly operation: SocialOperation;
  /** The declared support level (INTEG-001 vocabulary). */
  readonly support: CapabilitySupportLevel;
  /** Optional free-form declaration note (data, provider-authored). */
  readonly note?: string;
}

// ---------------------------------------------------------------------------
// The shared request frame (rights/policy gates precede every provider call)
// ---------------------------------------------------------------------------

/**
 * The frame EVERY adapter invocation carries: the tenant scope, the
 * channel being acted through, the §30 actor and the
 * {@link RightsContextRef} — the explicit rights frame under which the
 * operation is requested. There is no field-free path to a provider call:
 * the rights gate resolves the handle and fails closed without an
 * adequate grant (backlog acceptance: "rights/policy gates precede
 * provider calls").
 */
export interface SocialOperationRequest {
  /** Tenant/workspace scope (§31). */
  readonly scope: TenantScope;
  /** The social channel to act through (tenant-scoped; unknown → typed outcome). */
  readonly channelRef: SocialChannelId;
  /** §30 actor — the identity principal initiating the operation. */
  readonly actor: IdentityRef;
  /**
   * Rights frame handle: resolved by the rights gate against the REAL
   * `evaluateRights` rule of @mos/rights (fail-closed, denial reasons
   * verbatim). Reused INTEG-001 handle vocabulary (registry-allowed).
   */
  readonly rightsContextRef: RightsContextRef;
}

// ---------------------------------------------------------------------------
// Operation inputs (typed; artifact refs, never inline media)
// ---------------------------------------------------------------------------

/** Input of `publish`: one content artifact ref + declared presentation. */
export interface PublishSocialPostInput extends SocialOperationRequest {
  /**
   * The content artifact to publish — an ArtifactRef from the content
   * authority's publication surface (artifactId, version, digest,
   * storageRef, rightsRef, provenanceRef: REFERENCES ONLY; there is no
   * media-value field — structurally pinned).
   */
  readonly artifact: ArtifactRef;
  /** How the artifact is declared to be presented on the platform. */
  readonly presentation: DeclaredSocialPresentation;
}

/** Input of `schedule`: publish + time. */
export interface ScheduleSocialPostInput extends PublishSocialPostInput {
  /** When the publication is requested to go live (ISO-8601, validated). */
  readonly scheduledAt: Timestamp;
}

/** Input of `read-observations`: platform-reported metrics for one subject. */
export interface ReadSocialObservationsInput extends SocialOperationRequest {
  /**
   * WHAT to read observations about: a platform post ref or the channel's
   * account boundary (DATA string). Optional — absent means the channel
   * account itself.
   */
  readonly subjectRef?: string;
}

/** Input of `delete`: retract one platform post. */
export interface DeleteSocialPostInput extends SocialOperationRequest {
  /** The platform post to retract (the platform's own reference, DATA). */
  readonly postRef: PlatformPostRef;
}

/** Input of `list-restrictions`: read the platform's observed restrictions. */
export interface ListSocialRestrictionsInput extends SocialOperationRequest {}

// ---------------------------------------------------------------------------
// Rights-action mapping + subject derivations (documented, deterministic)
// ---------------------------------------------------------------------------

/**
 * The @mos/rights action each social operation exercises (frozen mapping).
 * The rights gate evaluates THIS action over the derived subject —
 * documented, deterministic, and never provider-specific.
 */
export const SOCIAL_OPERATION_RIGHTS_ACTIONS: Readonly<
  Record<SocialOperation, RightsAction>
> = Object.freeze({
  publish: "distribute",
  schedule: "distribute",
  delete: "distribute",
  "read-observations": "analyze",
  "list-restrictions": "analyze",
});

/**
 * Derives the rights SUBJECT of an artifact-carrying operation: the
 * artifact identity. §27 — every distribution of media must carry
 * rights/provenance context; grants must NAME the artifact being
 * distributed (explicit grants only, never URL accessibility).
 */
export function socialArtifactSubject(artifact: ArtifactRef): string {
  return `artifact:${artifact.artifactId as string}`;
}

/**
 * Derives the rights SUBJECT of a channel-scoped operation: the channel's
 * external account boundary when one is named, otherwise the channel
 * identity. Grants must NAME this subject explicitly (§27) — the
 * derivation is deterministic and documented (the W5-C
 * `providerInteractionSubject` pattern).
 */
export function socialChannelSubject(channel: {
  readonly id: SocialChannelId;
  readonly externalAccount?: unknown;
}): string {
  return channel.externalAccount !== undefined
    ? (channel.externalAccount as string)
    : `social-channel:${channel.id as string}`;
}

/** The timestamp input of a schedule request (echoed in §30 context). */
export type ScheduledAt = Timestamp;
