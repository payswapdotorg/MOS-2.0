/**
 * Social provider profile contract (SOCIAL-002..006) — the DATA SHAPE every
 * per-provider adapter subtree declares ON the W6-C SOCIAL-001 contract.
 *
 * A {@link SocialProviderProfile} is PROVIDER-AUTHORED DATA, not code: the
 * platform identity, the per-operation capability matrix (the W6-C
 * `SocialProviderCapability` vocabulary — parity is never assumed), the
 * publicly-known AUTH MODEL KIND (the canonical `AuthenticationModel` of
 * `@mos/contracts` — a KIND declaration, NEVER a credential value; there is
 * structurally no credential field), the publicly-known OPERATION SHAPES the
 * platform's API surface documents (video upload vs image carousel vs text
 * post — coarse shapes, never invented endpoint URLs or parameter names),
 * and the CLAIM BASIS of every declaration.
 *
 * REAL API/AUTH CONTRACT EVIDENCE DISCIPLINE (the frozen backlog
 * acceptance): every declaration is CONSERVATIVE — made only from PUBLIC
 * platform knowledge and documented with its basis in the declaring
 * subtree's README. Where a platform's support for an MOS operation is not
 * confidently known from public knowledge, the profile declares `unknown`
 * (observation-pending) — never a guessed `supported`, never an invented
 * specific. NO FABRICATED PROVIDER INTERNALS: no endpoint URLs, no
 * rate-limit numbers, no error taxonomies appear in any profile; those are
 * either publicly-known-and-cited or deliberately absent.
 *
 * AUTHORITY DISCIPLINE (test-pinned, extended per provider in W7-C): this
 * CONTRACT is provider-neutral — no provider name or provider-specific type
 * appears here. The five real-platform profiles live as DATA inside their
 * ISOLATED adapter subtrees (src/adapters/providers/<provider>/), and a
 * structural battery pins that provider specifics never appear in the
 * shared authority-facing surface (contracts/, ports/, shared adapters,
 * errors, index) and never cross subtrees.
 */

import type {
  AuthenticationModel,
  ProviderId,
} from "@mos/contracts";

import type { SocialProviderCapability } from "./social-operation.js";
import type { SocialPresentationKind } from "./social-operation.js";

// ---------------------------------------------------------------------------
// Closed vocabularies (provider-neutral; profiles select from them as DATA)
// ---------------------------------------------------------------------------

/**
 * The closed vocabulary of coarse, publicly-known OPERATION SHAPES a
 * provider's publishing API surface can declare: which category of content
 * object the platform's documented publishing surface accepts. Deliberately
 * coarse — "video upload vs image carousel vs text post" (the backlog's
 * acceptance wording) — never a vendor feature name, never an endpoint, never
 * a parameter list.
 */
export const SOCIAL_OPERATION_SHAPES = Object.freeze([
  "video-upload",
  "image-post",
  "image-carousel",
  "text-post",
  "link-preview-post",
] as const);

/** One of the {@link SOCIAL_OPERATION_SHAPES} entries. */
export type SocialOperationShape = (typeof SOCIAL_OPERATION_SHAPES)[number];

/**
 * The closed vocabulary of coarse ARTIFACT TYPE FAMILIES a shape declaration
 * can accept. Families derive from the canonical artifact ref's MIME type by
 * a DOCUMENTED coarse mapping ({@link socialArtifactTypeFamily}: the
 * `type`/`subtype` prefix) — never content inference. Anything unmappable is
 * NOT a family and fails closed against every declaration.
 */
export const SOCIAL_ARTIFACT_TYPE_FAMILIES = Object.freeze([
  "video",
  "image",
  "text",
] as const);

/** One of the {@link SOCIAL_ARTIFACT_TYPE_FAMILIES} entries. */
export type SocialArtifactTypeFamily = (typeof SOCIAL_ARTIFACT_TYPE_FAMILIES)[number];

/**
 * The closed vocabulary of publicly-known AUTH FLOW KINDS a provider's public
 * authorization surface can declare (the auth model KIND as data — the
 * backlog's "OAuth2 device flow / user token kinds"). Coarse OAuth flow
 * categories only; credential VALUES never appear anywhere in a profile.
 */
export const SOCIAL_AUTH_FLOW_KINDS = Object.freeze([
  "authorization-code",
  "authorization-code-with-pkce",
  "device",
] as const);

/** One of the {@link SOCIAL_AUTH_FLOW_KINDS} entries. */
export type SocialAuthFlowKind = (typeof SOCIAL_AUTH_FLOW_KINDS)[number];

// ---------------------------------------------------------------------------
// The auth-model declaration (KIND as data — never credentials)
// ---------------------------------------------------------------------------

/**
 * The provider's declared AUTH MODEL: the canonical `AuthenticationModel`
 * (auth model KIND — e.g. "oauth2" — plus who escrows credentials) extended
 * with the publicly-known flow kinds and the claim's basis. Credential
 * VALUES never appear in a profile: the escrow happens at the integrations
 * boundary (layer-3 `MerchantClientInstance` CredentialRef handle), and the
 * W6-C credential discipline (credentials never enter the distribution
 * control plane) holds unchanged — the profile is the DECLARATION of the
 * model kind, nothing more.
 */
