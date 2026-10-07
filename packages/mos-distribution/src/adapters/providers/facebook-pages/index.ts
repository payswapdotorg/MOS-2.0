/**
 * The Facebook Pages adapter subtree's public surface (SOCIAL-004): the
 * provider profile DATA + the transport binding factory. Subtree-local —
 * reachable through the package's `@mos/distribution/providers/facebook-pages`
 * subpath export (the package's provider-neutral index deliberately
 * carries no provider specifics; provider composition happens here).
 */

export {
  createFacebookPagesTransportBinding,
  FACEBOOK_PAGES_TRANSPORT_SOURCE,
} from "./facebook-pages-adapter.js";
export type { FacebookPagesTransportBindingOptions } from "./facebook-pages-adapter.js";
export {
  FACEBOOK_PAGES_PROVIDER_ID,
  FACEBOOK_PAGES_PROVIDER_PROFILE,
} from "./facebook-pages-profile.js";
