/**
 * Facebook Pages transport binding (SOCIAL-004) — this adapter subtree's
 * binding to the {@link SocialTransportPort} seam: the shared provider
 * binding machinery (adapters/provider-transport-binding.ts) instantiated
 * with the Facebook Pages profile DATA.
 *
 * DISCLOSED DOUBLE: the binding performs NO I/O — the provider interaction
 * delegates to the disclosed in-memory transport double over
 * caller-supplied route tables, and every response self-labels with
 * {@link FACEBOOK_PAGES_TRANSPORT_SOURCE} so double output can never
 * masquerade as live Facebook Pages evidence (AGENTS.md Verification). The
 * binding enforces, inside this subtree, BEFORE any provider interaction:
 * - the profile's own capability declaration (adapter-level fail-closed —
 *   declared unsupported/unknown operations are typed refusals even if a
 *   channel registration declares otherwise);
 * - the profile's declared operation shapes (publish: text-post /
 *   link-preview-post / image-post / video-upload × text+image+video
 *   families; schedule: text/link/photo shapes — video scheduling is
 *   outside the declared shapes, observation-pending);
 * - the idempotency/replay discipline (same logical publish retried → ONE
 *   provider operation recorded; key reuse with changed parameters → typed
 *   `idempotency-key-conflict`);
 * - composition isolation (foreign providerId requests → typed
 *   `provider-adapter-mismatch`).
 *
 * A DECLAREDLY simulated rate-limit posture may be configured — it rides
 * ok responses as the `rateLimit` observation the adapter runtime types
 * into an immutable §30-style record (self-labeled, never live evidence).
 */

import { createProviderTransportBinding } from "../../provider-transport-binding.js";
import type { ProviderTransportBinding } from "../../provider-transport-binding.js";
import type { ProviderTransportBindingOptions } from "../../provider-transport-binding.js";

import { FACEBOOK_PAGES_PROVIDER_PROFILE } from "./facebook-pages-profile.js";

/** The honest self-label every response of this binding carries. */
export const FACEBOOK_PAGES_TRANSPORT_SOURCE = `${FACEBOOK_PAGES_PROVIDER_PROFILE.providerId as string}-transport-double`;

/** Options for {@link createFacebookPagesTransportBinding} (the profile is bound here). */
export type FacebookPagesTransportBindingOptions = Omit<ProviderTransportBindingOptions, "profile">;

/** Creates the Facebook Pages transport binding (a disclosed double — no I/O). */
export function createFacebookPagesTransportBinding(
  options: FacebookPagesTransportBindingOptions = {},
): ProviderTransportBinding {
  return createProviderTransportBinding({ ...options, profile: FACEBOOK_PAGES_PROVIDER_PROFILE });
}
