/**
 * ProviderSecretStore port (INTEG-001 — the declared substrate secret-store
 * seam).
 *
 * §31 (Multi-tenancy): "Credentials are least-privilege and remain at
 * integration boundaries." This port IS that boundary: the only place a
 * {@link CredentialRef} handle resolves to actual credential material.
 * The control plane (every registry, every record, every §30 audit entry)
 * carries the HANDLE only — there is no API on this port that returns a
 * credential VALUE to the control plane, and the transport seam receives
 * the handle (real transport adapters resolve it here, at the boundary).
 *
 * DISCLOSED DOUBLE: the in-memory adapter holds only handles + metadata —
 * it escrows NO real secret material and makes no secret-store claim
 * (durability, encryption and rotation are substrate/TL composition-root
 * work). Real substrate adapters (Zcode task/secret infrastructure or a
 * cloud secret store) implement this same port later.
 *
 * Port files never import @zcode/* (boundary rule PORTS-NO-ZCODE).
 */

import type { TenantScope } from "@mos/contracts";

import type { CredentialRef } from "../contracts/ids.js";

/**
 * The substrate secret-store seam. 2 public methods (policy budget: 12) —
 * deliberately minimal: declare a handle, test whether a handle resolves.
 * No method returns credential material into the control plane.
 */
export interface ProviderSecretStorePort {
  /**
   * Declars one credential escrow entry at the seam and returns its handle.
   * `kind` is DATA (e.g. an OAuth2 refresh-token escrow label); the real
   * substrate adapter fronts the platform's secret-enrollment flow here.
   * The returned {@link CredentialRef} is what layer-3 instances carry.
   */
  declare(input: {
    readonly scope: TenantScope;
    readonly displayName: string;
    readonly kind: string;
  }): CredentialRef;

  /**
   * Whether a handle resolves at the seam (used fail-closed by the
   * instance registry: binding an instance to a non-existent credential
   * escrow is invalid). NEVER returns credential material.
   */
  resolves(credentialRef: CredentialRef): boolean;
}
