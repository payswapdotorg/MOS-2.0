import type { TenantScope } from '@mos/contracts';
import type { StudioDirectoryPort } from '../dist/src/ports/studio-directory.js';
import type { StudioPackageLibraryPort } from '../dist/src/ports/studio-packages.js';
import { FIXTURE_PACKAGES, fixturePackageTenantId } from './studio-fixture-packages.js';
import { FIXTURE_SESSION_DETAILS } from './studio-fixture-session-details.js';
import { FIXTURE_SESSION_SUMMARIES } from './studio-fixture-sessions.js';
import {
  packageChainViewOf,
  packageSummaryViewOf,
  sameTenant,
  sessionDetailViewOf,
  sessionSummaryViewOf,
  studioDirectoryFailure,
  studioPackageLibraryFailure,
} from './studio-shape-adapter.js';

/**
 * DISCLOSED in-memory double for the Studio view ports (UX-002, over
 * STUDIO-014).
 *
 * Composition seam (OUTSIDE `src/`): implements the web package's
 * `StudioDirectoryPort` and `StudioPackageLibraryPort` by adapting the
 * REAL-shaped fixture records (`studio-surface-fixtures.ts` — data typed
 * against the REAL `@mos/studio` port shapes) through the shared shape
 * adapter. The studio runtime itself is node-side (`node:crypto` in
 * studio-runtime.ts) and cannot run in the browser bundle this composition
 * boots in; the node-only compat battery (`studio-real-shape-compat.test.ts`)
 * proves the adapter zero-drift over the REAL exported runtime instead.
 *
 * Read guards mirror the authority's own discipline: exact-tenant listing,
 * no existence leaks across tenants (§31), explicit typed failures — never
 * guessed data.
 *
 * Ephemeral scaffold, NOT production: the TL-owned composition root binds
 * the same ports over the MOS service transport without touching the port
 * or any view component.
 */

/** Options for {@link createInMemoryStudioSurface}. */
export interface InMemoryStudioSurfaceOptions {
  /**
   * Failure injection for the honest-unavailable states (route-level tests):
   * when set, `listStudioSessions` / `listStudioPackages` fail explicitly.
   */
  readonly failListings?: boolean;
}

/** The studio surface double: the two ports plus disclosed test observability. */
export interface InMemoryStudioSurface {
  readonly studioDirectory: StudioDirectoryPort;
  readonly studioPackages: StudioPackageLibraryPort;
  /** Fixture access for tests (frozen, read-only). */
  readonly fixtureSessionCount: () => number;
  readonly fixturePackageCount: () => number;
}

/**
 * Build the in-memory Studio surface over the REAL-shaped fixtures. The
 * session directory lists ascending by creation (the authority's own
 * ordering); the package library lists ascending by package id.
 */
export function createInMemoryStudioSurface(
  options: InMemoryStudioSurfaceOptions = {},
): InMemoryStudioSurface {
  const summariesByTenant = (scope: TenantScope) =>
    FIXTURE_SESSION_SUMMARIES.filter((summary) => sameTenant(scope, String(summary.tenantId))).sort(
      (a, b) => (String(a.createdAt) < String(b.createdAt) ? -1 : 1),
    );

  const packagesByTenant = (scope: TenantScope) =>
    FIXTURE_PACKAGES.filter((pkg) => sameTenant(scope, fixturePackageTenantId(pkg)));

  const studioDirectory: StudioDirectoryPort = {
    async listStudioSessions(scope: TenantScope) {
      if (options.failListings === true) {
        return studioDirectoryFailure(
          'studio-directory-unavailable',
          'the studio session directory service failed explicitly (injected)',
        );
      }
      return summariesByTenant(scope).map(sessionSummaryViewOf);
    },

    async loadStudioSessionDetail(sessionId: string, scope: TenantScope) {
      const summary = FIXTURE_SESSION_SUMMARIES.find(
        (candidate) =>
          String(candidate.sessionRef) === String(sessionId) &&
          sameTenant(scope, String(candidate.tenantId)),
      );
      // Unknown OR cross-tenant: the same explicit miss — no existence leak
      // across tenant boundaries (§31).
      if (summary === undefined) {
        return studioDirectoryFailure(
          'studio-session-not-found',
          `no studio session ${String(sessionId)} is visible in this tenant scope`,
        );
      }
      const source = FIXTURE_SESSION_DETAILS.get(String(sessionId));
      if (source === undefined) {
        return studioDirectoryFailure(
          'studio-directory-unavailable',
          `the studio session ${String(sessionId)} has no detail projection in this composition`,
        );
      }
      return sessionDetailViewOf(source);
    },
  };

  const studioPackages: StudioPackageLibraryPort = {
    async listStudioPackages(scope: TenantScope) {
      if (options.failListings === true) {
        return studioPackageLibraryFailure(
          'studio-package-library-unavailable',
          'the studio package library service failed explicitly (injected)',
        );
      }
      const byId = new Map<string, { latestVersion: number; versionCount: number; sessionRef: string }>();
      for (const pkg of packagesByTenant(scope)) {
        const entry = byId.get(String(pkg.id));
        if (entry === undefined) {
          byId.set(String(pkg.id), {
            latestVersion: pkg.version,
            versionCount: 1,
            sessionRef: String(pkg.sessionRef),
          });
        } else {
          entry.latestVersion = Math.max(entry.latestVersion, pkg.version);
          entry.versionCount += 1;
        }
      }
      return [...byId.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([packageId, entry]) =>
          packageSummaryViewOf({
            packageId: packageId as never,
            sessionRef: entry.sessionRef as never,
            latestVersion: entry.latestVersion,
            versionCount: entry.versionCount,
          }),
        );
    },

    async loadStudioPackageChain(packageId: string, scope: TenantScope) {
      const chain = FIXTURE_PACKAGES.filter(
        (pkg) =>
          String(pkg.id) === String(packageId) &&
          sameTenant(scope, fixturePackageTenantId(pkg)),
      );
      if (chain.length === 0) {
        return studioPackageLibraryFailure(
          'studio-package-not-found',
          `no artifact package ${String(packageId)} is visible in this tenant scope`,
        );
      }
      return packageChainViewOf(chain);
    },
  };

  return {
    studioDirectory,
    studioPackages,
    fixtureSessionCount: () => FIXTURE_SESSION_SUMMARIES.length,
    fixturePackageCount: () => FIXTURE_PACKAGES.length,
  };
}
