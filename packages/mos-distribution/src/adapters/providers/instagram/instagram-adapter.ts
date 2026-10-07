/**
 * Instagram transport binding (SOCIAL-003) — this adapter subtree's binding
 * to the {@link SocialTransportPort} seam: the shared provider binding
 * machinery (adapters/provider-transport-binding.ts) instantiated with the
 * Instagram profile DATA.
 *
 * DISCLOSED DOUBLE: the binding performs NO I/O — the provider interaction
 * delegates to the disclosed in-memory transport double over
 * caller-supplied route tables, and every response self-labels with
 * {@link INSTAGRAM_TRANSPORT_SOURCE} so double output can never masquerade
 * as live Instagram evidence (AGENTS.md Verification). The binding
 * enforces, inside this subtree, BEFORE any provider interaction:
 * - the profile's own capability declaration (adapter-level fail-closed —
 *   declared unsupported/unknown operations are typed refusals even if a
 *   channel registration declares otherwise);
 * - the profile's declared operation shapes (publish: image-post /
 *   image-carousel / video-upload × image+video families; schedule:
 *   IMAGE-post only — video/carousel scheduling is outside the declared
 *   shapes, observation-pending);
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

import { INSTAGRAM_PROVIDER_PROFILE } from "./instagram-profile.js";

/** The honest self-label every response of this binding carries. */
export const INSTAGRAM_TRANSPORT_SOURCE = `${INSTAGRAM_PROVIDER_PROFILE.providerId as string}-transport-double`;

/** Options for {@link createInstagramTransportBinding} (the profile is bound here). */
export type InstagramTransportBindingOptions = Omit<ProviderTransportBindingOptions, "profile">;

/** Creates the Instagram transport binding (a disclosed double — no I/O). */
export function createInstagramTransportBinding(
  options: InstagramTransportBindingOptions = {},
): ProviderTransportBinding {
  return createProviderTransportBinding({ ...options, profile: INSTAGRAM_PROVIDER_PROFILE });
}
