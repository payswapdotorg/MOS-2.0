/**
 * The Instagram adapter subtree's public surface (SOCIAL-003): the provider
 * profile DATA + the transport binding factory. Subtree-local — reachable
 * through the package's `@mos/distribution/providers/instagram` subpath
 * export (the package's provider-neutral index deliberately carries no
 * provider specifics; provider composition happens here).
 */

export {
  createInstagramTransportBinding,
  INSTAGRAM_TRANSPORT_SOURCE,
} from "./instagram-adapter.js";
export type { InstagramTransportBindingOptions } from "./instagram-adapter.js";
export {
  INSTAGRAM_PROVIDER_ID,
  INSTAGRAM_PROVIDER_PROFILE,
} from "./instagram-profile.js";
