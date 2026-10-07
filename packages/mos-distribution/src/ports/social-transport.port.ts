/**
 * SocialTransport port (SOCIAL-001) — the declared transport seam of the
 * social adapter.
 *
 * NO REAL NETWORK: the adapter runtime reaches social platforms ONLY
 * through this seam. The shipped adapter is a DISCLOSED deterministic
 * in-memory double (adapters/in-memory-social-transport.ts) — zero I/O,
 * pure function of (request, routes), self-labelling every response so
 * double output can never masquerade as live platform evidence
 * (AGENTS.md Verification). Real platform adapters (SOCIAL-002..006)
 * land at this same seam as provider DATA-driven implementations.
 *
 * MEDIA DISCIPLINE (§6/AGENTS.md "Media"): `parameters` is a JsonObject
 * of SMALL control-plane values — the artifact travels as its REFERENCE
 * (artifactId/version/storageRef/digest), never as media bytes.
 *
 * The credential handle NEVER travels here: this seam carries the
 * integrations `instanceRef` — the real transport adapter resolves the
 * instance and its CredentialRef at the substrate boundary where §31
 * places credentials; the distribution control plane carries the
 * reference only (structurally pinned).
 */

import type { JsonObject, ProviderId, TenantScope } from "@mos/contracts";
import type { MerchantClientInstanceId } from "@mos/integrations";

import type {
  SocialChannelId,
  SocialDistributionId,
} from "../contracts/ids.js";
import type { SocialOperation } from "../contracts/social-operation.js";
import type {
  SocialDistributionFailure,
  SocialWarning,
} from "../contracts/distribution-record.js";

/** One social transport call (the seam's request shape — frozen). */
export interface SocialTransportRequest {
  /** §30 request id (echoed on the §30 record). */
  readonly requestId: SocialDistributionId;
  /** Tenant/workspace scope (§31). */
  readonly scope: TenantScope;
  /** The platform identity to reach (DATA — the channel's providerId). */
  readonly providerId: ProviderId;
  /** The channel the operation acts through. */
  readonly channelRef: SocialChannelId;
  /**
   * The INTEGRATIONS binding (MerchantClientInstanceId) — credential
   * handles resolve at this boundary in a real adapter, never in the
   * distribution control plane.
   */
  readonly instanceRef: MerchantClientInstanceId;
  /** Which social operation is being transported. */
  readonly operation: SocialOperation;
  /** Small control-plane parameters (artifact REFS, presentation, subjects — never media). */
  readonly parameters: JsonObject;
}

/**
 * The seam's response: either a platform payload (DATA the platform
 * reported — post refs, metrics, restrictions; the adapter runtime
 * validates and types it, never invents it) or a typed transport
 * failure. Every response self-labels its `source`.
 */
export type SocialTransportResponse =
  | {
      readonly ok: true;
      /** The platform-reported payload (data — typed by the adapter runtime). */
      readonly output: JsonObject;
      /** Warnings to surface on the §30 record. */
      readonly warnings: readonly SocialWarning[];
      /** Honest source label (the disclosed double self-labels). */
      readonly source: string;
    }
  | {
      readonly ok: false;
      readonly failure: SocialDistributionFailure;
      /** Honest source label. */
      readonly source: string;
    };

/** The transport seam. 1 public method (policy budget: 12). */
export interface SocialTransportPort {
  /** Sends one social operation to the platform (through the seam). */
  send(request: SocialTransportRequest): SocialTransportResponse;
}
