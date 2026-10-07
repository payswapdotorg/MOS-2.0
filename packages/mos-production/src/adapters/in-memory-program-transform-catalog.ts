/**
 * The DISCLOSED in-memory transform catalog double (LAB-016) — the seam
 * implementation behind `ProgramTransformCatalogPort`.
 *
 * Not a production composition root: the composition root wires the REAL
 * `@mos/lab` `TransformDefinitionRegistry.listTransformDefinitions` behind
 * the seam with a ONE-LINE DELEGATION (compat/program-search-compat.ts
 * pins the delegation view; compat/program-real-stack.test.ts exercises
 * it at runtime). This double serves deterministic contract testing:
 *
 * - tenant-scoped listings (cross-tenant registrations are invisible —
 *   unknown and cross-tenant are indistinguishable);
 * - definitions are stored DEEP-FROZEN (clone-then-freeze ownership);
 * - registrations list in insertion order per tenant scope.
 */

import type { TenantScope } from "@mos/contracts";

import type { ResolvedPawnTransform } from "../ports/transform-source.port.js";
import type { ProgramTransformCatalogPort } from "../ports/program-transform-catalog.port.js";
import { deepFreezeRecord } from "./registry-support.js";

/** One seeded catalog entry: the scope the definition is visible in. */
export interface ProgramTransformCatalogSeed {
  readonly scope: TenantScope;
  readonly definition: ResolvedPawnTransform;
}

/** Options for {@link createInMemoryProgramTransformCatalog}. */
export interface InMemoryProgramTransformCatalogOptions {
  /** Initial seed entries (cloned + deep-frozen on registration). */
  readonly seeds?: readonly ProgramTransformCatalogSeed[];
}

/** The disclosed in-memory catalog double (with its registration surface). */
export interface InMemoryProgramTransformCatalogDouble
  extends ProgramTransformCatalogPort {
  /** Registers one definition in a tenant scope (clone-then-freeze). */
  register(scope: TenantScope, definition: ResolvedPawnTransform): void;
}

const scopeKey = (scope: TenantScope): string =>
  `${scope.tenantId as string}:${scope.workspaceId as string ?? ""}`;

const cloneTransform = (
  definition: ResolvedPawnTransform,
): ResolvedPawnTransform =>
  deepFreezeRecord(
    JSON.parse(JSON.stringify(definition)) as ResolvedPawnTransform,
  );

/** Creates the disclosed in-memory transform catalog double. */
export function createInMemoryProgramTransformCatalog(
  options: InMemoryProgramTransformCatalogOptions = {},
): InMemoryProgramTransformCatalogDouble {
  const byScope = new Map<string, ResolvedPawnTransform[]>();
  const store = (scope: TenantScope, definition: ResolvedPawnTransform): void => {
    const key = scopeKey(scope);
    const list = byScope.get(key) ?? [];
    list.push(cloneTransform(definition));
    byScope.set(key, list);
  };
  for (const seed of options.seeds ?? []) {
    store(seed.scope, seed.definition);
  }
  return {
    async listPromotedTransforms(
      scope: TenantScope,
    ): Promise<readonly ResolvedPawnTransform[]> {
      return [...(byScope.get(scopeKey(scope)) ?? [])];
    },
    register(scope: TenantScope, definition: ResolvedPawnTransform): void {
      store(scope, definition);
    },
  };
}
