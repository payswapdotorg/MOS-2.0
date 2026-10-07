/**
 * ProviderImplementationRegistry port (INTEG-001, layer 2).
 *
 * Registry of versioned, tenant-scoped provider implementations — concrete
 * implementations of definitions, carrying status (available | unavailable
 * | degraded | unknown — UNKNOWN preserved first-class, never coerced) and
 * evidence refs. Port files never import @zcode/*.
 *
 * Registry semantics:
 * - immutable versioned snapshots keyed per (tenant, id); append-only:
 *   status corrections (and re-registrations with a known id) append the
 *   next version; prior versions — with their prior statuses — stay
 *   resolvable (history is never rewritten);
 * - registering requires the referenced definition id + version to exist
 *   IN THE SAME TENANT (fail-closed; cross-tenant ≡ unknown);
 * - registering/correcting into `available` or `degraded` requires at
 *   least one evidence ref (positive claims need evidence);
 * - every accessor takes the tenant scope: cross-tenant ≡ unknown (§31 no
 *   existence leaks).
 */

import type {
  ProviderImplementation,
  ProviderStatusCorrectionInput,
  RegisterProviderImplementationInput,
} from "../contracts/provider-implementation.js";
import type { ProviderImplementationId } from "../contracts/ids.js";
import type { ProviderDefinitionId } from "../contracts/ids.js";
import type { TenantId, Version } from "@mos/contracts";

/** Registry of provider implementations. 6 public methods (policy budget: 12). */
export interface ProviderImplementationRegistryPort {
  /**
   * Registers one immutable implementation snapshot (fresh id → version 1;
   * known id in the same tenant → next version, append-only). Fail-closed:
   * unknown definition reference, evidence rule violations and closed
   * vocabulary violations are typed errors. Returns the frozen record.
   */
  register(input: RegisterProviderImplementationInput): ProviderImplementation;

  /**
   * Resolves one exact version, or `undefined` when unknown IN THIS TENANT
   * (cross-tenant ≡ unknown). The returned status is VERBATIM — `unknown`
   * is never coerced.
   */
  get(
    tenantId: TenantId,
    implementationId: ProviderImplementationId,
    version: Version,
  ): ProviderImplementation | undefined;

  /** Latest version, or `undefined` when unknown in this tenant (status verbatim). */
  getLatest(tenantId: TenantId, implementationId: ProviderImplementationId): ProviderImplementation | undefined;

  /** All versions of one implementation, ascending; empty when unknown. */
  listVersions(tenantId: TenantId, implementationId: ProviderImplementationId): readonly Version[];

  /**
   * Latest version of every implementation OF one definition (definition
   * versions are NOT filtered — implementations of any version of the
   * definition are listed), insertion order. Empty when the definition is
   * unknown in this tenant.
   */
  listForDefinition(tenantId: TenantId, definitionId: ProviderDefinitionId): readonly ProviderImplementation[];

  /**
   * Appends a NEW version of the implementation carrying the corrected
   * status and evidence (append-only: the prior version stays resolvable
   * with its original status). Fail-closed on the same evidence rule.
   */
  recordStatusCorrection(input: ProviderStatusCorrectionInput): ProviderImplementation;
}
