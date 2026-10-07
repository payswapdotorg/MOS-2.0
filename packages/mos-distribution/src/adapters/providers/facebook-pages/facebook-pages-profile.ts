/**
 * Facebook Pages provider profile (SOCIAL-004) — the ADAPTER SUBTREE's
 * declared DATA on the W6-C SOCIAL-001 contract. See README.md (this
 * subtree) for every claim's basis in full.
 *
 * CONSERVATIVE DECLARATION DISCIPLINE: every entry below is made only from
 * PUBLIC platform knowledge at this codebase's authoring horizon; entries
 * not confidently known are declared `unknown` (observation-pending), never
 * guessed. NO endpoint URLs, rate-limit numbers, or error taxonomies are
 * fabricated anywhere in this profile — those specifics are deliberately
 * absent (the subtree README documents each claim's basis).
 */

import type { ProviderId } from "@mos/contracts";

import type { SocialProviderProfile } from "../../../contracts/provider-profile.js";
import { deepFreeze } from "../../registry-support.js";

/** The platform identity (DATA — the string names the external platform). */
export const FACEBOOK_PAGES_PROVIDER_ID = "provider:facebook-pages" as ProviderId;

/**
 * The Facebook Pages provider profile (DATA): page feed publishing of
 * text/link/photo/video posts with platform-confirmed scheduling (feed
 * post shapes — video scheduling observation-pending and outside the
 * declared shapes), publicly-documented page insights metrics and page
 * post deletion, and list-restrictions UNKNOWN (no publicly-known
 * per-page restriction-listing surface — observation-pending). Auth model
 * KIND: OAuth2 (the platform operator's public authorization surface),
 * escrowed by the integrations module — NEVER credentials here.
 */
const profile: SocialProviderProfile = {
  providerId: FACEBOOK_PAGES_PROVIDER_ID,
  displayName: "Facebook Pages",
  capabilityMatrix: [
    {
      operation: "publish",
      support: "supported",
      note: "publicly-documented page feed publishing surface (text, link, photo and video posts)",
    },
    {
      operation: "schedule",
      support: "supported",
      note: "publicly-documented scheduled publication of page feed posts (text/link/photo shapes; video scheduling is outside the declared shapes — observation-pending)",
    },
    {
      operation: "read-observations",
      support: "supported",
      note: "publicly-documented page insights/metrics surface (post and page metrics)",
    },
    {
      operation: "delete",
      support: "supported",
      note: "publicly-documented page post deletion surface",
    },
    {
      operation: "list-restrictions",
      support: "unknown",
      note: "no publicly-known per-page restriction-listing surface — observation-pending",
    },
  ],
  auth: {
    model: { kind: "oauth2", managedBy: "integrations" },
    flows: ["authorization-code"],
    basis:
      "public knowledge of the platform operator's OAuth 2.0 authorization-code surface (Login for the platform's business/page surfaces) — see README.md; a KIND declaration only, never credentials",
  },
  operationShapes: [
    {
      operation: "publish",
      shapes: ["text-post", "link-preview-post", "image-post", "video-upload"],
      acceptedArtifactTypeFamilies: ["text", "image", "video"],
      acceptedPresentationKinds: ["single-artifact", "artifact-with-caption", "link-preview", "text-only"],
      basis:
        "the platform's public page API documents publishing text posts, link posts, photo posts and video posts on a page feed; the adapter declares ONLY those shapes",
    },
    {
      operation: "schedule",
      shapes: ["text-post", "link-preview-post", "image-post"],
      acceptedArtifactTypeFamilies: ["text", "image"],
      acceptedPresentationKinds: ["single-artifact", "artifact-with-caption", "link-preview", "text-only"],
      basis:
        "the platform's public page API documents scheduled publication of page feed posts for the text/link/photo shapes; video scheduling is not confidently known and is deliberately outside the declared shapes (observation-pending)",
      note: "a video artifact against schedule is a typed operation-shape-unsupported refusal, never a guessed video schedule",
    },
  ],
  evidenceBasis:
    "declared from public platform developer-documentation knowledge at this codebase's authoring horizon; the sandbox performs NO live-platform verification; no endpoint URLs, rate-limit numbers or error taxonomies are invented — see README.md for each claim's basis and the UNKNOWN disclaimers",
};

/** The frozen profile DATA (deep-frozen; the binding re-validates on construction). */
export const FACEBOOK_PAGES_PROVIDER_PROFILE: SocialProviderProfile = deepFreeze(profile);
