/**
 * ProviderDefinitionRegistry port (INTEG-001, layer 1).
 *
 * Registry of versioned, tenant-scoped provider definitions — WHAT each
 * provider IS. Port files never import @zcode/* (boundary rule
 * PORTS-NO-ZCODE) and carry NO provider specifics: provider identity is
 * record DATA (provider-neutral contracts only, test-pinned).
 *
 * Registry semantics:
 * - records are immutable versioned snapshots, keyed per (tenant, id):
 *   registering with a fresh id starts version 1; registering with an id
 *   that exists IN THE SAME TENANT appends the next version (append-only
 *   corrections; prior versions stay resolvable). A same-id record in
 *   ANOTHER tenant is an independent record — tenant-scoped ids are not
 *   globally unique;
 * - every accessor takes the tenant scope: cross-tenant lookups are
 *   indistinguishable from unknown ones (undefined / empty — §31 no
 *   existence leaks);
 * - registration is fail-closed: full required-field validation, closed
 *   vocabularies (kind, transport kind, support levels), duplicate
 *   capability entries in the declared surface rejected;
 * - definitions NEVER carry credentials (there is no such field).
 */

import type { ProviderDefinition } from "../contracts/provider-definition.js";
import type { ProviderDefinitionId } from "../contracts/ids.js";
import type { RegisterProviderDefinitionInput } from "../contracts/provider-definition.js";
import type { TenantId, Version } from "@mos/contracts";

/** Registry of provider definitions. 5 public methods (policy budget: 12). */
export interface ProviderDefinitionRegistryPort {
  /**
   * Registers one immutable definition snapshot (append-only versioning —
   * see module docblock). Fail-closed validation; returns the frozen
   * stored record.
   */
  register(input: RegisterProviderDefinitionInput): ProviderDefinition;

  /**
   * Resolves one exact version, or `undefined` when the definition is
   * unknown IN THIS TENANT (cross-tenant ≡ unknown — no existence leaks).
   */
  get(tenantId: TenantId, definitionId: ProviderDefinitionId, version: Version): ProviderDefinition | undefined;

  /** Latest version, or `undefined` when unknown in this tenant. */
  getLatest(tenantId: TenantId, definitionId: ProviderDefinitionId): ProviderDefinition | undefined;

  /** All versions of one definition, ascending; empty when unknown. */
  listVersions(tenantId: TenantId, definitionId: ProviderDefinitionId): readonly Version[];

  /** All definition ids registered in this tenant (insertion order). */
  listForTenant(tenantId: TenantId): readonly ProviderDefinitionId[];
}
