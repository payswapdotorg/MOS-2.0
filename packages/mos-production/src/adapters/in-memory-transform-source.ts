/**
 * In-memory transform source double (LAB-013) — DISCLOSED DOUBLE of the
 * transform-source seam over the LAB-011/012 vocabulary.
 *
 * Holds versioned transform definitions (tenant-scoped, append-only — the
 * double mirrors the registry read semantics: exact version or latest,
 * `null` for unknown AND cross-tenant, indistinguishable). Definition
 * records satisfy {@link ResolvedPawnTransform}: the canonical
 * `Transform` contract plus the declared kind. The composition root wires
 * the REAL `@mos/lab` transform definition registry behind the same seam
 * (one-line delegation, disclosed); the compat test runs pawn executions
 * against REAL lab definitions.
 */

import type { TenantId, TenantScope, Transform, TransformId, Version } from "@mos/contracts";

import { cloneThenFreezeRecord } from "./registry-support.js";
import type { PawnTransformKind } from "../contracts/pawn-role.js";
import type {
  PawnTransformSourcePort,
  ResolvedPawnTransform,
} from "../ports/transform-source.port.js";

/** A definition seed: the canonical transform fields plus kind + tenant. */
export interface PawnTransformDefinitionSeed extends Transform {
  readonly kind: PawnTransformKind;
  readonly tenantId: TenantId;
}

/** Options for the in-memory transform source double. */
export interface InMemoryTransformSourceOptions {
  /** Initial definitions (registering appends version 1; same id appends +1). */
  readonly definitions?: readonly PawnTransformDefinitionSeed[];
}

/** The in-memory transform source (plus its registration surface). */
export interface InMemoryTransformSourceDouble extends PawnTransformSourcePort {
  /** Registers (or revises — version + 1) one definition for its tenant. */
  register(seed: PawnTransformDefinitionSeed): ResolvedPawnTransform;
  /** All latest definitions for a tenant (registration order). */
  listLatest(scope: TenantScope): readonly ResolvedPawnTransform[];
}

/** Creates the in-memory {@link PawnTransformSourcePort} double. */
export function createInMemoryTransformSource(
  options: InMemoryTransformSourceOptions = {},
): InMemoryTransformSourceDouble {
  /** The stored record: the resolved transform plus its owning tenant (the
   * seed carries the tenant; the W9-B exact-equality listing reads it). */
  type StoredTransform = ResolvedPawnTransform & { readonly tenantId: TenantId };

  /** JSON array keys `[tenantId, definitionId]` → versions ascending (W9-B:
   * injective over the tuple — hostile delimiter-laden tenant ids cannot
   * alias another tenant's definitions; the W3-A hostile-id-factory class). */
  const byKey = new Map<string, Map<number, StoredTransform>>();

  const keyOf = (tenantId: string, definitionId: string): string =>
    JSON.stringify([tenantId, definitionId]);

  const source: InMemoryTransformSourceDouble = {
    register(seed: PawnTransformDefinitionSeed): ResolvedPawnTransform {
      const key = keyOf(seed.tenantId as string, seed.id as string);
      let versions = byKey.get(key);
      if (versions === undefined) {
        versions = new Map<number, StoredTransform>();
        byKey.set(key, versions);
      }
      const nextVersion = ([...versions.keys()].at(-1) ?? 0) + 1;
      // DEEP-frozen PRIVATE snapshot (W9-B clone-then-freeze: nested schemas
      // and requirement objects stay immutable through the returned record
      // AND the caller's seed objects are never frozen in place — pinned by
      // the registration tests).
      const record: StoredTransform = cloneThenFreezeRecord({
        ...seed,
        version: nextVersion as Version,
      });
      versions.set(nextVersion, record);
      return record;
    },
    listLatest(scope: TenantScope): readonly ResolvedPawnTransform[] {
      const latest: ResolvedPawnTransform[] = [];
      for (const [, versions] of byKey) {
        // W9-B: EXACT tenant equality on the stored record (never a prefix
        // scan — a delimiter-laden tenant id must not widen the match).
        const top = [...versions.keys()].at(-1);
        if (top === undefined) continue;
        const record = versions.get(top);
        if (record === undefined) continue;
        if ((record.tenantId as string) !== (scope.tenantId as string)) continue;
        latest.push(record);
      }
      return latest;
    },
    async resolve(
      scope: TenantScope,
      definitionId: TransformId,
      version?: Version,
    ): Promise<ResolvedPawnTransform | null> {
      const versions = byKey.get(keyOf(scope.tenantId as string, definitionId as string));
      if (versions === undefined) return null;
      if (version === undefined) {
        const top = [...versions.keys()].at(-1);
        return top === undefined ? null : (versions.get(top) ?? null);
      }
      return versions.get(version as number) ?? null;
    },
  };

  for (const seed of options.definitions ?? []) {
    source.register(seed);
  }
  return source;
}
