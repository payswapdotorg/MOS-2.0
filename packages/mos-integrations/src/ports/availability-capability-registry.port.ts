/**
 * AvailabilityCapabilityRegistry port (INTEG-001, layer 4).
 *
 * Registry of versioned, tenant-scoped EXPLICIT capability instances —
 * which capability a provider implementation makes available, at which
 * capability version, with what declared constraints. Port files never
 * import @zcode/*.
 *
 * Registry semantics:
 * - capability refs resolve through the @mos/capabilities vocabulary:
 *   registering an availability whose (capabilityId, capabilityVersion)
 *   does not resolve in the capability registry is a typed error
 *   (fail-closed — refs that resolve nowhere provide nothing, so they
 *   cannot be registered);
 * - immutable versioned snapshots keyed per (tenant, id); append-only:
 *   registering with a known id (same tenant) appends the next version
 *   (the correction path for constraint changes);
 * - registering requires the referenced implementation to exist IN THE
 *   SAME TENANT (fail-closed; cross-tenant ≡ unknown);
 * - EXPLICITNESS: nothing else creates availability. The definition's
 *   declared capability surface is declaration DATA; queries derive
 *   availability ONLY from these records (an instance without a
 *   capability record provides NOTHING — pinned by tests);
 * - every accessor takes the tenant scope (§31 no existence leaks).
 */

import type {
  AvailabilityCapability,
  RegisterAvailabilityCapabilityInput,
} from "../contracts/availability-capability.js";
import type { AvailabilityCapabilityId, ProviderImplementationId } from "../contracts/ids.js";
import type { TenantId, Version } from "@mos/contracts";

/** Registry of availability capabilities. 5 public methods (policy budget: 12). */
export interface AvailabilityCapabilityRegistryPort {
  /**
   * Registers one immutable availability snapshot (fresh id → version 1;
   * known id in the same tenant → next version, append-only). Fail-closed:
   * unknown implementation reference and unresolvable capability refs are
   * typed errors. Returns the frozen record.
   */
  register(input: RegisterAvailabilityCapabilityInput): AvailabilityCapability;

  /**
   * Resolves one exact version, or `undefined` when unknown IN THIS TENANT
   * (cross-tenant ≡ unknown).
   */
  get(
    tenantId: TenantId,
    availabilityId: AvailabilityCapabilityId,
    version: Version,
  ): AvailabilityCapability | undefined;

  /** Latest version, or `undefined` when unknown in this tenant. */
  getLatest(tenantId: TenantId, availabilityId: AvailabilityCapabilityId): AvailabilityCapability | undefined;

  /** All versions of one availability record, ascending; empty when unknown. */
  listVersions(tenantId: TenantId, availabilityId: AvailabilityCapabilityId): readonly Version[];

  /**
   * LATEST version of every availability record bound to one
   * implementation, insertion order. Empty when the implementation is
   * unknown in this tenant. This is the ONLY availability read the call
   * surface consumes — explicit records, nothing assumed.
   */
  listForImplementation(
    tenantId: TenantId,
    implementationId: ProviderImplementationId,
  ): readonly AvailabilityCapability[];
}
