/**
 * YouTube provider profile (SOCIAL-002) — the ADAPTER SUBTREE's declared
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
export const YOUTUBE_PROVIDER_ID = "provider:youtube" as ProviderId;

/**
 * The YouTube provider profile (DATA): video-upload publishing with
 * platform-confirmed scheduling, publicly-documented analytics, deletion,
 * and list-restrictions UNKNOWN (no publicly-known per-channel
 * restriction-listing surface — observation-pending). Auth model KIND:
 * OAuth2 (the platform operator's public authorization surfaces), escrowed
 * by the integrations module — NEVER credentials here.
 */
const profile: SocialProviderProfile = {
  providerId: YOUTUBE_PROVIDER_ID,
  displayName: "YouTube",
  capabilityMatrix: [
    {
      operation: "publish",
      support: "supported",
      note: "publicly-documented video upload API surface (video uploads)",
    },
    {
      operation: "schedule",
      support: "supported",
      note: "publicly-documented scheduled-publish parameter on video uploads",
    },
    {
      operation: "read-observations",
      support: "supported",
      note: "publicly-documented analytics/reporting API surface (video metrics)",
    },
    {
      operation: "delete",
      support: "supported",
      note: "publicly-documented video deletion API surface",
    },
    {
      operation: "list-restrictions",
      support: "unknown",
      note: "no publicly-known per-channel restriction-listing surface — observation-pending",
    },
  ],
  auth: {
    model: { kind: "oauth2", managedBy: "integrations" },
    flows: ["authorization-code", "device"],
    basis:
      "public knowledge of the platform operator's OAuth 2.0 authorization surfaces (authorization-code with refresh; device flow for limited-input devices) — see README.md; a KIND declaration only, never credentials",
  },
  operationShapes: [
    {
      operation: "publish",
      shapes: ["video-upload"],
      acceptedArtifactTypeFamilies: ["video"],
      acceptedPresentationKinds: ["single-artifact", "artifact-with-caption"],
      basis:
        "the platform's public API surface documents video content uploads; the adapter declares ONLY the video-upload shape (other platform surfaces, e.g. channel community posts, are not declared here — observation-pending)",
      note: "text-only and link-preview presentations, and non-video artifact families, are outside the declared shapes — typed refusal before any provider interaction",
    },
    {
      operation: "schedule",
      shapes: ["video-upload"],
      acceptedArtifactTypeFamilies: ["video"],
      acceptedPresentationKinds: ["single-artifact", "artifact-with-caption"],
      basis: "the platform's public API surface documents scheduled publication of uploaded videos",
      note: "same shape family as publish — scheduling is a platform-confirmed future video publication",
    },
  ],
  evidenceBasis:
    "declared from public platform developer-documentation knowledge at this codebase's authoring horizon; the sandbox performs NO live-platform verification; no endpoint URLs, rate-limit numbers or error taxonomies are invented — see README.md for each claim's basis and the UNKNOWN disclaimers",
};

/** The frozen profile DATA (deep-frozen; the binding re-validates on construction). */
export const YOUTUBE_PROVIDER_PROFILE: SocialProviderProfile = deepFreeze(profile);
