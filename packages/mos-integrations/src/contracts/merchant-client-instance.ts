/**
 * MerchantClientInstance — layer 3 of the connector provider contract
 * (INTEG-001): a tenant-scoped NAMED instance binding a provider
 * implementation to a merchant/client identity.
 *
 * CREDENTIAL DISCIPLINE (structurally pinned): this record is
 * REFERENCE-ONLY. It carries a {@link CredentialRef} — an opaque HANDLE —
 * and has NO credential value surface of any kind. No field of
 * MerchantClientInstance (nor of any other record in this package) can
 * carry a credential value; the compile-time exact-keys pin
 * (contracts/type-pins.ts) and the runtime strict-shape validation
 * (unexpected own properties are rejected fail-closed, so a smuggled
 * `secret`/`token`/`password` field cannot enter the control plane) both
 * enforce this. The handle resolves ONLY at the declared substrate
 * secret-store seam (`ProviderSecretStorePort`, disclosed in-memory double
 * now) — the boundary where §31 places credentials ("least-privilege and
 * remain at integration boundaries"). The control plane never resolves it.
 */

import type {
  AccountRef,
  IdentityRef,
  TenantScope,
  Timestamp,
  Version,
} from "@mos/contracts";

import type {
  CredentialRef,
  MerchantClientInstanceId,
  ProviderImplementationId,
} from "./ids.js";

// ---------------------------------------------------------------------------
// MerchantClientInstance (layer 3)
// ---------------------------------------------------------------------------

/**
 * Layer 3 — a tenant-scoped named instance binding ONE implementation of a
 * provider to ONE merchant/client identity.
 *
 * Versioned append-only: `recordRebind` appends a new record version when
 * the binding changes (e.g. tracking a new implementation version after a
 * status correction); prior versions stay resolvable. Instance names are
 * unique per tenant (fail-closed duplicates).
 */
export interface MerchantClientInstance {
  /** Registry record identity (stable across versions). */
  readonly id: MerchantClientInstanceId;
  /** Monotonic record version (append-only rebinds). */
  readonly version: Version;
  /** Tenant/workspace scope (§31). */
  readonly scope: TenantScope;
  /** Tenant-facing instance name (unique within the tenant). */
  readonly name: string;
  /** The merchant/client identity principal that owns this connection. */
  readonly merchantIdentity: IdentityRef;
  /**
   * The merchant's account boundary AT the provider, when one is named
   * (canonical `AccountRef`; optional — some connections are
   * account-agnostic).
   */
  readonly externalAccount?: AccountRef;
  /** WHICH implementation this instance binds. */
  readonly implementationId: ProviderImplementationId;
  /**
   * The EXACT implementation record version bound. Explicit staleness by
   * design: rebinding is the only way to track a newer implementation
   * version — instances never silently float to "latest" (no silent
   * substitution, the STUDIO-007 discipline).
   */
  readonly implementationVersion: Version;
  /**
   * Opaque credential HANDLE into the substrate secret-store seam. The ONLY
   * credential-adjacent field in the entire control plane; a value, not a
   * reference, cannot be expressed here (structurally pinned).
   */
  readonly credentialRef: CredentialRef;
  /** When this record version was created. */
  readonly createdAt: Timestamp;
}

/** Input for registering a merchant/client instance (layer 3). */
export interface RegisterMerchantClientInstanceInput {
  /** Optional record id (minted when omitted). */
  readonly id?: MerchantClientInstanceId;
  readonly scope: TenantScope;
  readonly name: string;
  readonly merchantIdentity: IdentityRef;
  readonly externalAccount?: AccountRef;
  readonly implementationId: ProviderImplementationId;
  readonly implementationVersion: Version;
  /**
   * Credential handle that MUST resolve at the secret-store seam
   * (fail-closed otherwise: a binding to a non-existent credential escrow
   * is invalid, never silently carried).
   */
  readonly credentialRef: CredentialRef;
}

/**
 * An append-only rebinding: appends a new instance record version pointing
 * at the given implementation (id and/or version). The prior binding stays
 * resolvable; §30 records issued before the rebind keep naming the
 * implementation version that actually served them.
 */
export interface MerchantClientRebindInput {
  readonly scope: TenantScope;
  readonly instanceId: MerchantClientInstanceId;
  readonly implementationId: ProviderImplementationId;
  readonly implementationVersion: Version;
}
