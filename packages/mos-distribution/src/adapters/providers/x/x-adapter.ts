/**
 * X transport binding (SOCIAL-006) — this adapter subtree's binding to the
 * {@link SocialTransportPort} seam: the shared provider binding machinery
 * (adapters/provider-transport-binding.ts) instantiated with the X
 * profile DATA.
 *
 * DISCLOSED DOUBLE: the binding performs NO I/O — the provider interaction
 * delegates to the disclosed in-memory transport double over
 * caller-supplied route tables, and every response self-labels with
 * {@link X_TRANSPORT_SOURCE} so double output can never masquerade as
 * live X evidence (AGENTS.md Verification). The binding enforces, inside
 * this subtree, BEFORE any provider interaction:
 * - the profile's own capability declaration (adapter-level fail-closed —
 *   declared unsupported/unknown operations are typed refusals even if a
 *   channel registration declares otherwise);
 * - the profile's declared operation shapes (text-post / image-post /
 *   video-upload × text+image+video families — artifact types with no
 *   family in the closed vocabulary, e.g. audio, fail closed against
 *   every declaration);
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

import { X_PROVIDER_PROFILE } from "./x-profile.js";

/** The honest self-label every response of this binding carries. */
export const X_TRANSPORT_SOURCE = `${X_PROVIDER_PROFILE.providerId as string}-transport-double`;

/** Options for {@link createXTransportBinding} (the profile is bound here). */
export type XTransportBindingOptions = Omit<ProviderTransportBindingOptions, "profile">;

/** Creates the X transport binding (a disclosed double — no I/O). */
export function createXTransportBinding(
  options: XTransportBindingOptions = {},
): ProviderTransportBinding {
  return createProviderTransportBinding({ ...options, profile: X_PROVIDER_PROFILE });
}
