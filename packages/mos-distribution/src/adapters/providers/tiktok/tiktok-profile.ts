/**
 * TikTok provider profile (SOCIAL-005) — the ADAPTER SUBTREE's declared
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
export const TIKTOK_PROVIDER_ID = "provider:tiktok" as ProviderId;

/**
 * The TikTok provider profile (DATA): publicly-documented content posting
 * of video and photo posts, publicly-documented display of video-level
 * metrics, and schedule + delete + list-restrictions UNKNOWN (no
 * confidently-known public surfaces at the authoring horizon —
 * observation-pending). Auth model KIND: OAuth2 (the platform operator's
 * public authorization surface), escrowed by the integrations module —
 * NEVER credentials here.
 */
const profile: SocialProviderProfile = {
  providerId: TIKTOK_PROVIDER_ID,
  displayName: "TikTok",
  capabilityMatrix: [
    {
      operation: "publish",
      support: "supported",
      note: "publicly-documented content posting surface (video posts and photo posts)",
    },
    {
      operation: "schedule",
      support: "unknown",
      note: "no confidently-known first-party scheduling surface in the public posting API at the authoring horizon — observation-pending",
    },
    {
      operation: "read-observations",
      support: "supported",
      note: "publicly-documented display surface reporting video-level metrics (view/like/comment/share counts)",
    },
    {
      operation: "delete",
      support: "unknown",
      note: "no confidently-known public deletion surface at the authoring horizon — observation-pending",
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
      "public knowledge of the platform operator's OAuth 2.0 authorization-code surface (Login for the platform's developer surfaces) — see README.md; a KIND declaration only, never credentials",
  },
  operationShapes: [
    {
      operation: "publish",
      shapes: ["video-upload", "image-post"],
      acceptedArtifactTypeFamilies: ["video", "image"],
      acceptedPresentationKinds: ["single-artifact", "artifact-with-caption"],
      basis:
        "the platform's public content posting API documents video posts and photo posts; the adapter declares ONLY those shapes (other platform surfaces are not declared here — observation-pending)",
      note: "text-only and link-preview presentations, and text-family artifacts, are outside the declared shapes — typed refusal before any provider interaction",
    },
  ],
  evidenceBasis:
    "declared from public platform developer-documentation knowledge at this codebase's authoring horizon; the sandbox performs NO live-platform verification; no endpoint URLs, rate-limit numbers or error taxonomies are invented — see README.md for each claim's basis and the UNKNOWN disclaimers",
};

/** The frozen profile DATA (deep-frozen; the binding re-validates on construction). */
export const TIKTOK_PROVIDER_PROFILE: SocialProviderProfile = deepFreeze(profile);
