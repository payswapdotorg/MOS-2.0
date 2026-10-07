/**
 * MerchantClientInstanceRegistry port (INTEG-001, layer 3).
 *
 * Registry of versioned, tenant-scoped merchant/client instances — named
 * bindings of implementations to merchant identities carrying a
 * CredentialRef HANDLE ONLY (credential values never enter the control
 * plane; the handle resolves at the declared secret-store seam). Port
 * files never import @zcode/*.
 *
 * Registry semantics:
 * - immutable versioned snapshots keyed per (tenant, id); append-only:
 *   rebinding appends the next version; prior bindings stay resolvable;
 * - registering requires the referenced implementation id + version to
 *   exist IN THE SAME TENANT and the credential handle to RESOLVE at the
 *   secret-store seam (fail-closed both ways);
 * - STRICT SHAPE: registering a record carrying any property beyond the
 *   MerchantClientInstance field set is a typed error — a smuggled
 *   credential value field (`secret`, `token`, ...) cannot enter the
 *   control plane through this registry (runtime twin of the compile-time
 *   exact-keyset pin in contracts/type-pins.ts);
 * - instance names are unique per tenant;
 * - every accessor takes the tenant scope: cross-tenant ≡ unknown (§31 no
 *   existence leaks).
 */

import type {
  MerchantClientInstance,
  MerchantClientRebindInput,
  RegisterMerchantClientInstanceInput,
} from "../contracts/merchant-client-instance.js";
import type { MerchantClientInstanceId } from "../contracts/ids.js";
import type { TenantId, Version } from "@mos/contracts";

/** Registry of merchant/client instances. 6 public methods (policy budget: 12). */
export interface MerchantClientInstanceRegistryPort {
  /**
   * Registers one immutable instance snapshot (fresh id → version 1; known
   * id in the same tenant → next version, append-only). Fail-closed: strict
   * shape (no credential-value surface), unknown implementation reference,
   * unresolved credential handle and duplicate names are typed errors.
   * Returns the frozen record.
   */
  register(input: RegisterMerchantClientInstanceInput): MerchantClientInstance;

  /**
   * Resolves one exact version, or `undefined` when unknown IN THIS TENANT
   * (cross-tenant ≡ unknown).
   */
  get(
    tenantId: TenantId,
    instanceId: MerchantClientInstanceId,
    version: Version,
  ): MerchantClientInstance | undefined;

  /** Latest version, or `undefined` when unknown in this tenant. */
  getLatest(tenantId: TenantId, instanceId: MerchantClientInstanceId): MerchantClientInstance | undefined;

  /** All versions of one instance, ascending; empty when unknown. */
  listVersions(tenantId: TenantId, instanceId: MerchantClientInstanceId): readonly Version[];

  /** All instance ids registered in this tenant (insertion order). */
  listForTenant(tenantId: TenantId): readonly MerchantClientInstanceId[];

  /**
   * Appends a NEW version of the instance bound to the given implementation
   * id + version (append-only: the prior binding stays resolvable — §30
   * records keep naming the implementation version that actually served
   * them). Fail-closed: the new reference must exist in this tenant.
   */
  recordRebind(input: MerchantClientRebindInput): MerchantClientInstance;
}
