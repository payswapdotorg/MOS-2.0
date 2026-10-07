/**
 * The X adapter subtree's public surface (SOCIAL-006): the provider
 * profile DATA + the transport binding factory. Subtree-local — reachable
 * through the package's `@mos/distribution/providers/x` subpath export
 * (the package's provider-neutral index deliberately carries no provider
 * specifics; provider composition happens here).
 */

export {
  createXTransportBinding,
  X_TRANSPORT_SOURCE,
} from "./x-adapter.js";
export type { XTransportBindingOptions } from "./x-adapter.js";
export {
  X_PROVIDER_ID,
  X_PROVIDER_PROFILE,
} from "./x-profile.js";
