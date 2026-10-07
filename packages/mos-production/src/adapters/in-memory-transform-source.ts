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

import { deepFreezeRecord } from "./registry-support.js";
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
  /** `${tenantId}\u0000${definitionId}` → versions ascending. */
  const byKey = new Map<string, Map<number, ResolvedPawnTransform>>();

  const source: InMemoryTransformSourceDouble = {
    register(seed: PawnTransformDefinitionSeed): ResolvedPawnTransform {
      const key = `${seed.tenantId as string}\u0000${seed.id as string}`;
      let versions = byKey.get(key);
      if (versions === undefined) {
        versions = new Map<number, ResolvedPawnTransform>();
        byKey.set(key, versions);
      }
      const nextVersion = ([...versions.keys()].at(-1) ?? 0) + 1;
      // DEEP-frozen snapshot (nested schemas/requirements stay immutable
      // through the returned record — pinned by registration tests).
      const record: ResolvedPawnTransform = deepFreezeRecord({
        ...seed,
        version: nextVersion as Version,
      });
      versions.set(nextVersion, record);
      return record;
    },
    listLatest(scope: TenantScope): readonly ResolvedPawnTransform[] {
      const prefix = `${scope.tenantId as string}\u0000`;
      const latest: ResolvedPawnTransform[] = [];
      for (const [key, versions] of byKey) {
        if (!key.startsWith(prefix)) continue;
        const top = [...versions.keys()].at(-1);
        if (top !== undefined) {
          latest.push(versions.get(top) as ResolvedPawnTransform);
        }
      }
      return latest;
    },
    async resolve(
      scope: TenantScope,
      definitionId: TransformId,
      version?: Version,
    ): Promise<ResolvedPawnTransform | null> {
      const versions = byKey.get(`${scope.tenantId as string}\u0000${definitionId as string}`);
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
