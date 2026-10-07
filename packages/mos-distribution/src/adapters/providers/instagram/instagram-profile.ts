/**
 * Instagram provider profile (SOCIAL-003) — the ADAPTER SUBTREE's declared
 * DATA on the W6-C SOCIAL-001 contract. See README.md (this subtree) for
 * every claim's basis in full.
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
export const INSTAGRAM_PROVIDER_ID = "provider:instagram" as ProviderId;

/**
 * The Instagram provider profile (DATA): container-based image/video/
 * carousel publishing with IMAGE-only scheduled publication (the only
 * publicly-documented scheduling surface — video/carousel scheduling is
 * outside the declared shapes, observation-pending), publicly-documented
 * insights metrics, and delete + list-restrictions UNKNOWN (no
 * confidently-known public surfaces — observation-pending). Auth model
 * KIND: OAuth2 (the platform operator's public authorization surface),
 * escrowed by the integrations module — NEVER credentials here.
 */
const profile: SocialProviderProfile = {
  providerId: INSTAGRAM_PROVIDER_ID,
  displayName: "Instagram",
  capabilityMatrix: [
    {
      operation: "publish",
      support: "supported",
      note: "publicly-documented container-based content publishing surface (photo, video and carousel media)",
    },
    {
      operation: "schedule",
      support: "supported",
      note: "publicly-documented scheduled publication of IMAGE posts; video/carousel scheduling is outside the declared shapes (observation-pending)",
    },
    {
      operation: "read-observations",
      support: "supported",
      note: "publicly-documented insights/metrics surface for business accounts (media metrics)",
    },
    {
      operation: "delete",
      support: "unknown",
      note: "no confidently-known public deletion surface for published media — observation-pending",
    },
    {
      operation: "list-restrictions",
      support: "unknown",
      note: "no publicly-known per-account restriction-listing surface — observation-pending",
    },
  ],
  auth: {
    model: { kind: "oauth2", managedBy: "integrations" },
    flows: ["authorization-code"],
    basis:
      "public knowledge of the platform operator's OAuth 2.0 authorization-code surface (with long-lived token exchange) — see README.md; a KIND declaration only, never credentials",
  },
  operationShapes: [
    {
      operation: "publish",
      shapes: ["image-post", "image-carousel", "video-upload"],
      acceptedArtifactTypeFamilies: ["image", "video"],
      acceptedPresentationKinds: ["single-artifact", "artifact-with-caption"],
      basis:
        "the platform's public content publishing API documents photo posts, multi-item carousels and video posts; the adapter declares ONLY those shapes (other platform surfaces, e.g. stories, are not declared here — observation-pending)",
      note: "text-only and link-preview presentations, and text-family artifacts, are outside the declared shapes — typed refusal before any provider interaction",
    },
    {
      operation: "schedule",
      shapes: ["image-post"],
      acceptedArtifactTypeFamilies: ["image"],
      acceptedPresentationKinds: ["single-artifact", "artifact-with-caption"],
      basis:
        "the platform's public content publishing API documents scheduled publication for IMAGE posts only; video and carousel scheduling is not confidently known and is deliberately outside the declared shapes (observation-pending)",
      note: "a video artifact against schedule is a typed operation-shape-unsupported refusal, never a guessed video schedule",
    },
  ],
  evidenceBasis:
    "declared from public platform developer-documentation knowledge at this codebase's authoring horizon; the sandbox performs NO live-platform verification; no endpoint URLs, rate-limit numbers or error taxonomies are invented — see README.md for each claim's basis and the UNKNOWN disclaimers",
};

/** The frozen profile DATA (deep-frozen; the binding re-validates on construction). */
export const INSTAGRAM_PROVIDER_PROFILE: SocialProviderProfile = deepFreeze(profile);
