/**
 * X provider profile (SOCIAL-006) — the ADAPTER SUBTREE's declared DATA
 * on the W6-C SOCIAL-001 contract. See README.md (this subtree) for every
 * claim's basis in full.
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
export const X_PROVIDER_ID = "provider:x" as ProviderId;

/**
 * The X provider profile (DATA): publicly-documented posting of text,
 * image-media and video-media posts, publicly-documented public post
 * metrics and post deletion, and schedule + list-restrictions UNKNOWN (no
 * confidently-known first-party public scheduling surface; no
 * publicly-known restriction-listing surface — observation-pending). Auth
 * model KIND: OAuth2 (the platform operator's public authorization
 * surface with PKCE), escrowed by the integrations module — NEVER
 * credentials here.
 */
const profile: SocialProviderProfile = {
  providerId: X_PROVIDER_ID,
  displayName: "X",
  capabilityMatrix: [
    {
      operation: "publish",
      support: "supported",
      note: "publicly-documented posting surface (text posts and posts with image or video media)",
    },
    {
      operation: "schedule",
      support: "unknown",
      note: "no confidently-known first-party public scheduling surface at the authoring horizon — observation-pending (third-party schedulers and ads surfaces are not this surface)",
    },
    {
      operation: "read-observations",
      support: "supported",
      note: "publicly-documented public post metrics (impressions, likes, reposts and related reported metrics)",
    },
    {
      operation: "delete",
      support: "supported",
      note: "publicly-documented post deletion surface",
    },
    {
      operation: "list-restrictions",
      support: "unknown",
      note: "no publicly-known per-account restriction-listing surface — observation-pending",
    },
  ],
  auth: {
    model: { kind: "oauth2", managedBy: "integrations" },
    flows: ["authorization-code-with-pkce"],
    basis:
      "public knowledge of the platform operator's OAuth 2.0 user-context authorization surface with PKCE — see README.md; a KIND declaration only, never credentials",
  },
  operationShapes: [
    {
      operation: "publish",
      shapes: ["text-post", "image-post", "video-upload"],
      acceptedArtifactTypeFamilies: ["text", "image", "video"],
      acceptedPresentationKinds: ["single-artifact", "artifact-with-caption", "link-preview", "text-only"],
      basis:
        "the platform's public posting API documents text posts and posts carrying image or video media; links ride inside post text (the link-preview presentation renders from the text), so every presentation kind of the closed vocabulary is accepted for the declared families",
      note: "artifact types with no family in the closed vocabulary (e.g. audio) are unmappable — they fail closed against EVERY shape declaration, typed refusal before any provider interaction",
    },
  ],
  evidenceBasis:
    "declared from public platform developer-documentation knowledge at this codebase's authoring horizon; the sandbox performs NO live-platform verification; no endpoint URLs, rate-limit numbers or error taxonomies are invented — see README.md for each claim's basis and the UNKNOWN disclaimers",
};

/** The frozen profile DATA (deep-frozen; the binding re-validates on construction). */
export const X_PROVIDER_PROFILE: SocialProviderProfile = deepFreeze(profile);
