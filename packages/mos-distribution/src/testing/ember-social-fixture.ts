/**
 * The ember-social FICTIONAL provider fixture (SOCIAL-002..006 shared
 * batteries) — the fourth fictional platform of the data seam (after
 * aurora-social / cinder-social / dune-social), used to exercise the
 * SHARED provider machinery (profile guard, transport binding) with DATA
 * that names no real platform: the machinery is provider-neutral and
 * DATA-driven; the five REAL platform profiles are pinned inside their
 * own adapter subtrees by their own batteries.
 *
 * The fictional profile is deliberately VIDEO-ONLY with schedule
 * UNSUPPORTED and read-observations/delete/list-restrictions UNKNOWN —
 * the matrix/shape postures the shared batteries need to probe
 * fail-closed/UNKNOWN behavior, replay scoping and rate-limit paths.
 */

import type { ProviderId } from "@mos/contracts";

import type { SocialProviderProfile } from "../contracts/provider-profile.js";
import type { InMemorySocialTransportRoute } from "../adapters/in-memory-social-transport.js";

/** The fictional platform identity (DATA — ember-social). */
export const EMBER_PROVIDER_ID = "provider:ember-social" as ProviderId;

/** The fictional platform-said ok payload the disclosed double routes (DATA). */
export const EMBER_OK_ROUTES: Readonly<Record<string, InMemorySocialTransportRoute>> = {
  [EMBER_PROVIDER_ID as string]: {
    kind: "ok",
    output: {
      postRef: "ember-post:fixture-1",
      publishedAt: "2026-06-01T00:00:05.000Z",
    },
  },
};

/** The fictional platform-said failing route (DATA — a fictional outage). */
export const EMBER_FAILING_ROUTES: Readonly<Record<string, InMemorySocialTransportRoute>> = {
  [EMBER_PROVIDER_ID as string]: { kind: "fail", message: "fictional ember outage" },
};

/**
 * A MINIMAL valid fictional profile (the shared batteries' baseline
 * DATA): video-only publish shapes, schedule UNSUPPORTED, and
 * read-observations/delete/list-restrictions UNKNOWN.
 */
export function emberProfile(overrides: {
  readonly capabilityMatrix?: SocialProviderProfile["capabilityMatrix"];
  readonly auth?: SocialProviderProfile["auth"];
  readonly operationShapes?: SocialProviderProfile["operationShapes"];
} = {}): SocialProviderProfile {
  return {
    providerId: EMBER_PROVIDER_ID,
    displayName: "Ember Social (fixture)",
    capabilityMatrix:
      overrides.capabilityMatrix ??
      ([
        { operation: "publish", support: "supported" },
        { operation: "schedule", support: "unsupported" },
        { operation: "read-observations", support: "unknown" },
        { operation: "delete", support: "unknown" },
        { operation: "list-restrictions", support: "unknown" },
      ] as unknown as SocialProviderProfile["capabilityMatrix"]),
    auth:
      overrides.auth ??
      {
        model: { kind: "oauth2", managedBy: "integrations" },
        flows: ["authorization-code"],
        basis: "fictional fixture basis — the shared battery's DATA",
      },
    operationShapes:
      overrides.operationShapes ??
      ([
        {
          operation: "publish",
          shapes: ["video-upload"],
          acceptedArtifactTypeFamilies: ["video"],
          acceptedPresentationKinds: ["single-artifact", "artifact-with-caption"],
          basis: "fictional fixture basis — video-only fictional platform",
        },
      ] as unknown as SocialProviderProfile["operationShapes"]),
    evidenceBasis: "fictional fixture evidence basis — the shared battery's DATA",
  };
}
