/**
 * The DISCLOSED in-memory organization source double (LAB-016) — the seam
 * implementation behind `ProgramOrganizationSourcePort`.
 *
 * Not a production composition root: the composition root wires the REAL
 * `@mos/agents` organization registry (and LAB-010-generated descriptors
 * registered back into it) behind the seam with a ONE-LINE DELEGATION
 * (compat/program-search-compat.ts pins that the real records satisfy the
 * descriptor shape directly). This double serves deterministic contract
 * testing:
 *
 * - tenant-scoped listings (cross-tenant registrations are invisible);
 * - descriptors are stored DEEP-FROZEN (clone-then-freeze ownership);
 * - registrations list in insertion order per tenant scope.
 */

import type { TenantScope } from "@mos/contracts";

import type {
  ProgramOrganizationDescriptor,
  ProgramOrganizationSourcePort,
} from "../ports/program-organization-source.port.js";
import { deepFreezeRecord } from "./registry-support.js";

/** Options for {@link createInMemoryProgramOrganizationSource}. */
export interface InMemoryProgramOrganizationSourceOptions {
  /** Initial seed descriptors (cloned + deep-frozen on registration). */
  readonly seeds?: readonly ProgramOrganizationDescriptor[];
}

/** The disclosed in-memory organization source double. */
export interface InMemoryProgramOrganizationSourceDouble
  extends ProgramOrganizationSourcePort {
  /** Registers one descriptor in its own tenant scope (clone-then-freeze). */
  register(descriptor: ProgramOrganizationDescriptor): void;
}

const scopeKey = (scope: TenantScope): string =>
  `${scope.tenantId as string}:${scope.workspaceId as string ?? ""}`;

const cloneDescriptor = (
  descriptor: ProgramOrganizationDescriptor,
): ProgramOrganizationDescriptor =>
  deepFreezeRecord(
    JSON.parse(JSON.stringify(descriptor)) as ProgramOrganizationDescriptor,
  );

/** Creates the disclosed in-memory organization source double. */
export function createInMemoryProgramOrganizationSource(
  options: InMemoryProgramOrganizationSourceOptions = {},
): InMemoryProgramOrganizationSourceDouble {
  const byScope = new Map<string, ProgramOrganizationDescriptor[]>();
  const store = (descriptor: ProgramOrganizationDescriptor): void => {
    const key = scopeKey({ tenantId: descriptor.tenantId });
    const list = byScope.get(key) ?? [];
    list.push(cloneDescriptor(descriptor));
    byScope.set(key, list);
  };
  for (const seed of options.seeds ?? []) {
    store(seed);
  }
  return {
    async listOrganizations(
      scope: TenantScope,
    ): Promise<readonly ProgramOrganizationDescriptor[]> {
      return [...(byScope.get(scopeKey(scope)) ?? [])];
    },
    register(descriptor: ProgramOrganizationDescriptor): void {
      store(descriptor);
    },
  };
}
