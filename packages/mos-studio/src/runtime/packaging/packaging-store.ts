/**
 * The append-only immutable version store of the canonical packaging
 * authority (STUDIO-013) — per-tenant maps of per-package-id version chains
 * with exact-equality keys on both levels (W9-B D1/D2: no
 * delimiter-injectable composite key exists and no listing can widen across
 * tenants), append-only registration (a version that already exists never
 * rewrites — version-conflict is a typed failure) and the tenant-scoped
 * browsing reads the operator surface (STUDIO-014) composes over.
 *
 * Extracted from packaging-authority.ts so the authority file stays within
 * the architecture file-size budget; the store owns ALL storage concerns.
 */

import type { TenantScope } from "@mos/contracts";

import type { StudioArtifactPackageId, StudioSessionId } from "../../contracts/refs.js";
import type { StudioArtifactPackage } from "../../contracts/studio-artifact-package.js";
import type { StudioPackagingFailure } from "../../contracts/artifact-packaging.js";
import type { StudioPackageSummary } from "../../ports/artifact-packaging.port.js";

/** The version-store handle of {@link createPackagingVersionStore}. */
export interface PackagingVersionStore {
  /** The live chain of one package id under one tenant (may be empty). */
  chainOf(scope: TenantScope, packageId: StudioArtifactPackageId): readonly StudioArtifactPackage[];
  /** Append-only registration — a version that already exists never rewrites. */
  registerVersion(
    scope: TenantScope,
    pkg: StudioArtifactPackage,
  ): { ok: true } | { ok: false; failure: StudioPackagingFailure };
  /** One composed version (exact version, or the latest when omitted). */
  getVersion(
    scope: TenantScope,
    packageId: StudioArtifactPackageId,
    version?: number,
  ): StudioArtifactPackage | undefined;
  /** All composed versions of one package id, ascending (append-only chain). */
  listPackageVersions(
    scope: TenantScope,
    packageId: StudioArtifactPackageId,
  ): readonly StudioArtifactPackage[];
  /** Tenant-scoped summaries of every package the store holds. */
  listSummaries(
    scope: TenantScope,
    filter?: { readonly sessionRef?: StudioSessionId },
  ): readonly StudioPackageSummary[];
  /** Test inspection: tenants present. */
  readonly tenants: readonly string[];
  /** Test inspection: package ids per tenant. */
  packageIdsOf(tenantId: string): readonly string[];
}

/** Create the append-only per-tenant version store (exact keys, D1/D2). */
export function createPackagingVersionStore(): PackagingVersionStore {
  /** tenantId → packageId → append-only version chain (D1/D2 exact keys). */
  const store = new Map<string, Map<string, StudioArtifactPackage[]>>();

  function chainOf(scope: TenantScope, packageId: StudioArtifactPackageId): readonly StudioArtifactPackage[] {
    const byTenant = store.get(String(scope.tenantId));
    return byTenant?.get(String(packageId)) ?? [];
  }

  function registerVersion(
    scope: TenantScope,
    pkg: StudioArtifactPackage,
  ): { ok: true } | { ok: false; failure: StudioPackagingFailure } {
    const tenantKey = String(scope.tenantId);
    let byTenant = store.get(tenantKey);
    if (byTenant === undefined) {
      byTenant = new Map<string, StudioArtifactPackage[]>();
      store.set(tenantKey, byTenant);
    }
    const packageKey = String(pkg.id);
    const chain = byTenant.get(packageKey) ?? [];
    const latest = chain.length > 0 ? (chain[chain.length - 1] as StudioArtifactPackage).version : 0;
    if (pkg.version <= latest) {
      return {
        ok: false,
        failure: {
          kind: "version-conflict",
          packageId: pkg.id,
          attemptedVersion: pkg.version,
          latestVersion: latest,
        },
      };
    }
    chain.push(pkg);
    byTenant.set(packageKey, chain);
    return { ok: true };
  }

  return {
    chainOf,
    registerVersion,
    getVersion(scope, packageId, version) {
      const chain = chainOf(scope, packageId);
      if (chain.length === 0) {
        return undefined;
      }
      if (version === undefined) {
        return chain[chain.length - 1];
      }
      return chain.find((pkg) => pkg.version === version);
    },
    listPackageVersions(scope, packageId) {
      return [...chainOf(scope, packageId)];
    },
    listSummaries(scope, filter) {
      const byTenant = store.get(String(scope.tenantId));
      if (byTenant === undefined) {
        return [];
      }
      const summaries: StudioPackageSummary[] = [];
      for (const chain of byTenant.values()) {
        const latest = chain[chain.length - 1];
        if (latest === undefined) {
          continue;
        }
        if (filter?.sessionRef !== undefined && latest.sessionRef !== filter.sessionRef) {
          continue;
        }
        summaries.push({
          packageId: latest.id,
          sessionRef: latest.sessionRef,
          latestVersion: latest.version,
          versionCount: chain.length,
        });
      }
      return summaries;
    },
    get tenants(): readonly string[] {
      return [...store.keys()];
    },
    packageIdsOf(tenantId: string): readonly string[] {
      return [...(store.get(String(tenantId))?.keys() ?? [])];
    },
  };
}