export interface SocialProviderAuthDeclaration {
  /**
   * The canonical authentication model (CORE-001 `AuthenticationModel`):
   * the auth model KIND string plus `managedBy`. For social provider
   * profiles `managedBy` is ` "integrations"` — validated fail-closed (the
   * credential escrow stays at the integration boundary).
   */
  readonly model: AuthenticationModel;
  /** The publicly-known flow kinds the platform's public API documents (data). */
  readonly flows: readonly SocialAuthFlowKind[];
  /** The claim's basis (public-knowledge statement — see the subtree README). */
  readonly basis: string;
}

// ---------------------------------------------------------------------------
// The operation-shape declaration (provider-specific parameters AS DATA)
// ---------------------------------------------------------------------------

/**
 * ONE declared operation-shape entry: for one artifact-carrying operation
 * (publish or schedule), which coarse SHAPES the platform's documented API
 * surface offers, which artifact type families it accepts, and which
 * presentation kinds it accepts. The per-provider adapter subtree validates
 * incoming operation parameters against THIS declaration (inside the
 * subtree — provider specifics never leak into authority-facing surfaces):
 * a request outside the declared shapes is a typed refusal BEFORE any
 * provider interaction.
 *
 * The three sets (shapes, families, kinds) are INDEPENDENT membership
 * constraints — both the artifact's family and the presentation's kind must
 * be declared accepted. How the platform actually renders an accepted
 * combination is OBSERVED behavior, never assumed.
 */
export interface SocialOperationShapeDeclaration {
  /** Which artifact-carrying operation the entry declares shapes for. */
  readonly operation: "publish" | "schedule";
  /** The coarse, publicly-known shapes the platform documents for it. */
  readonly shapes: readonly SocialOperationShape[];
  /** The artifact type families those shapes accept (coarse MIME families). */
  readonly acceptedArtifactTypeFamilies: readonly SocialArtifactTypeFamily[];
  /** The presentation kinds those shapes accept (the W6-C vocabulary). */
  readonly acceptedPresentationKinds: readonly SocialPresentationKind[];
  /** The claim's basis (public-knowledge statement — see the subtree README). */
  readonly basis: string;
  /** Optional free-form declaration note (data). */
  readonly note?: string;
}

// ---------------------------------------------------------------------------
// The provider profile (one per adapter subtree — DATA)
// ---------------------------------------------------------------------------

/**
 * The provider profile ONE adapter subtree declares ON the SOCIAL-001
 * contract: the platform identity, the per-operation capability matrix (one
 * `SocialProviderCapability` per closed-vocabulary operation — every
 * operation is declared explicitly; the conservative posture), the auth
 * model declaration, and the operation-shape declarations. Validated
 * fail-closed by `validateSocialProviderProfile` (see
 * adapters/provider-profile-validation.ts).
 */
export interface SocialProviderProfile {
  /** The social platform's identity — canonical `ProviderId` (DATA). */
  readonly providerId: ProviderId;
  /** Human-facing name for the platform (tenant-facing data). */
  readonly displayName: string;
  /**
   * The DECLARED capability matrix: EXACTLY one entry per operation of the
   * closed W6-C vocabulary (all five), each supported/unsupported/unknown —
   * declared CONSERVATIVELY from public platform knowledge (unknown beats
   * guessing). The tenant's channel registration carries this matrix; the
   * adapter's transport binding independently enforces it (adapter-level
   * fail-closed: an operation the ADAPTER declares unsupported/unknown is a
   * typed refusal even if a channel registration declares otherwise).
   */
  readonly capabilityMatrix: readonly SocialProviderCapability[];
  /** The declared auth model (KIND as data — never credentials). */
  readonly auth: SocialProviderAuthDeclaration;
  /**
   * The declared operation shapes for the artifact-carrying operations.
   * Every operation the matrix declares `supported` among
   * publish/schedule MUST carry a shape entry (validated); entries for
   * other operations are allowed as documentation and ignored.
   */
  readonly operationShapes: readonly SocialOperationShapeDeclaration[];
  /**
   * The profile's overall evidence-basis statement: where its declarations
   * come from (public platform knowledge at the authoring horizon), what is
   * deliberately UNKNOWN/observation-pending, and that no endpoint URLs,
   * rate-limit numbers or error taxonomies are fabricated anywhere. The
   * subtree README documents each claim's basis in full.
   */
  readonly evidenceBasis: string;
}

// ---------------------------------------------------------------------------
// The documented artifact-type family derivation
// ---------------------------------------------------------------------------

/**
 * Derives the coarse artifact type family from a canonical artifact ref's
 * MIME type: the `type`/`subtype` prefix, lowercased — `"video/mp4"` →
 * `"video"`, `"image/jpeg"` → `"image"`, `"text/plain"` → `"text"`. Returns
 * `null` for anything unmappable (no such family in the closed vocabulary):
 * unmappable types fail closed against EVERY shape declaration (a family
 * MOS cannot name is a family no provider accepts through this surface).
 *
 * DOCUMENTED COARSENESS: format-level constraints (codecs, dimensions,
 * containers) are NOT expressed here — where a platform documents narrower
 * format constraints, that level of specificity is deliberately absent
 * (observation-pending at the transport boundary), and the platform's own
 * response remains the authority on acceptance.
 */
export function socialArtifactTypeFamily(artifactType: string): SocialArtifactTypeFamily | null {
  const prefix = artifactType.split("/")[0]?.toLowerCase() ?? "";
  if (prefix === "video" || prefix === "image" || prefix === "text") {
    return prefix;
  }
  return null;
}
