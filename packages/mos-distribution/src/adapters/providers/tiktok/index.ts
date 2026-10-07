/**
 * The TikTok adapter subtree's public surface (SOCIAL-005): the provider
 * profile DATA + the transport binding factory. Subtree-local — reachable
 * through the package's `@mos/distribution/providers/tiktok` subpath
 * export (the package's provider-neutral index deliberately carries no
 * provider specifics; provider composition happens here).
 */

export {
  createTikTokTransportBinding,
  TIKTOK_TRANSPORT_SOURCE,
} from "./tiktok-adapter.js";
export type { TikTokTransportBindingOptions } from "./tiktok-adapter.js";
export {
  TIKTOK_PROVIDER_ID,
  TIKTOK_PROVIDER_PROFILE,
} from "./tiktok-profile.js";
