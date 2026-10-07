/**
 * The YouTube adapter subtree's public surface (SOCIAL-002): the provider
 * profile DATA + the transport binding factory. Subtree-local — reachable
 * through the package's `@mos/distribution/providers/youtube` subpath
 * export (the package's provider-neutral index deliberately carries no
 * provider specifics; provider composition happens here).
 */

export {
  createYouTubeTransportBinding,
  YOUTUBE_TRANSPORT_SOURCE,
} from "./youtube-adapter.js";
export type { YouTubeTransportBindingOptions } from "./youtube-adapter.js";
export {
  YOUTUBE_PROVIDER_ID,
  YOUTUBE_PROVIDER_PROFILE,
} from "./youtube-profile.js";
