/**
 * ProviderTransport port (INTEG-001 — the declared transport seam).
 *
 * The single seam through which a provider call leaves the control plane.
 * Real adapters (HTTP/GraphQL/websocket stacks for actual providers) are
 * FUTURE composition-root work — NO real network exists in this package
 * (test-pinned: no network-capable module imports anywhere in the source).
 * The shipped adapter is a DISCLOSED deterministic in-memory double; its
 * responses label themselves (every §30 record names the transport source)
 * so double output can never masquerade as live provider evidence
 * (AGENTS.md "Mocks/doubles can test contracts but cannot be represented
 * as live provider or production proof").
 *
 * The request carries the CredentialRef HANDLE — real transport adapters
 * resolve the handle at the secret-store seam HERE, at the boundary;
 * credential values never appear in the control plane (compile-time
 * exact-keyset pin: the request has no credential-value field).
 *
 * Port files never import @zcode/* (boundary rule PORTS-NO-ZCODE).
 */

import type {
  CapabilityId,
  JsonObject,
  ProviderId,
  TenantScope,
  Version,
} from "@mos/contracts";

import type {
  CredentialRef,
  MerchantClientInstanceId,
  ProviderInteractionId,
  ProviderImplementationId,
} from "../contracts/ids.js";
import type {
  ProviderInteractionFailure,
  ProviderInteractionWarning,
} from "../contracts/interaction.js";

/** One outbound provider call at the transport seam. */
export interface ProviderTransportRequest {
  /** §30 request id (the same id the audit record carries). */
  readonly requestId: ProviderInteractionId;
  readonly scope: TenantScope;
  /** Provider identity (data — routing never branches on vendor names in code). */
  readonly providerId: ProviderId;
  readonly implementationId: ProviderImplementationId;
  readonly capabilityId: CapabilityId;
  readonly capabilityVersion: Version;
  readonly instanceId: MerchantClientInstanceId;
  /** Credential HANDLE ONLY — resolved at the secret-store seam by real adapters. */
  readonly credentialRef: CredentialRef;
  /** Small control-plane parameters (§6: large media travels as storage refs). */
  readonly parameters: JsonObject;
}

/** The transport's response to one outbound provider call. */
export type ProviderTransportResponse =
  | {
      readonly ok: true;
      /** The provider's output payload (data). */
      readonly output: JsonObject;
      /** Non-fatal warnings from the transport/provider (§30 warnings). */
      readonly warnings: readonly ProviderInteractionWarning[];
      /**
       * Honest self-label naming the adapter that produced this response
       * (e.g. "in-memory-transport-double"); copied onto the §30 record.
       */
      readonly source: string;
    }
  | {
      readonly ok: false;
      readonly failure: ProviderInteractionFailure;
      readonly source: string;
    };

/**
 * The transport seam. 1 public method (policy budget: 12).
 */
export interface ProviderTransportPort {
  /**
   * Performs one outbound provider call. Adapters are synchronous in this
   * wave (the disclosed double performs no I/O); async transports are a
   * composition-root adapter concern, not a contract change.
   */
  send(request: ProviderTransportRequest): ProviderTransportResponse;
}
